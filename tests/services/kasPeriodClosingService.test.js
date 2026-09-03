import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import pool from "../../config/sqlconfig.js";
import mysql from "mysql2/promise";
import { checkRoles } from "../../middlewares/checkRole.js";
import { seedAccount } from "../helpers/seed.js";
import {
    KAS_CLOSING_ROLES, catatPemasukanKasService, catatPengeluaranKasService,
    closeKasPeriodService, deleteKasTransaksiService, getKasClosingHistoryService,
    getKasMonthlyReportService, getKasRecapService, getKasReportSummaryService,
    getKasSummaryService, getKasTransactionsForExportService, getKasYearlyReportService,
    updateKasTransaksiService,
} from "../../services/kasTransaksiService.js";

let actor;
beforeEach(async () => {
    const account = await seedAccount(globalThis.testDb, { role: "bendahara" });
    actor = { actorId: account.id, actorUsername: account.username, actorRole: account.role, ipAddress: "127.0.0.1", userAgent: "jest" };
});
afterEach(() => jest.restoreAllMocks());

const input = (tanggal, nominal, overrides = {}) => ({ tanggal, nominal, deskripsi: "Kas test tutup buku", kategori_kas: "donasi", ...overrides });
const income = (tanggal, nominal, overrides) => catatPemasukanKasService(input(tanggal, nominal, overrides), actor, globalThis.testDb);
const expense = (tanggal, nominal) => catatPengeluaranKasService(input(tanggal, nominal), actor, globalThis.testDb);
const close = (cutoff, extra = {}, executor = globalThis.testDb) => closeKasPeriodService({ periode_selesai: cutoff, ...extra }, actor, executor);
const allTransactions = async () => (await globalThis.testDb.execute("SELECT * FROM kas_transaksi ORDER BY id"))[0];

function executorProxy(intercept) {
    const run = async (method, sql, params = []) => {
        intercept?.(sql);
        return globalThis.testDb[method](sql, params);
    };
    return { execute: jest.fn((sql, params) => run("execute", sql, params)), query: jest.fn((sql, params) => run("query", sql, params)) };
}

