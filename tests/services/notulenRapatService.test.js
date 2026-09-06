import { describe, expect, it } from "@jest/globals";
import {
    addNotulenRapat,
    editNotulenRapat,
    getNotulenRapatDetail,
    listAllNotulenRapat,
    removeNotulenRapat,
} from "../../services/notulenRapat.js";

function dateOnly(value) {
    return value instanceof Date
        ? value.toISOString().slice(0, 10)
        : String(value).slice(0, 10);
}

describe("Notulen Rapat", () => {
    it("membuat notulen, melakukan trim, dan mengizinkan tanggal masa depan", async () => {
        const created = await addNotulenRapat(
            "2099-12-31",
            "  Rencana kerja bakti  ",
            "  Kerja bakti dilaksanakan hari Minggu  ",
            globalThis.testDb,
        );

        expect(created).toMatchObject({
            topik: "Rencana kerja bakti",
            hasil_keputusan: "Kerja bakti dilaksanakan hari Minggu",
        });
        expect(dateOnly(created.tanggal_rapat)).toBe("2099-12-31");
    });

    it.each([
        ["tanggal tidak nyata", ["2026-02-30", "Topik", "Hasil"], "INVALID_DATE"],
        ["tanggal bukan ISO date-only", ["4 September 2026", "Topik", "Hasil"], "INVALID_DATE"],
        ["topik kosong", ["2026-09-04", "   ", "Hasil"], "REQUIRED_FIELD"],
        ["hasil kosong", ["2026-09-04", "Topik", ""], "REQUIRED_FIELD"],
        ["topik lebih dari 200", ["2026-09-04", "x".repeat(201), "Hasil"], "FIELD_TOO_LONG"],
        ["hasil lebih dari 200", ["2026-09-04", "Topik", "x".repeat(201)], "FIELD_TOO_LONG"],
    ])("menolak %s sebelum insert", async (_label, args, code) => {
        await expect(addNotulenRapat(...args, globalThis.testDb))
            .rejects.toMatchObject({ status: 400, code });
        const [rows] = await globalThis.testDb.execute("SELECT COUNT(*) AS total FROM notulen_rapat");
        expect(Number(rows[0].total)).toBe(0);
    });

    it("memfilter rentang tanggal, mengurutkan terbaru, dan mem-paginate", async () => {
        await addNotulenRapat("2026-01-10", "Januari", "Hasil Januari", globalThis.testDb);
        await addNotulenRapat("2026-03-10", "Maret", "Hasil Maret", globalThis.testDb);
        await addNotulenRapat("2026-02-10", "Februari", "Hasil Februari", globalThis.testDb);

        const firstPage = await listAllNotulenRapat({ page: 1, limit: 2 }, globalThis.testDb);
        expect(firstPage.items.map((row) => row.topik)).toEqual(["Maret", "Februari"]);
        expect(firstPage.pagination).toEqual({ page: 1, limit: 2, total: 3, total_pages: 2 });

        const filtered = await listAllNotulenRapat({
            date_from: "2026-02-01",
            date_to: "2026-02-28",
        }, globalThis.testDb);
        expect(filtered.items.map((row) => row.topik)).toEqual(["Februari"]);
    });

    it("mendukung partial update dan mempertahankan field yang tidak dikirim", async () => {
        const created = await addNotulenRapat(
            "2026-09-01",
            "Rapat keamanan",
            "Tambah jadwal ronda",
            globalThis.testDb,
        );

        const updated = await editNotulenRapat(
            created.id,
            { hasil_keputusan: "  Jadwal ronda dimulai pekan depan  " },
            globalThis.testDb,
        );
        expect(updated.topik).toBe("Rapat keamanan");
        expect(updated.hasil_keputusan).toBe("Jadwal ronda dimulai pekan depan");
        expect(dateOnly(updated.tanggal_rapat)).toBe("2026-09-01");

        await expect(editNotulenRapat(created.id, {}, globalThis.testDb))
            .rejects.toMatchObject({ status: 400, code: "EMPTY_UPDATE" });
    });

    it("menghapus record secara hard delete dan mengembalikan 404 setelahnya", async () => {
        const created = await addNotulenRapat(
            "2026-09-04",
            "Evaluasi bulanan",
            "Program dilanjutkan",
            globalThis.testDb,
        );

        await expect(getNotulenRapatDetail(created.id, globalThis.testDb))
            .resolves.toMatchObject({ id: created.id });
        await expect(removeNotulenRapat(created.id, globalThis.testDb))
            .resolves.toEqual({ id: created.id, deleted: true });
        await expect(getNotulenRapatDetail(created.id, globalThis.testDb))
            .rejects.toMatchObject({ status: 404, code: "NOTULEN_NOT_FOUND" });
    });

    it("menolak filter, pagination, dan id yang tidak valid", async () => {
        await expect(listAllNotulenRapat({
            date_from: "2026-09-10",
            date_to: "2026-09-01",
        }, globalThis.testDb)).rejects.toMatchObject({ status: 400, code: "INVALID_DATE_RANGE" });
        await expect(listAllNotulenRapat({ limit: 101 }, globalThis.testDb))
            .rejects.toMatchObject({ status: 400, code: "INVALID_PAGINATION" });
        await expect(getNotulenRapatDetail("abc", globalThis.testDb))
            .rejects.toMatchObject({ status: 400, code: "INVALID_ID" });
    });
});
