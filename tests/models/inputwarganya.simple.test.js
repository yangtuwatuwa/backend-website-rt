import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  deleteWargaById,
  getOtherFamilyMembers,
  getPendingWarga,
  getWargaById,
  isKepalaKeluarga,
  updateFamilyHead,
  updateFamilyNoKk,
  updateWargaFields,
  updateWargaNik,
  updateWargaStatus,
} from "../../models/inputwarganya.js";
import {
  createExecutorProxy,
  expectNoTransactionOwnership,
  findFamily,
  findWarga,
  normalizeSql,
} from "../helpers/inputWarga.js";
import {
  seedFamily,
  seedWarga,
  setFamilyHead,
} from "../helpers/seed.js";

function expectSimpleExecutor(executor, sqlFragment) {
  expect(
    executor.execute.mock.calls.some(([sql]) =>
      normalizeSql(sql).includes(sqlFragment),
    ),
  ).toBe(true);
  expect(executor.query).not.toHaveBeenCalled();
  expectNoTransactionOwnership(executor);
}

async function seedSimpleWarga(overrides = {}) {
  const family = await seedFamily(globalThis.testDb);
  const warga = await seedWarga(globalThis.testDb, {
    familyId: family.id,
    houseId: family.houseId,
    ...overrides,
  });
  return { family, warga };
}

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("fungsi inputwarganya sederhana meneruskan executor", () => {
  it("getWargaById membaca warga melalui executor injected", async () => {
    const { warga } = await seedSimpleWarga({ nama: "Detail Executor" });
    const executor = createExecutorProxy();

    const result = await getWargaById(warga.id, executor);

    expect(result).toMatchObject({ id: warga.id, nama: "Detail Executor" });
    expectSimpleExecutor(executor, "SELECT * FROM warga WHERE id = ?");
  });

  it("getPendingWarga membaca daftar pending melalui executor injected", async () => {
    const { warga } = await seedSimpleWarga({
      nama: "Warga Pending Executor",
      statusData: "pending",
    });
    const executor = createExecutorProxy();

    const result = await getPendingWarga(executor);

    expect(result.map((row) => row.warga_id)).toContain(warga.id);
    expectSimpleExecutor(executor, "FROM warga w LEFT JOIN family f");
  });

  it("updateWargaStatus memutasi status melalui executor tanpa savepoint", async () => {
    const { warga } = await seedSimpleWarga({ statusData: "pending" });
    const executor = createExecutorProxy();

    const result = await updateWargaStatus(warga.id, "diterima", executor);

    expect(result.affectedRows).toBe(1);
    expect((await findWarga(warga.id)).status_data).toBe("diterima");
    expectSimpleExecutor(executor, "UPDATE warga SET status_data = ?");
  });

  it("updateWargaFields membangun UPDATE dinamis pada executor injected", async () => {
    const { warga } = await seedSimpleWarga({ nama: "Nama Sebelum" });
    const executor = createExecutorProxy();

    const result = await updateWargaFields(
      warga.id,
      { nama: "Nama Sesudah", umur: 41 },
      executor,
    );

    expect(result.affectedRows).toBe(1);
    expect(await findWarga(warga.id)).toMatchObject({
      nama: "Nama Sesudah",
      umur: 41,
    });
    expectSimpleExecutor(
      executor,
      "UPDATE warga SET nama = ?, umur = ? WHERE id = ?",
    );
  });

  it("updateWargaNik menggunakan executor injected tanpa savepoint", async () => {
    const { warga } = await seedSimpleWarga();
    const executor = createExecutorProxy();

    const result = await updateWargaNik(
      warga.id,
      "ciphertext-nik-baru",
      executor,
    );

    expect(result.affectedRows).toBe(1);
    expect((await findWarga(warga.id)).nik).toBe("ciphertext-nik-baru");
    expectSimpleExecutor(executor, "UPDATE warga SET nik = ? WHERE id = ?");
  });

  it("updateFamilyNoKk menggunakan executor injected tanpa savepoint", async () => {
    const family = await seedFamily(globalThis.testDb);
    const executor = createExecutorProxy();

    const result = await updateFamilyNoKk(
      family.id,
      "ciphertext-no-kk-baru",
      executor,
    );

    expect(result.affectedRows).toBe(1);
    expect((await findFamily(family.id)).no_kk).toBe(
      "ciphertext-no-kk-baru",
    );
    expectSimpleExecutor(
      executor,
      "UPDATE family SET no_kk = ? WHERE id = ?",
    );
  });
});

