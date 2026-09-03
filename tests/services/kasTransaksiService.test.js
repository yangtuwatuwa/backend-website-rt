import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

import pool from "../../config/sqlconfig.js";
import { seedAccount } from "../helpers/seed.js";
import {
    KasTransaksiError,
    catatPemasukanKasService,
    catatPengeluaranKasService,
    deleteKasTransaksiService,
    getKasMonthlyReportService,
    getKasRecapService,
    getKasSummaryService,
    getKasTransaksiListService,
    getKasYearlyReportService,
    updateKasTransaksiService,
} from "../../services/kasTransaksiService.js";

let actor;
let ownedFacadeCounter = 0;

function normalizeSql(sql) {
    return sql.replace(/\s+/g, " ").trim();
}

function createExecutorProxy(intercept) {
    const run = async (method, sql, params = []) => {
        const intercepted = await intercept?.({ method, sql, normalizedSql: normalizeSql(sql), params });
        if (intercepted?.handled) return intercepted.value;
        return globalThis.testDb[method](sql, params);
    };
    return {
        execute: jest.fn((sql, params = []) => run("execute", sql, params)),
        query: jest.fn((sql, params = []) => run("query", sql, params)),
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn(),
    };
}

function expectSavepointProtocol(executor, prefix, { rolledBack = false } = {}) {
    const querySql = executor.query.mock.calls.map(([sql]) => normalizeSql(sql));
    const executeSql = executor.execute.mock.calls.map(([sql]) => normalizeSql(sql));
    expect(querySql.some((sql) => sql.startsWith(`SAVEPOINT sp_${prefix}_`))).toBe(true);
    expect(querySql.some((sql) => sql.startsWith(`RELEASE SAVEPOINT sp_${prefix}_`))).toBe(true);
    if (rolledBack) {
        expect(querySql.some((sql) => sql.startsWith(`ROLLBACK TO SAVEPOINT sp_${prefix}_`))).toBe(true);
    }
    expect(executeSql.some((sql) => /^(SAVEPOINT|ROLLBACK TO SAVEPOINT|RELEASE SAVEPOINT)\b/.test(sql))).toBe(false);
}

function actorContext(overrides = {}) {
    return {
        actorId: actor.id,
        actorUsername: actor.username,
        actorRole: actor.role,
        ipAddress: "127.0.0.1",
        userAgent: "jest",
        ...overrides,
    };
}

function transactionInput(overrides = {}) {
    return {
        tanggal: "2026-08-17",
        deskripsi: "Kas kegiatan kemerdekaan",
        kategori_kas: "kegiatan",
        nominal: 150000,
        ...overrides,
    };
}

async function findTransaction(id) {
    const [rows] = await globalThis.testDb.execute("SELECT * FROM kas_transaksi WHERE id = ?", [id]);
    return rows[0] ?? null;
}

async function findAudits(id) {
    const [rows] = await globalThis.testDb.execute(
        "SELECT * FROM access_logs WHERE event_type LIKE 'KAS_TRANSAKSI_%' ORDER BY id ASC",
    );
    return rows.filter((row) => {
        try { return Number(JSON.parse(row.details).kas_transaksi_id) === Number(id); }
        catch { return false; }
    });
}

