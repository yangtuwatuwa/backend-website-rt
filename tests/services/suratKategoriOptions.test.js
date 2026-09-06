import { describe, expect, it } from "@jest/globals";
import {
    REQUIRED_SURAT_KATEGORI,
    up as syncSuratKategori,
} from "../../migrations/20260904_seed_surat_kategori_keperluan.js";
import { listSuratKategoriService } from "../../services/suratPengajuanService.js";

describe("Pilihan keperluan surat", () => {
    it("mengaktifkan hanya lima pilihan dosen dalam urutan yang ditentukan", async () => {
        await globalThis.testDb.execute(
            `INSERT INTO surat_kategori (nama_kategori, is_active, sort_order)
             VALUES ('Kategori Lama Test', 1, 0)`,
        );

        await syncSuratKategori(globalThis.testDb);
        await syncSuratKategori(globalThis.testDb);

        const active = await listSuratKategoriService({}, globalThis.testDb);
        expect(active.map((item) => item.nama_kategori)).toEqual(REQUIRED_SURAT_KATEGORI);
        expect(active.map((item) => item.sort_order)).toEqual([1, 2, 3, 4, 5]);

        const [oldRows] = await globalThis.testDb.execute(
            "SELECT is_active FROM surat_kategori WHERE nama_kategori = 'Kategori Lama Test'",
        );
        expect(oldRows).toHaveLength(1);
        expect(Number(oldRows[0].is_active)).toBe(0);
    });
});