describe("legacy deletion helpers — bukan alur wargaDeletionService aktif", () => {
  // Empat export di bawah dipertahankan untuk kompatibilitas lama. Service
  // deletion aktif memiliki implementasi transaksi dan validasi sendiri.
  it("legacy isKepalaKeluarga meneruskan executor", async () => {
    const { family, warga } = await seedSimpleWarga();
    await setFamilyHead(globalThis.testDb, family.id, warga.id);
    const executor = createExecutorProxy();

    await expect(isKepalaKeluarga(warga.id, executor)).resolves.toBe(true);

    expectSimpleExecutor(
      executor,
      "SELECT id FROM family WHERE kepala_keluarga_id = ?",
    );
  });

  it("legacy deleteWargaById melakukan soft-delete melalui executor", async () => {
    const { warga } = await seedSimpleWarga({ statusData: "diterima" });
    const executor = createExecutorProxy();

    const result = await deleteWargaById(warga.id, executor);

    expect(result.affectedRows).toBe(1);
    expect((await findWarga(warga.id)).status_data).toBe("ditolak");
    expectSimpleExecutor(
      executor,
      "UPDATE warga SET status_data = 'ditolak'",
    );
  });

  it("legacy getOtherFamilyMembers memakai executor dan hanya mengembalikan anggota aktif lain", async () => {
    const family = await seedFamily(globalThis.testDb);
    const excluded = await seedWarga(globalThis.testDb, {
      familyId: family.id,
      houseId: family.houseId,
      nama: "Excluded",
      statusData: "diterima",
    });
    const first = await seedWarga(globalThis.testDb, {
      familyId: family.id,
      houseId: family.houseId,
      nama: "First Active",
      statusData: "pending",
    });
    const second = await seedWarga(globalThis.testDb, {
      familyId: family.id,
      houseId: family.houseId,
      nama: "Second Active",
      statusData: "diterima",
    });
    await seedWarga(globalThis.testDb, {
      familyId: family.id,
      houseId: family.houseId,
      nama: "Rejected Member",
      statusData: "ditolak",
    });
    const executor = createExecutorProxy();

    const result = await getOtherFamilyMembers(
      family.id,
      excluded.id,
      executor,
    );

    expect(result.map((row) => row.id)).toEqual([first.id, second.id]);
    expectSimpleExecutor(
      executor,
      "SELECT id, nama FROM warga WHERE family_id = ? AND id != ?",
    );
  });

  it("legacy updateFamilyHead meneruskan executor", async () => {
    const family = await seedFamily(globalThis.testDb);
    const first = await seedWarga(globalThis.testDb, {
      familyId: family.id,
      houseId: family.houseId,
    });
    const replacement = await seedWarga(globalThis.testDb, {
      familyId: family.id,
      houseId: family.houseId,
    });
    await setFamilyHead(globalThis.testDb, family.id, first.id);
    const executor = createExecutorProxy();

    const result = await updateFamilyHead(
      family.id,
      replacement.id,
      executor,
    );

    expect(result.affectedRows).toBe(1);
    expect((await findFamily(family.id)).kepala_keluarga_id).toBe(
      replacement.id,
    );
    expectSimpleExecutor(
      executor,
      "UPDATE family SET kepala_keluarga_id = ? WHERE id = ?",
    );
  });
});
