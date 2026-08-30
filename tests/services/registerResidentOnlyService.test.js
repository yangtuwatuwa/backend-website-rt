import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import pool from "../../config/sqlconfig.js";
import {
  seedFamily,
  seedHouse,
  seedWarga,
} from "../helpers/seed.js";

const importLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
const [{ registerResidentOnlyService }, { decryptEmails, encryptEmails }] =
  await Promise.all([
    import("../../services/registerResidentOnlyService.js"),
    import("../../helpers/ciihper.js"),
  ]);
importLogSpy.mockRestore();

let dataSequence = 0;
let ownedFacadeCounter = 0;

function uniqueSuffix() {
  dataSequence += 1;
  return `${Date.now()}-${process.pid}-${dataSequence}`;
}

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

function validResidentData(overrides = {}) {
  const suffix = uniqueSuffix();
  const base = {
    houseData: overrides.existingHouseId
      ? { houseId: overrides.existingHouseId }
      : {
          blok: `R-${suffix}`,
          nomor: `N-${suffix}`,
          alamat: `Alamat resident ${suffix}`,
          status: "pribadi",
        },
    familyData: { noKK: `KK-${suffix}` },
    wargaData: {
      nik: `NIK-${suffix}`,
      nama: `Warga ${suffix}`,
      jenisKelamin: "Laki-laki",
      tglLahir: "1990-01-01",
      statusHidup: "Hidup",
      noHp: `08${String(dataSequence).padStart(10, "0")}`,
      umur: 36,
    },
  };

  return {
    houseData: { ...base.houseData, ...overrides.houseData },
    familyData: { ...base.familyData, ...overrides.familyData },
    wargaData: { ...base.wargaData, ...overrides.wargaData },
  };
}

function createExecutorProxy(intercept) {
  const runQuery = async (method, sql, params = []) => {
    const intercepted = await intercept?.({
      method,
      sql,
      normalizedSql: normalizeSql(sql),
      params,
    });

    if (intercepted?.handled) {
      return intercepted.value;
    }

    return globalThis.testDb[method](sql, params);
  };

  return {
    execute: jest.fn((sql, params = []) => runQuery("execute", sql, params)),
    query: jest.fn((sql, params = []) => runQuery("query", sql, params)),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
  };
}

function createOwnedConnectionFacade() {
  const savepointName = `sp_test_owned_resident_${++ownedFacadeCounter}`;

  return {
    execute: jest.fn((sql, params = []) =>
      globalThis.testDb.execute(sql, params),
    ),
    query: jest.fn((sql, params = []) =>
      globalThis.testDb.query(sql, params),
    ),
    beginTransaction: jest.fn(() =>
      globalThis.testDb.query(`SAVEPOINT ${savepointName}`),
    ),
    commit: jest.fn(() =>
      globalThis.testDb.query(`RELEASE SAVEPOINT ${savepointName}`),
    ),
    rollback: jest.fn(async () => {
      await globalThis.testDb.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
      await globalThis.testDb.query(`RELEASE SAVEPOINT ${savepointName}`);
    }),
    release: jest.fn(),
  };
}

async function tableCounts() {
  const [rows] = await globalThis.testDb.execute(
    `SELECT
      (SELECT COUNT(*) FROM house) AS house_total,
      (SELECT COUNT(*) FROM family) AS family_total,
      (SELECT COUNT(*) FROM warga) AS warga_total`,
  );

  return {
    house: Number(rows[0].house_total),
    family: Number(rows[0].family_total),
    warga: Number(rows[0].warga_total),
  };
}

async function findRegistrationGraph(result) {
  const [[houseRows], [familyRows], [wargaRows]] = await Promise.all([
    globalThis.testDb.execute("SELECT * FROM house WHERE id = ?", [
      result.houseId,
    ]),
    globalThis.testDb.execute("SELECT * FROM family WHERE id = ?", [
      result.familyId,
    ]),
    globalThis.testDb.execute("SELECT * FROM warga WHERE id = ?", [
      result.wargaId,
    ]),
  ]);

  return {
    house: houseRows[0] ?? null,
    family: familyRows[0] ?? null,
    warga: wargaRows[0] ?? null,
  };
}

