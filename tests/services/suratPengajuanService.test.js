import { describe, expect, it } from "@jest/globals";
import { encryptEmails } from "../../helpers/ciihper.js";
import { seedAccount, seedFamilyWithAccount } from "../helpers/seed.js";
import {
    approveSuratPengajuanService,
    createSuratKategoriService,
    createSuratPengajuanService,
    getSuratPengajuanDetailService,
    listSuratPengajuanService,
    rejectSuratPengajuanService,
} from "../../services/suratPengajuanService.js";

function submission(kategoriId, overrides = {}) {
    return {
        kategori_id: kategoriId,
        keperluan: "Mengurus administrasi kependudukan",
        agama: "Islam",
        pekerjaan: "Wiraswasta",
        kewarganegaraan: "WNI",
        ...overrides,
    };
}

describe("Surat Pengantar", () => {
    it("membuat snapshot kepala keluarga dan tidak berubah ketika data master diedit", async () => {
        const fixture = await seedFamilyWithAccount(globalThis.testDb, {
            warga: {
                nik: encryptEmails("3273010101900001"),
                tglLahir: encryptEmails("1990-01-01"),
                nama: "Budi Snapshot",
            },
            family: { house: { alamat: encryptEmails("Jalan Snapshot Nomor 1") } },
        });
        const admin = await seedAccount(globalThis.testDb, { role: "admin" });
        const kategori = await createSuratKategoriService(
            { nama_kategori: "Surat Pengantar KTP" },
            { id: admin.id, role: "admin" },
            globalThis.testDb,
        );

        const created = await createSuratPengajuanService(
            submission(kategori.id),
            { id: fixture.account.id, role: "warga" },
            globalThis.testDb,
        );

        expect(created).toMatchObject({
            family_id: fixture.family.id,
            kategori_id: kategori.id,
            nama_lengkap: "Budi Snapshot",
            tanggal_lahir: expect.anything(),
            no_ktp: "3273010101900001",
            alamat: "Jalan Snapshot Nomor 1",
            agama: "Islam",
            pekerjaan: "Wiraswasta",
            kewarganegaraan: "WNI",
            status: "pending",
            tempat_lahir: null,
        });

        await globalThis.testDb.execute(
            "UPDATE warga SET nama = 'Nama Baru' WHERE id = ?",
            [fixture.warga.id],
        );
        const detail = await getSuratPengajuanDetailService(
            created.id,
            { id: fixture.account.id, role: "warga" },
            globalThis.testDb,
        );
        expect(detail.nama_lengkap).toBe("Budi Snapshot");
    });

    it("menolak kategori tidak aktif/tidak ada dan seluruh field warga-supplied yang kosong", async () => {
        const fixture = await seedFamilyWithAccount(globalThis.testDb);
        await expect(createSuratPengajuanService(
            submission(999999),
            { id: fixture.account.id, role: "warga" },
            globalThis.testDb,
        )).rejects.toMatchObject({ status: 400, code: "CATEGORY_NOT_FOUND" });

        await expect(createSuratPengajuanService(
            submission(1, { agama: " " }),
            { id: fixture.account.id, role: "warga" },
            globalThis.testDb,
        )).rejects.toMatchObject({ status: 400, code: "REQUIRED_FIELD" });
    });

    it("membatasi detail warga berdasarkan family dan mem-paginate daftar staff", async () => {
        const owner = await seedFamilyWithAccount(globalThis.testDb);
        const outsider = await seedFamilyWithAccount(globalThis.testDb);
        const admin = await seedAccount(globalThis.testDb, { role: "admin" });
        const kategori = await createSuratKategoriService(
            { nama_kategori: "Surat Keterangan Domisili" },
            { id: admin.id, role: "admin" },
            globalThis.testDb,
        );
        const created = await createSuratPengajuanService(
            submission(kategori.id),
            { id: owner.account.id, role: "warga" },
            globalThis.testDb,
        );

        await expect(getSuratPengajuanDetailService(
            created.id,
            { id: outsider.account.id, role: "warga" },
            globalThis.testDb,
        )).rejects.toMatchObject({ status: 403, code: "LETTER_NOT_OWNED" });

        const listed = await listSuratPengajuanService(
            { status: "pending", kategori_id: kategori.id, family_id: owner.family.id, page: 1, limit: 10 },
            { id: admin.id, role: "admin" },
            globalThis.testDb,
        );
        expect(listed.items.map((item) => item.id)).toContain(created.id);
        expect(listed.pagination).toMatchObject({ page: 1, limit: 10, total: 1, total_pages: 1 });
    });

    it("approve menyimpan actor/waktu dan status final tidak dapat diproses ulang", async () => {
        const fixture = await seedFamilyWithAccount(globalThis.testDb);
        const admin = await seedAccount(globalThis.testDb, { role: "admin" });
        const rt = await seedAccount(globalThis.testDb, { role: "rt" });
        const kategori = await createSuratKategoriService(
            { nama_kategori: "Surat Pengantar SKCK" },
            { id: admin.id, role: "admin" },
            globalThis.testDb,
        );
        const created = await createSuratPengajuanService(
            submission(kategori.id),
            { id: fixture.account.id, role: "warga" },
            globalThis.testDb,
        );

        const approved = await approveSuratPengajuanService(
            created.id,
            { id: rt.id, role: "rt" },
            globalThis.testDb,
        );
        expect(approved).toMatchObject({ status: "disetujui", approved_by: rt.id });
        expect(approved.approved_at).toBeTruthy();

        await expect(rejectSuratPengajuanService(
            created.id,
            { id: rt.id, role: "rt" },
            globalThis.testDb,
        )).rejects.toMatchObject({ status: 409, code: "INVALID_STATUS_TRANSITION" });
    });
});
