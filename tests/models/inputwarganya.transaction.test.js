import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import db from "../../config/sqlconfig.js";
import {
  autoHealFamilyHeads,
  getWargas,
  warganya,
} from "../../models/inputwarganya.js";
import {
  getKepalaKeluargaList,
  getWarganya as getResidentFamilies,
} from "../../models/resident.js";
import {
  createExecutorProxy,
  createOwnedConnectionFacade,
  expectNoTransactionOwnership,
  expectSavepointProtocol,
  findFamily,
  findWarga,
  findWargaByNik,
  normalizeSql,
} from "../helpers/inputWarga.js";
import {
  seedFamily,
  seedWarga,
  setFamilyHead,
} from "../helpers/seed.js";

const importLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
const { getDashboardStatsService } = await import(
  "../../services/financialService.js"
);
importLogSpy.mockRestore();

let wargaSequence = 0;

function nextWargaData(prefix = "warga") {
  wargaSequence += 1;
  return {
    nik: `${prefix}-${Date.now()}-${wargaSequence}`,
    nama: `Warga ${prefix} ${wargaSequence}`,
    jenisKelamin: "Laki-laki",
    tglLahir: "1990-01-01",
    statusHidup: "Hidup",
    noHp: `08123${String(wargaSequence).padStart(5, "0")}`,
    umur: 36,
  };
}

async function callWarganya(
  family,
  data,
  { status = "diterima", isHead = false, executor } = {},
) {
  return warganya(
    data.nik,
    data.nama,
    data.jenisKelamin,
    data.tglLahir,
    data.statusHidup,
    data.noHp,
    data.umur,
    family.id,
    family.houseId,
    status,
    isHead,
    executor,
  );
}