beforeEach(async () => {
    actor = await seedAccount(globalThis.testDb, { role: "bendahara" });
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe("Kas RT manual transactions", () => {
    it("menolak input invalid sebelum membuka savepoint", async () => {
        const executor = createExecutorProxy();
        await expect(catatPemasukanKasService(
            transactionInput({ tanggal: "2026-02-30", nominal: -1 }),
            actorContext(),
            executor,
        )).rejects.toBeInstanceOf(KasTransaksiError);
        expect(executor.query).not.toHaveBeenCalled();
        expect(executor.execute).not.toHaveBeenCalled();
    });

    it("mencatat pemasukan dan audit atomik melalui savepoint query", async () => {
        const executor = createExecutorProxy();
        const created = await catatPemasukanKasService(transactionInput(), actorContext(), executor);

        expect(created).toMatchObject({ tipe_mutasi: "masuk", kategori_kas: "kegiatan", nominal: 150000 });
        expect((await findTransaction(created.id)).deleted_at).toBeNull();
        const audits = await findAudits(created.id);
        expect(audits).toHaveLength(1);
        expect(audits[0].event_type).toBe("KAS_TRANSAKSI_CREATE");
        expect(JSON.parse(audits[0].details)).toMatchObject({ actor_id: actor.id, actor_role: "bendahara" });
        expectSavepointProtocol(executor, "kas_create");
    });

    it("mencatat pengeluaran tanpa menyimpan saldo per baris", async () => {
        const created = await catatPengeluaranKasService(
            transactionInput({ kategori_kas: "kebersihan", nominal: 75000 }),
            actorContext(),
            globalThis.testDb,
        );
        const stored = await findTransaction(created.id);
        expect(stored.tipe_mutasi).toBe("keluar");
        expect(stored).not.toHaveProperty("saldo");
        expect(stored).not.toHaveProperty("balance_after");
    });

    it("rollback insert ketika audit log gagal", async () => {
        const executor = createExecutorProxy(({ normalizedSql }) => {
            if (normalizedSql.startsWith("INSERT INTO access_logs")) throw new Error("Simulasi audit gagal");
            return undefined;
        });
        await expect(
            catatPemasukanKasService(transactionInput(), actorContext(), executor),
        ).rejects.toThrow("Simulasi audit gagal");
        const [rows] = await globalThis.testDb.execute(
            "SELECT * FROM kas_transaksi WHERE deskripsi = ?",
            [transactionInput().deskripsi],
        );
        expect(rows).toHaveLength(0);
        expectSavepointProtocol(executor, "kas_create", { rolledBack: true });
    });

    it("memperbarui transaksi, updated_by, dan audit before/after", async () => {
        const created = await catatPemasukanKasService(transactionInput(), actorContext(), globalThis.testDb);
        const updated = await updateKasTransaksiService(
            created.id,
            { nominal: 175000, kategori_kas: "donasi" },
            actorContext(),
            globalThis.testDb,
        );
        expect(updated).toMatchObject({ nominal: 175000, kategori_kas: "donasi", updated_by: actor.id });
        const audits = await findAudits(created.id);
        expect(audits.map((row) => row.event_type)).toEqual(["KAS_TRANSAKSI_CREATE", "KAS_TRANSAKSI_UPDATE"]);
        const details = JSON.parse(audits[1].details);
        expect(Number(details.before.nominal)).toBe(150000);
        expect(Number(details.after.nominal)).toBe(175000);
    });

    it("soft-delete transaksi dan mengecualikannya dari saldo serta list", async () => {
        const income = await catatPemasukanKasService(transactionInput(), actorContext(), globalThis.testDb);
        await catatPengeluaranKasService(transactionInput({ deskripsi: "Biaya ATK", nominal: 50000 }), actorContext(), globalThis.testDb);
        const deleted = await deleteKasTransaksiService(income.id, actorContext(), globalThis.testDb);

        expect(deleted.deletedId).toBe(income.id);
        expect((await findTransaction(income.id)).deleted_at).not.toBeNull();
        const summary = await getKasSummaryService({}, globalThis.testDb);
        expect(summary).toEqual({ jumlah_transaksi: 1, total_pemasukan: 0, total_pengeluaran: 50000, saldo_awal: 0, saldo_akhir: -50000 });
        const list = await getKasTransaksiListService({}, globalThis.testDb);
        expect(list.data.map((row) => row.id)).not.toContain(income.id);
        expect((await findAudits(income.id)).at(-1).event_type).toBe("KAS_TRANSAKSI_DELETE");
    });

    it("menerapkan filter keyword, tipe, kategori, tanggal, dan pagination", async () => {
        await catatPemasukanKasService(transactionInput({ tanggal: "2026-01-10", deskripsi: "Donasi warga", kategori_kas: "donasi" }), actorContext(), globalThis.testDb);
        await catatPengeluaranKasService(transactionInput({ tanggal: "2026-02-10", deskripsi: "Beli sapu", kategori_kas: "kebersihan" }), actorContext(), globalThis.testDb);

        const result = await getKasTransaksiListService({
            keyword: "Donasi",
            tipe_mutasi: "masuk",
            kategori: "donasi",
            date_from: "2026-01-01",
            date_to: "2026-01-31",
            page: 1,
            limit: 10,
        }, globalThis.testDb);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].deskripsi).toBe("Donasi warga");
        expect(result.pagination).toMatchObject({ total: 1, total_pages: 1 });
    });

    it("menghitung summary berdasarkan filter aktif", async () => {
        await catatPemasukanKasService(transactionInput({ tanggal: "2026-03-01", nominal: 300000 }), actorContext(), globalThis.testDb);
        await catatPengeluaranKasService(transactionInput({ tanggal: "2026-03-05", nominal: 125000 }), actorContext(), globalThis.testDb);
        await catatPemasukanKasService(transactionInput({ tanggal: "2025-03-01", nominal: 999999 }), actorContext(), globalThis.testDb);
        const summary = await getKasSummaryService({ date_from: "2026-03-01", date_to: "2026-03-31" }, globalThis.testDb);
        expect(summary).toEqual({ jumlah_transaksi: 2, total_pemasukan: 300000, total_pengeluaran: 125000, saldo_awal: 999999, saldo_akhir: 1174999 });
    });

    it("membuat laporan bulanan, tahunan 12 bulan, dan rekap kategori", async () => {
        await catatPemasukanKasService(transactionInput({ tanggal: "2026-01-02", kategori_kas: "donasi", nominal: 500000 }), actorContext(), globalThis.testDb);
        await catatPengeluaranKasService(transactionInput({ tanggal: "2026-01-03", kategori_kas: "kegiatan", nominal: 200000 }), actorContext(), globalThis.testDb);
        await catatPemasukanKasService(transactionInput({ tanggal: "2026-02-01", kategori_kas: "subsidi", nominal: 100000 }), actorContext(), globalThis.testDb);

        const monthly = await getKasMonthlyReportService({ tahun: 2026, bulan: 1 }, globalThis.testDb);
        expect(monthly.summary.saldo_akhir).toBe(300000);
        expect(monthly.transactions).toHaveLength(2);
        const yearly = await getKasYearlyReportService({ tahun: 2026 }, globalThis.testDb);
        expect(yearly.months).toHaveLength(12);
        expect(yearly.months[0].saldo).toBe(300000);
        expect(yearly.months[1].saldo).toBe(100000);
        const recap = await getKasRecapService({ tahun: 2026 }, globalThis.testDb);
        expect(recap.categories.map((row) => row.kategori_kas)).toEqual(["donasi", "kegiatan", "subsidi"]);
    });

    it("mengelola begin/commit/release saat service memiliki transaksi", async () => {
        const facadeSavepoint = `sp_test_owned_kas_transaksi_${++ownedFacadeCounter}`;
        const ownedConnection = {
            execute: jest.fn((sql, params = []) => globalThis.testDb.execute(sql, params)),
            query: jest.fn((sql, params = []) => globalThis.testDb.query(sql, params)),
            beginTransaction: jest.fn(() => globalThis.testDb.query(`SAVEPOINT ${facadeSavepoint}`)),
            commit: jest.fn(() => globalThis.testDb.query(`RELEASE SAVEPOINT ${facadeSavepoint}`)),
            rollback: jest.fn(async () => {
                await globalThis.testDb.query(`ROLLBACK TO SAVEPOINT ${facadeSavepoint}`);
                await globalThis.testDb.query(`RELEASE SAVEPOINT ${facadeSavepoint}`);
            }),
            release: jest.fn(),
        };
        jest.spyOn(pool, "getConnection").mockResolvedValue(ownedConnection);
        const result = await catatPemasukanKasService(transactionInput(), actorContext());
        expect(result.tipe_mutasi).toBe("masuk");
        expect(ownedConnection.beginTransaction).toHaveBeenCalledTimes(1);
        expect(ownedConnection.commit).toHaveBeenCalledTimes(1);
        expect(ownedConnection.rollback).not.toHaveBeenCalled();
        expect(ownedConnection.release).toHaveBeenCalledTimes(1);
    });
});