function expectSavepointRollback(executor) {
  expect(
    executor.query.mock.calls.some(([sql]) =>
      normalizeSql(sql).startsWith(
        "ROLLBACK TO SAVEPOINT sp_register_resident_only_",
      ),
    ),
  ).toBe(true);
}

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("registerResidentOnlyService", () => {
  describe("jalur sukses", () => {
    it("membuat family dan kepala keluarga pada existing house kosong", async () => {
      const house = await seedHouse(globalThis.testDb);
      const input = validResidentData({ existingHouseId: house.id });
      const before = await tableCounts();

      const result = await registerResidentOnlyService(
        input.houseData,
        input.familyData,
        input.wargaData,
        globalThis.testDb,
      );

      expect(result.houseId).toBe(house.id);
      expect(await tableCounts()).toEqual({
        house: before.house,
        family: before.family + 1,
        warga: before.warga + 1,
      });
      const graph = await findRegistrationGraph(result);
      expect(graph.family).toMatchObject({
        house_id: house.id,
        kepala_keluarga_id: result.wargaId,
      });
      expect(graph.warga).toMatchObject({
        family_id: result.familyId,
        house_id: house.id,
        status_data: "diterima",
      });
    });

    it("membuat house baru beserta family dan kepala keluarga", async () => {
      const input = validResidentData();
      const before = await tableCounts();

      const result = await registerResidentOnlyService(
        input.houseData,
        input.familyData,
        input.wargaData,
        globalThis.testDb,
      );

      expect(await tableCounts()).toEqual({
        house: before.house + 1,
        family: before.family + 1,
        warga: before.warga + 1,
      });
      const graph = await findRegistrationGraph(result);
      expect(graph.house).not.toBeNull();
      expect(graph.family).toMatchObject({
        house_id: result.houseId,
        kepala_keluarga_id: result.wargaId,
      });
      expect(graph.warga.family_id).toBe(result.familyId);
    });
  });

  describe("validasi house dan occupancy", () => {
    it("menolak occupied house sebelum mutation dengan lock house lalu family", async () => {
      const house = await seedHouse(globalThis.testDb);
      const occupyingFamily = await seedFamily(globalThis.testDb, {
        houseId: house.id,
      });
      const input = validResidentData({ existingHouseId: house.id });
      const before = await tableCounts();
      const executor = createExecutorProxy();

      await expect(
        registerResidentOnlyService(
          input.houseData,
          input.familyData,
          input.wargaData,
          executor,
        ),
      ).rejects.toThrow(
        `Rumah dengan ID ${house.id} sudah digunakan oleh keluarga lain`,
      );

      expect(await tableCounts()).toEqual(before);
      const businessSql = executor.execute.mock.calls.map(([sql]) =>
        normalizeSql(sql),
      );
      expect(businessSql[0]).toBe(
        "SELECT id FROM house WHERE id = ? FOR UPDATE",
      );
      expect(businessSql[1]).toBe(
        "SELECT id FROM family WHERE house_id = ? LIMIT 1 FOR UPDATE",
      );
      expect(
        businessSql.some((sql) => /^(INSERT|UPDATE|DELETE)\b/.test(sql)),
      ).toBe(false);
      expect(executor.query).not.toHaveBeenCalled();
      const [rows] = await globalThis.testDb.execute(
        "SELECT id FROM family WHERE id = ? AND house_id = ?",
        [occupyingFamily.id, house.id],
      );
      expect(rows).toHaveLength(1);
    });

    it("menolak existing house yang tidak ditemukan tanpa mutation", async () => {
      const [rows] = await globalThis.testDb.execute(
        "SELECT COALESCE(MAX(id), 0) + 100000 AS missing_id FROM house",
      );
      const missingId = Number(rows[0].missing_id);
      const input = validResidentData({ existingHouseId: missingId });
      const before = await tableCounts();
      const executor = createExecutorProxy();

      await expect(
        registerResidentOnlyService(
          input.houseData,
          input.familyData,
          input.wargaData,
          executor,
        ),
      ).rejects.toThrow(`Data rumah dengan ID ${missingId} tidak ditemukan`);

      expect(await tableCounts()).toEqual(before);
      expect(executor.query).not.toHaveBeenCalled();
      expect(
        executor.execute.mock.calls.some(([sql]) =>
          /^(INSERT|UPDATE|DELETE)\b/.test(normalizeSql(sql)),
        ),
      ).toBe(false);
    });

    it("menolak data new house tidak lengkap sebelum mutation", async () => {
      const input = validResidentData({ houseData: { alamat: "" } });
      const before = await tableCounts();
      const executor = createExecutorProxy();

      await expect(
        registerResidentOnlyService(
          input.houseData,
          input.familyData,
          input.wargaData,
          executor,
        ),
      ).rejects.toThrow("Data rumah tidak lengkap");

      expect(await tableCounts()).toEqual(before);
      expect(executor.execute).not.toHaveBeenCalled();
      expect(executor.query).not.toHaveBeenCalled();
    });
  });

  describe("duplicate detection", () => {
    it("rollback new house ketika nomor KK kosong", async () => {
      const input = validResidentData({ familyData: { noKK: "" } });
      const before = await tableCounts();
      const executor = createExecutorProxy();

      await expect(
        registerResidentOnlyService(
          input.houseData,
          input.familyData,
          input.wargaData,
          executor,
        ),
      ).rejects.toThrow("Nomor KK (Kartu Keluarga) wajib diisi");

      expect(await tableCounts()).toEqual(before);
      expectSavepointRollback(executor);
    });

    it("rollback new house ketika nomor KK sudah terdaftar", async () => {
      const duplicateNoKk = `DUP-KK-${uniqueSuffix()}`;
      const existingHouse = await seedHouse(globalThis.testDb);
      await seedFamily(globalThis.testDb, {
        houseId: existingHouse.id,
        noKk: encryptEmails(duplicateNoKk),
      });
      const input = validResidentData({
        familyData: { noKK: duplicateNoKk },
      });
      const before = await tableCounts();
      const executor = createExecutorProxy();

      await expect(
        registerResidentOnlyService(
          input.houseData,
          input.familyData,
          input.wargaData,
          executor,
        ),
      ).rejects.toThrow(
        `Nomor Kartu Keluarga (${duplicateNoKk}) sudah terdaftar`,
      );

      expect(await tableCounts()).toEqual(before);
      expectSavepointRollback(executor);
    });

    it("rollback family ketika data warga tidak lengkap", async () => {
      const house = await seedHouse(globalThis.testDb);
      const input = validResidentData({
        existingHouseId: house.id,
        wargaData: { noHp: "" },
      });
      const before = await tableCounts();
      const executor = createExecutorProxy();

      await expect(
        registerResidentOnlyService(
          input.houseData,
          input.familyData,
          input.wargaData,
          executor,
        ),
      ).rejects.toThrow("Data warga tidak lengkap");

      expect(await tableCounts()).toEqual(before);
      expectSavepointRollback(executor);
    });

    it("rollback family ketika NIK sudah terdaftar", async () => {
      const duplicateNik = `DUP-NIK-${uniqueSuffix()}`;
      const existingFamily = await seedFamily(globalThis.testDb);
      await seedWarga(globalThis.testDb, {
        familyId: existingFamily.id,
        houseId: existingFamily.houseId,
        nik: encryptEmails(duplicateNik),
      });
      const targetHouse = await seedHouse(globalThis.testDb);
      const input = validResidentData({
        existingHouseId: targetHouse.id,
        wargaData: { nik: duplicateNik },
      });
      const before = await tableCounts();
      const executor = createExecutorProxy();

      await expect(
        registerResidentOnlyService(
          input.houseData,
          input.familyData,
          input.wargaData,
          executor,
        ),
      ).rejects.toThrow(`NIK (${duplicateNik}) sudah terdaftar`);

      expect(await tableCounts()).toEqual(before);
      expectSavepointRollback(executor);
    });
  });

  describe("fault injection dan rollback", () => {
    it("rollback ketika insert family gagal", async () => {
      const input = validResidentData();
      const before = await tableCounts();
      const executor = createExecutorProxy(({ normalizedSql }) => {
        if (normalizedSql.startsWith("INSERT INTO family")) {
          throw new Error("Simulasi kegagalan insert family");
        }
        return undefined;
      });

      await expect(
        registerResidentOnlyService(
          input.houseData,
          input.familyData,
          input.wargaData,
          executor,
        ),
      ).rejects.toThrow("Simulasi kegagalan insert family");
      expect(await tableCounts()).toEqual(before);
      expectSavepointRollback(executor);
    });

    it("rollback ketika insert warga gagal", async () => {
      const input = validResidentData();
      const before = await tableCounts();
      const executor = createExecutorProxy(({ normalizedSql }) => {
        if (normalizedSql.startsWith("INSERT INTO warga")) {
          throw new Error("Simulasi kegagalan insert warga");
        }
        return undefined;
      });

      await expect(
        registerResidentOnlyService(
          input.houseData,
          input.familyData,
          input.wargaData,
          executor,
        ),
      ).rejects.toThrow("Simulasi kegagalan insert warga");
      expect(await tableCounts()).toEqual(before);
      expectSavepointRollback(executor);
    });

    it("rollback ketika update kepala_keluarga_id gagal", async () => {
      const input = validResidentData();
      const before = await tableCounts();
      const executor = createExecutorProxy(({ normalizedSql }) => {
        if (
          normalizedSql.startsWith(
            "UPDATE family SET kepala_keluarga_id = ? WHERE id = ?",
          )
        ) {
          throw new Error("Simulasi kegagalan update kepala keluarga");
        }
        return undefined;
      });

      await expect(
        registerResidentOnlyService(
          input.houseData,
          input.familyData,
          input.wargaData,
          executor,
        ),
      ).rejects.toThrow("Simulasi kegagalan update kepala keluarga");
      expect(await tableCounts()).toEqual(before);
      expectSavepointRollback(executor);
    });
  });

  it("menyimpan seluruh field sensitif sebagai ciphertext yang dapat didekripsi", async () => {
    const input = validResidentData();

    const result = await registerResidentOnlyService(
      input.houseData,
      input.familyData,
      input.wargaData,
      globalThis.testDb,
    );

    const graph = await findRegistrationGraph(result);
    expect(decryptEmails(graph.house.blok)).toBe(input.houseData.blok);
    expect(decryptEmails(graph.house.nomor)).toBe(input.houseData.nomor);
    expect(decryptEmails(graph.house.alamat)).toBe(input.houseData.alamat);
    expect(decryptEmails(graph.family.no_kk)).toBe(input.familyData.noKK);
    expect(decryptEmails(graph.warga.nik)).toBe(input.wargaData.nik);
    expect(decryptEmails(graph.warga.tgl_lahir)).toBe(
      input.wargaData.tglLahir,
    );
    expect(decryptEmails(graph.warga.no_hp)).toBe(input.wargaData.noHp);
  });

  describe("transaction ownership", () => {
    it("membuka, commit, dan release transaksi sendiri pada executor default", async () => {
      const house = await seedHouse(globalThis.testDb);
      const input = validResidentData({ existingHouseId: house.id });
      const ownedConnection = createOwnedConnectionFacade();
      const getConnectionSpy = jest
        .spyOn(pool, "getConnection")
        .mockResolvedValue(ownedConnection);

      const result = await registerResidentOnlyService(
        input.houseData,
        input.familyData,
        input.wargaData,
      );

      expect(result.houseId).toBe(house.id);
      expect(getConnectionSpy).toHaveBeenCalledTimes(1);
      expect(ownedConnection.beginTransaction).toHaveBeenCalledTimes(1);
      expect(ownedConnection.commit).toHaveBeenCalledTimes(1);
      expect(ownedConnection.rollback).not.toHaveBeenCalled();
      expect(ownedConnection.release).toHaveBeenCalledTimes(1);
    });

    it("hanya memakai savepoint tanpa mengontrol outer transaction pada executor injected", async () => {
      const house = await seedHouse(globalThis.testDb);
      const input = validResidentData({ existingHouseId: house.id });
      const executor = createExecutorProxy();

      const result = await registerResidentOnlyService(
        input.houseData,
        input.familyData,
        input.wargaData,
        executor,
      );

      expect(result.houseId).toBe(house.id);
      expect(executor.beginTransaction).not.toHaveBeenCalled();
      expect(executor.commit).not.toHaveBeenCalled();
      expect(executor.rollback).not.toHaveBeenCalled();
      expect(executor.release).not.toHaveBeenCalled();
      expect(
        executor.query.mock.calls.some(([sql]) =>
          normalizeSql(sql).startsWith(
            "SAVEPOINT sp_register_resident_only_",
          ),
        ),
      ).toBe(true);
      expect(
        executor.query.mock.calls.some(([sql]) =>
          normalizeSql(sql).startsWith(
            "RELEASE SAVEPOINT sp_register_resident_only_",
          ),
        ),
      ).toBe(true);
    });
  });

  it("mengabaikan ciphertext KK dan NIK lama yang tidak dapat didekripsi", async () => {
    const corruptFamily = await seedFamily(globalThis.testDb);
    const corruptWarga = await seedWarga(globalThis.testDb, {
      familyId: corruptFamily.id,
      houseId: corruptFamily.houseId,
    });
    const targetHouse = await seedHouse(globalThis.testDb);
    const input = validResidentData({
      existingHouseId: targetHouse.id,
      familyData: { noKK: corruptFamily.noKk },
      wargaData: { nik: corruptWarga.nik },
    });

    const result = await registerResidentOnlyService(
      input.houseData,
      input.familyData,
      input.wargaData,
      globalThis.testDb,
    );

    expect(result).toMatchObject({ houseId: targetHouse.id });
    const graph = await findRegistrationGraph(result);
    expect(decryptEmails(graph.family.no_kk)).toBe(corruptFamily.noKk);
    expect(decryptEmails(graph.warga.nik)).toBe(corruptWarga.nik);
  });
});