async function seedInvalidFamily({ rejectedFirst = false } = {}) {
  const family = await seedFamily(globalThis.testDb);
  let rejected = null;
  if (rejectedFirst) {
    rejected = await seedWarga(globalThis.testDb, {
      familyId: family.id,
      houseId: family.houseId,
      nama: "Anggota Ditolak",
      statusData: "ditolak",
    });
  }
  const firstActive = await seedWarga(globalThis.testDb, {
    familyId: family.id,
    houseId: family.houseId,
    nama: "Anggota Aktif Pertama",
    statusData: "pending",
  });
  const secondActive = await seedWarga(globalThis.testDb, {
    familyId: family.id,
    houseId: family.houseId,
    nama: "Anggota Aktif Kedua",
    statusData: "diterima",
  });
  return { family, rejected, firstActive, secondActive };
}

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("autoHealFamilyHeads", () => {
  it("memilih anggota aktif ber-ID terkecil untuk kepala kosong atau invalid", async () => {
    const first = await seedInvalidFamily({ rejectedFirst: true });
    const second = await seedInvalidFamily();
    await setFamilyHead(
      globalThis.testDb,
      second.family.id,
      first.firstActive.id,
    );
    const executor = createExecutorProxy();

    const result = await autoHealFamilyHeads(executor);

    expect(result).toBeUndefined();
    expect((await findFamily(first.family.id)).kepala_keluarga_id).toBe(
      first.firstActive.id,
    );
    expect((await findFamily(second.family.id)).kepala_keluarga_id).toBe(
      second.firstActive.id,
    );
    expect((await findFamily(first.family.id)).kepala_keluarga_id).not.toBe(
      first.rejected.id,
    );
    expectNoTransactionOwnership(executor);
    expectSavepointProtocol(executor, "sp_auto_heal_family_heads_");
  });

  it("rollback seluruh loop ketika UPDATE family kedua gagal dan tetap silent", async () => {
    const first = await seedInvalidFamily();
    const second = await seedInvalidFamily();
    let updateCount = 0;
    const executor = createExecutorProxy(({ normalizedSql }) => {
      if (normalizedSql === "UPDATE family SET kepala_keluarga_id = ? WHERE id = ?") {
        updateCount += 1;
        if (updateCount === 2) {
          throw new Error("Simulasi kegagalan update family kedua");
        }
      }
      return undefined;
    });

    await expect(autoHealFamilyHeads(executor)).resolves.toBeUndefined();

    expect(updateCount).toBe(2);
    expect((await findFamily(first.family.id)).kepala_keluarga_id).toBeNull();
    expect((await findFamily(second.family.id)).kepala_keluarga_id).toBeNull();
    expectNoTransactionOwnership(executor);
    expectSavepointProtocol(executor, "sp_auto_heal_family_heads_", {
      rolledBack: true,
    });
  });

  it("injected tidak membuat savepoint ketika tidak ada mutation", async () => {
    const fixture = await seedInvalidFamily();
    await setFamilyHead(
      globalThis.testDb,
      fixture.family.id,
      fixture.firstActive.id,
    );
    const executor = createExecutorProxy();

    await autoHealFamilyHeads(executor);

    expect(executor.query).not.toHaveBeenCalled();
    expect((await findFamily(fixture.family.id)).kepala_keluarga_id).toBe(
      fixture.firstActive.id,
    );
    expectNoTransactionOwnership(executor);
  });

  it("default membuka, commit, dan release transaksi sendiri", async () => {
    const fixture = await seedInvalidFamily();
    const ownedConnection = createOwnedConnectionFacade("auto_heal_success");
    const getConnectionSpy = jest
      .spyOn(db, "getConnection")
      .mockResolvedValue(ownedConnection);

    await expect(autoHealFamilyHeads()).resolves.toBeUndefined();

    expect(getConnectionSpy).toHaveBeenCalledTimes(1);
    expect(ownedConnection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(ownedConnection.commit).toHaveBeenCalledTimes(1);
    expect(ownedConnection.rollback).not.toHaveBeenCalled();
    expect(ownedConnection.release).toHaveBeenCalledTimes(1);
    expect((await findFamily(fixture.family.id)).kepala_keluarga_id).toBe(
      fixture.firstActive.id,
    );
  });

  it("default rollback dan release ketika loop gagal tanpa throw ke caller", async () => {
    const first = await seedInvalidFamily();
    const second = await seedInvalidFamily();
    let updateCount = 0;
    const ownedConnection = createOwnedConnectionFacade(
      "auto_heal_failure",
      ({ normalizedSql }) => {
        if (normalizedSql === "UPDATE family SET kepala_keluarga_id = ? WHERE id = ?") {
          updateCount += 1;
          if (updateCount === 2) {
            throw new Error("Simulasi owned auto-heal failure");
          }
        }
        return undefined;
      },
    );
    jest.spyOn(db, "getConnection").mockResolvedValue(ownedConnection);

    await expect(autoHealFamilyHeads()).resolves.toBeUndefined();

    expect(ownedConnection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(ownedConnection.commit).not.toHaveBeenCalled();
    expect(ownedConnection.rollback).toHaveBeenCalledTimes(1);
    expect(ownedConnection.release).toHaveBeenCalledTimes(1);
    expect((await findFamily(first.family.id)).kepala_keluarga_id).toBeNull();
    expect((await findFamily(second.family.id)).kepala_keluarga_id).toBeNull();
  });
});

describe("warganya", () => {
  it("insert warga dan auto-assign kepala kosong dalam satu savepoint", async () => {
    const family = await seedFamily(globalThis.testDb);
    const data = nextWargaData("auto-empty");
    const executor = createExecutorProxy();

    const result = await callWarganya(family, data, { executor });

    expect(result.insertId).toBeGreaterThan(0);
    expect(await findWarga(result.insertId)).toMatchObject({
      nama: data.nama,
      family_id: family.id,
      house_id: family.houseId,
      status_data: "diterima",
    });
    expect((await findFamily(family.id)).kepala_keluarga_id).toBe(
      result.insertId,
    );
    expectNoTransactionOwnership(executor);
    expectSavepointProtocol(executor, "sp_create_warga_");
  });

  it("rollback INSERT warga ketika UPDATE kepala family gagal", async () => {
    const family = await seedFamily(globalThis.testDb);
    const data = nextWargaData("rollback-update");
    const executor = createExecutorProxy(({ normalizedSql }) => {
      if (normalizedSql === "UPDATE family SET kepala_keluarga_id = ? WHERE id = ?") {
        throw new Error("Simulasi kegagalan update kepala family");
      }
      return undefined;
    });

    const result = await callWarganya(family, data, { executor });

    expect(result).toContain("Simulasi kegagalan update kepala family");
    expect(await findWargaByNik(data.nik)).toBeNull();
    expect((await findFamily(family.id)).kepala_keluarga_id).toBeNull();
    expectNoTransactionOwnership(executor);
    expectSavepointProtocol(executor, "sp_create_warga_", {
      rolledBack: true,
    });
  });

  it.each([true, "true", 1])(
    "explicit head %p mengganti kepala valid yang sudah ada",
    async (explicitValue) => {
      const family = await seedFamily(globalThis.testDb);
      const existingHead = await seedWarga(globalThis.testDb, {
        familyId: family.id,
        houseId: family.houseId,
        statusData: "diterima",
      });
      await setFamilyHead(globalThis.testDb, family.id, existingHead.id);
      const data = nextWargaData("explicit");
      const executor = createExecutorProxy();

      const result = await callWarganya(family, data, {
        executor,
        isHead: explicitValue,
      });

      expect((await findFamily(family.id)).kepala_keluarga_id).toBe(
        result.insertId,
      );
      expect(
        executor.execute.mock.calls.some(([sql]) =>
          normalizeSql(sql).startsWith(
            "SELECT kepala_keluarga_id FROM family",
          ),
        ),
      ).toBe(false);
      expectSavepointProtocol(executor, "sp_create_warga_");
    },
  );

  it("auto-detect mengganti kepala yang berasal dari family lain", async () => {
    const target = await seedFamily(globalThis.testDb);
    const other = await seedFamily(globalThis.testDb);
    const foreignHead = await seedWarga(globalThis.testDb, {
      familyId: other.id,
      houseId: other.houseId,
      statusData: "diterima",
    });
    await setFamilyHead(globalThis.testDb, target.id, foreignHead.id);
    const data = nextWargaData("auto-invalid");
    const executor = createExecutorProxy();

    const result = await callWarganya(target, data, { executor });

    expect((await findFamily(target.id)).kepala_keluarga_id).toBe(
      result.insertId,
    );
    expectSavepointProtocol(executor, "sp_create_warga_");
  });

  it("kepala valid mempertahankan cabang insert-only tanpa UPDATE family", async () => {
    const family = await seedFamily(globalThis.testDb);
    const existingHead = await seedWarga(globalThis.testDb, {
      familyId: family.id,
      houseId: family.houseId,
      statusData: "diterima",
    });
    await setFamilyHead(globalThis.testDb, family.id, existingHead.id);
    const data = nextWargaData("insert-only");
    const executor = createExecutorProxy();

    const result = await callWarganya(family, data, { executor });

    expect(await findWarga(result.insertId)).not.toBeNull();
    expect((await findFamily(family.id)).kepala_keluarga_id).toBe(
      existingHead.id,
    );
    expect(
      executor.execute.mock.calls.some(([sql]) =>
        normalizeSql(sql) ===
        "UPDATE family SET kepala_keluarga_id = ? WHERE id = ?",
      ),
    ).toBe(false);
    expectSavepointProtocol(executor, "sp_create_warga_");
  });

  it("default membuka, commit, dan release transaksi sendiri", async () => {
    const family = await seedFamily(globalThis.testDb);
    const data = nextWargaData("owned-success");
    const ownedConnection = createOwnedConnectionFacade("warganya_success");
    const getConnectionSpy = jest
      .spyOn(db, "getConnection")
      .mockResolvedValue(ownedConnection);

    const result = await callWarganya(family, data);

    expect(result.insertId).toBeGreaterThan(0);
    expect(getConnectionSpy).toHaveBeenCalledTimes(1);
    expect(ownedConnection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(ownedConnection.commit).toHaveBeenCalledTimes(1);
    expect(ownedConnection.rollback).not.toHaveBeenCalled();
    expect(ownedConnection.release).toHaveBeenCalledTimes(1);
    expect(await findWarga(result.insertId)).not.toBeNull();
  });

  it("default rollback dan release ketika UPDATE setelah INSERT gagal", async () => {
    const family = await seedFamily(globalThis.testDb);
    const data = nextWargaData("owned-failure");
    const ownedConnection = createOwnedConnectionFacade(
      "warganya_failure",
      ({ normalizedSql }) => {
        if (normalizedSql === "UPDATE family SET kepala_keluarga_id = ? WHERE id = ?") {
          throw new Error("Simulasi owned update kepala gagal");
        }
        return undefined;
      },
    );
    jest.spyOn(db, "getConnection").mockResolvedValue(ownedConnection);

    const result = await callWarganya(family, data);

    expect(result).toContain("Simulasi owned update kepala gagal");
    expect(ownedConnection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(ownedConnection.commit).not.toHaveBeenCalled();
    expect(ownedConnection.rollback).toHaveBeenCalledTimes(1);
    expect(ownedConnection.release).toHaveBeenCalledTimes(1);
    expect(await findWargaByNik(data.nik)).toBeNull();
    expect((await findFamily(family.id)).kepala_keluarga_id).toBeNull();
  });
});

describe("getWargas", () => {
  it("meneruskan executor yang sama ke auto-heal lalu SELECT list", async () => {
    const fixture = await seedInvalidFamily();
    const executor = createExecutorProxy();

    const result = await getWargas(executor);

    expect(result.map((row) => row.warga_id)).toEqual(
      expect.arrayContaining([
        fixture.firstActive.id,
        fixture.secondActive.id,
      ]),
    );
    expect((await findFamily(fixture.family.id)).kepala_keluarga_id).toBe(
      fixture.firstActive.id,
    );
    const executeSql = executor.execute.mock.calls.map(([sql]) =>
      normalizeSql(sql),
    );
    const healSelectIndex = executeSql.findIndex((sql) =>
      sql.includes("SELECT f.id AS family_id, f.kepala_keluarga_id"),
    );
    const listSelectIndex = executeSql.findIndex((sql) =>
      sql.includes("SELECT w.id AS warga_id"),
    );
    expect(healSelectIndex).toBeGreaterThanOrEqual(0);
    expect(listSelectIndex).toBeGreaterThan(healSelectIndex);
    expectNoTransactionOwnership(executor);
    expectSavepointProtocol(executor, "sp_auto_heal_family_heads_");
  });
});

describe("caller auto-heal meneruskan executor mentah", () => {
  it("models/resident.getWarganya memakai executor yang sama", async () => {
    const fixture = await seedInvalidFamily();
    const executor = createExecutorProxy();

    const result = await getResidentFamilies(executor);

    expect(result.map((row) => row.family_id)).toContain(fixture.family.id);
    expect((await findFamily(fixture.family.id)).kepala_keluarga_id).toBe(
      fixture.firstActive.id,
    );
    expectNoTransactionOwnership(executor);
    expectSavepointProtocol(executor, "sp_auto_heal_family_heads_");
  });

  it("models/resident.getKepalaKeluargaList memakai executor yang sama", async () => {
    const fixture = await seedInvalidFamily();
    const executor = createExecutorProxy();

    const result = await getKepalaKeluargaList(executor);

    expect(result.map((row) => row.family_id)).toContain(fixture.family.id);
    expect((await findFamily(fixture.family.id)).kepala_keluarga_id).toBe(
      fixture.firstActive.id,
    );
    expectNoTransactionOwnership(executor);
    expectSavepointProtocol(executor, "sp_auto_heal_family_heads_");
  });

  it("getDashboardStatsService meneruskan executor yang sama ke getWargas", async () => {
    const fixture = await seedInvalidFamily();
    const executor = createExecutorProxy();

    const result = await getDashboardStatsService(executor);

    expect(result.total_warga).toBe(2);
    expect((await findFamily(fixture.family.id)).kepala_keluarga_id).toBe(
      fixture.firstActive.id,
    );
    expectNoTransactionOwnership(executor);
    expectSavepointProtocol(executor, "sp_auto_heal_family_heads_");
  });
});