describe("Kas RT period closing", () => {
    it("freezes first period, computes totals server-side, preserves every original transaction and writes detailed audit", async () => {
        await income("2025-01-02", 1000000);
        await expense("2025-01-31", 250000);
        await income("2025-02-01", 100000);
        const deleted = await income("2025-01-20", 999);
        await deleteKasTransaksiService(deleted.id, actor, globalThis.testDb);
        const before = await allTransactions();
        const summaryBefore = await getKasSummaryService({}, globalThis.testDb);
        const executor = executorProxy();
        const closing = await close("2025-01-31", { saldo_awal: 9999999, saldo_akhir: 1, total_pemasukan: 2, keterangan: "Tutup Januari" }, executor);
        expect(closing).toMatchObject({
            periode_mulai: "2025-01-02", periode_selesai: "2025-01-31", jumlah_transaksi: 2,
            saldo_awal: 0, total_pemasukan: 1000000, total_pengeluaran: 250000, saldo_akhir: 750000,
            ditutup_oleh: actor.actorId, ditutup_role: "bendahara", keterangan: "Tutup Januari", deleted_at: null,
        });
        expect(await allTransactions()).toEqual(before);
        expect(await getKasSummaryService({}, globalThis.testDb)).toEqual({
            jumlah_transaksi: 1, saldo_awal: 750000, total_pemasukan: 100000, total_pengeluaran: 0, saldo_akhir: summaryBefore.saldo_akhir,
        });
        const [[audit]] = await globalThis.testDb.execute("SELECT * FROM access_logs WHERE event_type = 'KAS_PERIOD_CLOSED'");
        expect(audit).toMatchObject({ username: actor.actorUsername, ip_address: "127.0.0.1", user_agent: "jest", status: "success" });
        expect(JSON.parse(audit.details)).toMatchObject({
            actor_id: actor.actorId, actor_role: "bendahara", kas_periode_tutup_buku_id: closing.id,
            periode_mulai: "2025-01-02", periode_selesai: "2025-01-31", saldo_akhir: "750000.00", previous_closing_id: null,
        });
        expect(JSON.parse(audit.details).timestamp).toBeTruthy();
        expect(executor.query.mock.calls.map(([sql]) => sql)).toEqual([
            expect.stringMatching(/^SAVEPOINT sp_kas_close_/), expect.stringMatching(/^RELEASE SAVEPOINT sp_kas_close_/),
        ]);
        expect(executor.execute.mock.calls.some(([sql]) => /^(UPDATE|DELETE|INSERT INTO) kas_transaksi\b/i.test(sql))).toBe(false);
    });

    it("carries the immediately preceding closing forward, including empty periods and zero current movements", async () => {
        await income("2025-01-10", 1000);
        await expense("2025-02-10", 300);
        const first = await close("2025-01-31");
        const second = await close("2025-02-28");
        const third = await close("2025-03-31");
        expect(second).toMatchObject({ periode_mulai: "2025-02-01", saldo_awal: first.saldo_akhir, total_pengeluaran: 300, saldo_akhir: 700 });
        expect(third).toMatchObject({ periode_mulai: "2025-03-01", saldo_awal: 700, jumlah_transaksi: 0, saldo_akhir: 700 });
        expect(await getKasSummaryService({}, globalThis.testDb)).toEqual({ jumlah_transaksi: 0, saldo_awal: 700, total_pemasukan: 0, total_pengeluaran: 0, saldo_akhir: 700 });
        const history = await getKasClosingHistoryService({ page: 2, limit: 1 }, globalThis.testDb);
        expect(history.data.map((row) => row.id)).toEqual([second.id]);
        expect(history.pagination).toEqual({ page: 2, limit: 1, total: 3, total_pages: 3 });
    });

    it("supports an empty first closing and the Jakarta date default", async () => {
        jest.useFakeTimers({ now: new Date("2025-05-01T18:00:00Z"), doNotFake: ["nextTick", "setImmediate", "setTimeout", "clearTimeout"] });
        try {
            const closing = await closeKasPeriodService({}, actor, globalThis.testDb);
            expect(closing).toMatchObject({ periode_mulai: "2025-05-02", periode_selesai: "2025-05-02", saldo_awal: 0, saldo_akhir: 0, jumlah_transaksi: 0 });
        } finally { jest.useRealTimers(); }
    });

    it("preserves monthly, yearly, recap and exported history through later closings with each period's own opening", async () => {
        await income("2024-12-05", 500);
        await income("2025-01-10", 1000);
        await expense("2025-02-10", 300);
        await income("2026-01-10", 900);
        await close("2024-12-31");
        const jan = await getKasMonthlyReportService({ tahun: 2025, bulan: 1 }, globalThis.testDb);
        const feb = await getKasMonthlyReportService({ tahun: 2025, bulan: 2 }, globalThis.testDb);
        const year = await getKasYearlyReportService({ tahun: 2025 }, globalThis.testDb);
        const recap = await getKasRecapService({ tahun: 2025 }, globalThis.testDb);
        const exported = await getKasTransactionsForExportService({}, globalThis.testDb);
        const exportSummary = await getKasReportSummaryService({}, globalThis.testDb);
        expect(jan.summary).toMatchObject({ saldo_awal: 500, saldo_akhir: 1500 });
        expect(feb.summary).toMatchObject({ saldo_awal: 1500, saldo_akhir: 1200 });
        expect(year.summary).toMatchObject({ saldo_awal: 500, saldo_akhir: 1200 });
        expect(year.months[1]).toMatchObject({ saldo_awal: 1500, saldo_akhir: 1200, saldo: -300 });
        await close("2025-01-31");
        await close("2025-12-31");
        await close("2026-01-31");
        expect(await getKasMonthlyReportService({ tahun: 2025, bulan: 1 }, globalThis.testDb)).toEqual(jan);
        expect(await getKasMonthlyReportService({ tahun: 2025, bulan: 2 }, globalThis.testDb)).toEqual(feb);
        expect(await getKasYearlyReportService({ tahun: 2025 }, globalThis.testDb)).toEqual(year);
        expect(await getKasRecapService({ tahun: 2025 }, globalThis.testDb)).toEqual(recap);
        expect(await getKasTransactionsForExportService({}, globalThis.testDb)).toEqual(exported);
        expect(await getKasReportSummaryService({}, globalThis.testDb)).toEqual(exportSummary);
        expect(await getKasSummaryService({ date_from: "2025-02-01", date_to: "2025-02-28" }, globalThis.testDb)).toEqual(feb.summary);
    });

    it("rejects duplicates, backward/overlapping ranges and skipped starts", async () => {
        await close("2025-01-31");
        for (const cutoff of ["2025-01-31", "2024-12-31"]) {
            await expect(close(cutoff)).rejects.toMatchObject({ status: 409, code: "KAS_CLOSING_OVERLAP" });
        }
        await expect(close("2025-02-28", { periode_mulai: "2025-01-15" })).rejects.toMatchObject({ code: "KAS_CLOSING_OVERLAP" });
        await expect(close("2025-02-28", { periode_mulai: "2025-02-02" })).rejects.toMatchObject({ code: "KAS_CLOSING_START_MISMATCH" });
        expect((await getKasClosingHistoryService({}, globalThis.testDb)).pagination.total).toBe(1);
    });

    it.each([
        ["2025-02-30", {}, "INVALID_DATE"], ["9999-12-31", {}, "KAS_FUTURE_CLOSING"],
        ["2025-01-31", { periode_mulai: "2025-02-01" }, "INVALID_DATE_RANGE"],
        ["2025-01-31", { keterangan: "x".repeat(2001) }, "FIELD_TOO_LONG"],
    ])("validates closing input before opening a savepoint (%s)", async (cutoff, extra, code) => {
        const executor = executorProxy();
        await expect(close(cutoff, extra, executor)).rejects.toMatchObject({ status: 400, code });
        expect(executor.query).not.toHaveBeenCalled();
    });

    it.each(["sekertaris", "sekretaris", "admin", "warga", "unknown"])("rejects %s at both the route guard and service", async (role) => {
        const executor = executorProxy();
        await expect(closeKasPeriodService({}, { ...actor, actorRole: role }, executor)).rejects.toMatchObject({ status: 403, code: "KAS_CLOSING_FORBIDDEN" });
        expect(executor.query).not.toHaveBeenCalled();
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();
        checkRoles(...KAS_CLOSING_ROLES)({ user: { role } }, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it.each(KAS_CLOSING_ROLES)("allows %s through the route guard and service", async (role) => {
        const next = jest.fn();
        checkRoles(...KAS_CLOSING_ROLES)({ user: { role } }, {}, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(await closeKasPeriodService({ periode_selesai: "2025-01-31" }, { ...actor, actorRole: role }, globalThis.testDb)).toMatchObject({ ditutup_role: role });
    });

    it("rolls back the snapshot when audit fails and preserves the caller's transaction", async () => {
        await income("2025-01-10", 100);
        const executor = executorProxy((sql) => { if (sql.includes("INSERT INTO access_logs")) throw new Error("audit unavailable"); });
        await expect(close("2025-01-31", {}, executor)).rejects.toThrow("audit unavailable");
        expect((await getKasClosingHistoryService({}, globalThis.testDb)).data).toEqual([]);
        expect(await allTransactions()).toHaveLength(1);
        expect(executor.query.mock.calls.map(([sql]) => sql)).toEqual([
            expect.stringMatching(/^SAVEPOINT sp_kas_close_/), expect.stringMatching(/^ROLLBACK TO SAVEPOINT sp_kas_close_/), expect.stringMatching(/^RELEASE SAVEPOINT sp_kas_close_/),
        ]);
        await expect(close("2025-01-31")).resolves.toMatchObject({ saldo_akhir: 100 });
    });

    it("blocks backdated inserts and changes/removals in closed periods but allows open-period corrections", async () => {
        const closed = await income("2025-01-01", 100);
        const open = await income("2025-02-01", 200);
        await close("2025-01-31");
        const before = await allTransactions();
        await expect(income("2025-01-31", 20)).rejects.toMatchObject({ code: "KAS_PERIOD_CLOSED" });
        await expect(expense("2024-12-01", 20)).rejects.toMatchObject({ code: "KAS_PERIOD_CLOSED" });
        await expect(updateKasTransaksiService(closed.id, { tanggal: "2025-03-01" }, actor, globalThis.testDb)).rejects.toMatchObject({ code: "KAS_PERIOD_CLOSED" });
        await expect(updateKasTransaksiService(open.id, { tanggal: "2025-01-31" }, actor, globalThis.testDb)).rejects.toMatchObject({ code: "KAS_PERIOD_CLOSED" });
        await expect(deleteKasTransaksiService(closed.id, actor, globalThis.testDb)).rejects.toMatchObject({ code: "KAS_PERIOD_CLOSED" });
        expect(await allTransactions()).toEqual(before);
        await updateKasTransaksiService(open.id, { nominal: 250 }, actor, globalThis.testDb);
        expect((await getKasSummaryService({}, globalThis.testDb)).saldo_akhir).toBe(350);
        await deleteKasTransaksiService(open.id, actor, globalThis.testDb);
        expect((await getKasSummaryService({}, globalThis.testDb)).saldo_akhir).toBe(100);
    });

    it("preserves cents and negative balances across closings", async () => {
        await expense("2025-01-02", 0.30);
        await income("2025-02-02", 0.10);
        await income("2025-02-03", 0.20);
        expect(await close("2025-01-31")).toMatchObject({ saldo_akhir: -0.3 });
        expect(await close("2025-02-28")).toMatchObject({ saldo_awal: -0.3, total_pemasukan: 0.3, saldo_akhir: 0 });
    });

    it("keeps category/search/type summaries as movement subtotals without adding the entire carried cash", async () => {
        await income("2025-01-02", 1000);
        await income("2025-02-02", 100, { kategori_kas: "subsidi" });
        await close("2025-01-31");
        expect(await getKasSummaryService({ kategori_kas: "subsidi" }, globalThis.testDb)).toMatchObject({ saldo_awal: 0, total_pemasukan: 100, saldo_akhir: 100 });
        expect(await getKasSummaryService({ kategori_kas: "donasi" }, globalThis.testDb)).toMatchObject({ saldo_awal: 0, jumlah_transaksi: 0, saldo_akhir: 0 });
    });

    it("commits and releases a service-owned closing transaction", async () => {
        const savepoint = "sp_test_owned_close";
        const connection = {
            execute: (sql, params) => globalThis.testDb.execute(sql, params),
            query: (sql, params) => globalThis.testDb.query(sql, params),
            beginTransaction: jest.fn(() => globalThis.testDb.query(`SAVEPOINT ${savepoint}`)),
            commit: jest.fn(() => globalThis.testDb.query(`RELEASE SAVEPOINT ${savepoint}`)),
            rollback: jest.fn(), release: jest.fn(),
        };
        jest.spyOn(pool, "getConnection").mockResolvedValue(connection);
        await closeKasPeriodService({ periode_selesai: "2025-01-31" }, actor);
        expect(connection.commit).toHaveBeenCalledTimes(1);
        expect(connection.release).toHaveBeenCalledTimes(1);
        expect(connection.rollback).not.toHaveBeenCalled();
    });

    it.each(["closing", "backdated entry", "closing after entry"])("serializes concurrent %s, even with an older read snapshot", async (operation) => {
        // Independent connections are necessary to exercise actual InnoDB locks.
        // Only this fixture is committed, and its exact IDs are removed in finally.
        const options = {
            host: process.env.TEST_DB_HOST, user: process.env.TEST_DB_USER,
            password: process.env.TEST_DB_PASSWORD ?? "", port: Number(process.env.TEST_DB_PORT ?? 3306),
            database: process.env.TEST_DB_NAME,
        };
        const first = await mysql.createConnection(options);
        const second = await mysql.createConnection(options);
        let fixture;
        let closing;
        let pending;
        try {
            await first.beginTransaction();
            await second.beginTransaction();
            await second.query("SELECT COUNT(*) FROM kas_periode_tutup_buku");
            fixture = await seedAccount(first, { role: "bendahara" });
            const context = { actorId: fixture.id, actorUsername: fixture.username, actorRole: fixture.role };
            if (operation === "closing after entry") {
                await catatPemasukanKasService(input("2025-01-31", 123), context, first);
            } else {
                closing = await closeKasPeriodService({ periode_selesai: "2025-01-31" }, context, first);
            }
            let reachedLock;
            const attempted = new Promise((resolve) => { reachedLock = resolve; });
            const concurrentExecutor = {
                query: (sql, params) => second.query(sql, params),
                execute: (sql, params) => {
                    const result = second.execute(sql, params);
                    if (sql.includes("FROM kas_buku_lock")) reachedLock();
                    return result;
                },
            };
            pending = (operation !== "backdated entry"
                ? closeKasPeriodService({ periode_selesai: "2025-01-31" }, context, concurrentExecutor)
                : catatPemasukanKasService(input("2025-01-31", 123), context, concurrentExecutor)
            ).then((value) => ({ value }), (error) => ({ error }));
            await attempted;
            await first.commit();
            const outcome = await pending;
            if (operation === "closing after entry") {
                expect(outcome.error).toBeUndefined();
                expect(outcome.value).toMatchObject({ saldo_awal: 0, total_pemasukan: 123, saldo_akhir: 123, jumlah_transaksi: 1 });
            } else {
                expect(outcome.error).toMatchObject({
                    status: 409, code: operation === "closing" ? "KAS_CLOSING_OVERLAP" : "KAS_PERIOD_CLOSED",
                });
                const [[count]] = await first.execute("SELECT COUNT(*) AS total FROM kas_periode_tutup_buku WHERE deleted_at IS NULL");
                expect(Number(count.total)).toBe(1);
            }
        } finally {
            await first.rollback();
            if (pending) await pending;
            await second.rollback();
            if (closing) await first.execute("DELETE FROM kas_periode_tutup_buku WHERE id = ?", [closing.id]);
            if (fixture) {
                await first.execute("DELETE FROM kas_transaksi WHERE created_by = ?", [fixture.id]);
                await first.execute("DELETE FROM access_logs WHERE username = ?", [fixture.username]);
                await first.execute("DELETE FROM acount WHERE id = ?", [fixture.id]);
            }
            await first.end();
            await second.end();
        }
    });
});
