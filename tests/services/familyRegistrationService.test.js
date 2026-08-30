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
  computeBlindIndex,
  decryptEmail,
  encryptEmail,
  normalizeEmail,
} from "../../lib/crypto/email.js";
import {
  seedAccount,
  seedFamily,
  seedHouse,
} from "../helpers/seed.js";

const argonhashMock = jest.fn();

jest.unstable_mockModule("../../helpers/argon2.js", () => ({
  argonhash: argonhashMock,
}));

const importLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
const [{ registerFamilyService }, { decryptEmails }] = await Promise.all([
  import("../../services/familyRegistrationService.js"),
  import("../../helpers/ciihper.js"),
]);
importLogSpy.mockRestore();

const MOCK_PASSWORD_HASH = "$argon2id$mock-family-password-hash";
let dataSequence = 0;
let ownedFacadeCounter = 0;

function uniqueSuffix() {
  dataSequence += 1;
  return `${Date.now()}-${process.pid}-${dataSequence}`;
}

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

function validRegistrationData(overrides = {}) {
  const suffix = uniqueSuffix();
  const email = `family-${suffix}@example.test`;
  const base = {
    houseData: overrides.existingHouseId
      ? { houseId: overrides.existingHouseId }
      : {
          blok: `B-${suffix}`,
          nomor: `N-${suffix}`,
          alamat: `Alamat keluarga ${suffix}`,
          status: "pribadi",
        },
    familyData: { noKK: `KK-${suffix}` },
    headOfFamilyData: {
      nik: `NIK-${suffix}`,
      nama: `Kepala ${suffix}`,
      jenisKelamin: "Laki-laki",
      tglLahir: "1990-01-01",
      statusHidup: "Hidup",
      noHp: `08${String(dataSequence).padStart(10, "0")}`,
      umur: 36,
      email,
    },
    accountData: {
      username: `family_user_${suffix}`,
      password: "password-test",
      email,
    },
  };

  return {
    houseData: { ...base.houseData, ...overrides.houseData },
    familyData: { ...base.familyData, ...overrides.familyData },
    headOfFamilyData: {
      ...base.headOfFamilyData,
      ...overrides.headOfFamilyData,
    },
    accountData: { ...base.accountData, ...overrides.accountData },
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
  const savepointName = `sp_test_owned_family_${++ownedFacadeCounter}`;

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
      (SELECT COUNT(*) FROM warga) AS warga_total,
      (SELECT COUNT(*) FROM acount) AS account_total`,
  );

  return {
    house: Number(rows[0].house_total),
    family: Number(rows[0].family_total),
    warga: Number(rows[0].warga_total),
    account: Number(rows[0].account_total),
  };
}

async function findRegistrationGraph(result) {
  const [[houseRows], [familyRows], [wargaRows], [accountRows]] =
    await Promise.all([
      globalThis.testDb.execute("SELECT * FROM house WHERE id = ?", [
        result.houseId,
      ]),
      globalThis.testDb.execute("SELECT * FROM family WHERE id = ?", [
        result.familyId,
      ]),
      globalThis.testDb.execute("SELECT * FROM warga WHERE id = ?", [
        result.kepalaKeluargaId,
      ]),
      globalThis.testDb.execute(
        "SELECT * FROM acount WHERE family_id = ?",
        [result.familyId],
      ),
    ]);

  return {
    house: houseRows[0] ?? null,
    family: familyRows[0] ?? null,
    warga: wargaRows[0] ?? null,
    account: accountRows[0] ?? null,
  };
}

async function seedAccountWithEmail(email, overrides = {}) {
  const normalized = normalizeEmail(email);
  return seedAccount(globalThis.testDb, {
    emailEncrypted: encryptEmail(normalized),
    emailBlindIdx: computeBlindIndex(normalized),
    ...overrides,
  });
}

function expectServiceError(result, message) {
  expect(typeof result).toBe("string");
  expect(result).toContain(`error karena: ${message}`);
}

function expectSavepointRollback(executor) {
  expect(
    executor.query.mock.calls.some(([sql]) =>
      normalizeSql(sql).startsWith(
        "ROLLBACK TO SAVEPOINT sp_register_family_",
      ),
    ),
  ).toBe(true);
}

beforeEach(() => {
  argonhashMock.mockReset();
  argonhashMock.mockResolvedValue(MOCK_PASSWORD_HASH);
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("registerFamilyService", () => {
  describe("jalur sukses", () => {
    it("membuat family, kepala keluarga, dan akun pada existing house kosong", async () => {
      const house = await seedHouse(globalThis.testDb);
      const input = validRegistrationData({ existingHouseId: house.id });
      const before = await tableCounts();

      const result = await registerFamilyService(
        input.houseData,
        input.familyData,
        input.headOfFamilyData,
        input.accountData,
        globalThis.testDb,
      );

      expect(typeof result).toBe("object");
      expect(result.houseId).toBe(house.id);
      const after = await tableCounts();
      expect(after).toEqual({
        house: before.house,
        family: before.family + 1,
        warga: before.warga + 1,
        account: before.account + 1,
      });

      const graph = await findRegistrationGraph(result);
      expect(graph.family).toMatchObject({
        house_id: house.id,
        kepala_keluarga_id: result.kepalaKeluargaId,
      });
      expect(graph.warga).toMatchObject({
        family_id: result.familyId,
        house_id: house.id,
        status_data: "diterima",
      });
      expect(graph.account).toMatchObject({
        username: input.accountData.username,
        password: MOCK_PASSWORD_HASH,
        role: "warga",
        family_id: result.familyId,
        must_change_password: 1,
      });
      expect(decryptEmail(graph.account.email_encrypted)).toBe(
        input.accountData.email,
      );
    });

    it("membuat house baru beserta seluruh graph keluarga", async () => {
      const input = validRegistrationData();
      const before = await tableCounts();

      const result = await registerFamilyService(
        input.houseData,
        input.familyData,
        input.headOfFamilyData,
        input.accountData,
        globalThis.testDb,
      );

      expect(typeof result).toBe("object");
      const after = await tableCounts();
      expect(after).toEqual({
        house: before.house + 1,
        family: before.family + 1,
        warga: before.warga + 1,
        account: before.account + 1,
      });

      const graph = await findRegistrationGraph(result);
      expect(graph.house.status).toBe(input.houseData.status);
      expect(graph.house.blok).not.toBe(input.houseData.blok);
      expect(graph.house.nomor).not.toBe(input.houseData.nomor);
      expect(graph.house.alamat).not.toBe(input.houseData.alamat);
      expect(decryptEmails(graph.house.blok)).toBe(input.houseData.blok);
      expect(decryptEmails(graph.house.nomor)).toBe(input.houseData.nomor);
      expect(decryptEmails(graph.house.alamat)).toBe(input.houseData.alamat);
      expect(decryptEmails(graph.family.no_kk)).toBe(input.familyData.noKK);
      expect(graph.family).toMatchObject({
        house_id: result.houseId,
        kepala_keluarga_id: result.kepalaKeluargaId,
      });
      expect(graph.warga).toMatchObject({
        family_id: result.familyId,
        house_id: result.houseId,
      });
      expect(graph.account.family_id).toBe(result.familyId);
    });
  });

  describe("validasi house dan occupancy", () => {
    it("menolak occupied house sebelum mutation dengan lock house lalu family", async () => {
      const house = await seedHouse(globalThis.testDb);
      const occupyingFamily = await seedFamily(globalThis.testDb, {
        houseId: house.id,
      });
      const input = validRegistrationData({ existingHouseId: house.id });
      const before = await tableCounts();
      const executor = createExecutorProxy();

      const result = await registerFamilyService(
        input.houseData,
        input.familyData,
        input.headOfFamilyData,
        input.accountData,
        executor,
      );

      expectServiceError(
        result,
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
      const [familyRows] = await globalThis.testDb.execute(
        "SELECT id FROM family WHERE id = ? AND house_id = ?",
        [occupyingFamily.id, house.id],
      );
      expect(familyRows).toHaveLength(1);
    });

    it("mengembalikan error ketika existing house tidak ditemukan tanpa mutation", async () => {
      const [rows] = await globalThis.testDb.execute(
        "SELECT COALESCE(MAX(id), 0) + 100000 AS missing_id FROM house",
      );
      const missingId = Number(rows[0].missing_id);
      const input = validRegistrationData({ existingHouseId: missingId });
      const before = await tableCounts();
      const executor = createExecutorProxy();

      const result = await registerFamilyService(
        input.houseData,
        input.familyData,
        input.headOfFamilyData,
        input.accountData,
        executor,
      );

      expectServiceError(
        result,
        `Data rumah dengan ID ${missingId} tidak ditemukan`,
      );
      expect(await tableCounts()).toEqual(before);
      expect(executor.query).not.toHaveBeenCalled();
      expect(
        executor.execute.mock.calls.some(([sql]) =>
          /^(INSERT|UPDATE|DELETE)\b/.test(normalizeSql(sql)),
        ),
      ).toBe(false);
    });
  });

  describe("rollback setelah mutation", () => {
    it("rollback house baru ketika nomor KK kosong", async () => {
      const input = validRegistrationData({ familyData: { noKK: "" } });
      const before = await tableCounts();
      const executor = createExecutorProxy();

      const result = await registerFamilyService(
        input.houseData,
        input.familyData,
        input.headOfFamilyData,
        input.accountData,
        executor,
      );

      expectServiceError(result, "Nomor KK wajib diisi");
      expect(await tableCounts()).toEqual(before);
      expectSavepointRollback(executor);
    });

    it("rollback family ketika data kepala keluarga tidak lengkap", async () => {
      const house = await seedHouse(globalThis.testDb);
      const input = validRegistrationData({
        existingHouseId: house.id,
        headOfFamilyData: { noHp: "" },
      });
      const before = await tableCounts();
      const executor = createExecutorProxy();

      const result = await registerFamilyService(
        input.houseData,
        input.familyData,
        input.headOfFamilyData,
        input.accountData,
        executor,
      );

      expectServiceError(result, "Data kepala keluarga tidak lengkap");
      expect(await tableCounts()).toEqual(before);
      expectSavepointRollback(executor);
    });

    it("rollback graph ketika insert warga gagal", async () => {
      const input = validRegistrationData();
      const before = await tableCounts();
      const executor = createExecutorProxy(({ normalizedSql }) => {
        if (normalizedSql.startsWith("INSERT INTO warga")) {
          throw new Error("Simulasi kegagalan insert warga");
        }
        return undefined;
      });

      const result = await registerFamilyService(
        input.houseData,
        input.familyData,
        input.headOfFamilyData,
        input.accountData,
        executor,
      );

      expectServiceError(result, "Simulasi kegagalan insert warga");
      expect(await tableCounts()).toEqual(before);
      expectSavepointRollback(executor);
    });

    it("rollback graph ketika update kepala_keluarga_id gagal", async () => {
      const input = validRegistrationData();
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

      const result = await registerFamilyService(
        input.houseData,
        input.familyData,
        input.headOfFamilyData,
        input.accountData,
        executor,
      );

      expectServiceError(result, "Simulasi kegagalan update kepala keluarga");
      expect(await tableCounts()).toEqual(before);
      expectSavepointRollback(executor);
    });

    it("rollback graph ketika username sudah digunakan", async () => {
      const duplicateAccount = await seedAccount(globalThis.testDb);
      const input = validRegistrationData({
        accountData: { username: duplicateAccount.username },
      });
      const before = await tableCounts();
      const executor = createExecutorProxy();

      const result = await registerFamilyService(
        input.houseData,
        input.familyData,
        input.headOfFamilyData,
        input.accountData,
        executor,
      );

      expectServiceError(result, "Username sudah digunakan oleh akun lain");
      expect(await tableCounts()).toEqual(before);
      expectSavepointRollback(executor);
    });

    it("rollback graph ketika email sudah terdaftar", async () => {
      const duplicateEmail = `duplicate-${uniqueSuffix()}@example.test`;
      await seedAccountWithEmail(duplicateEmail);
      const input = validRegistrationData({
        accountData: { email: duplicateEmail },
      });
      const before = await tableCounts();
      const executor = createExecutorProxy();

      const result = await registerFamilyService(
        input.houseData,
        input.familyData,
        input.headOfFamilyData,
        input.accountData,
        executor,
      );

      expectServiceError(result, "Email sudah terdaftar pada akun lain");
      expect(await tableCounts()).toEqual(before);
      expectSavepointRollback(executor);
    });

    it("rollback graph ketika password terlalu pendek", async () => {
      const input = validRegistrationData({
        accountData: { password: "123" },
      });
      const before = await tableCounts();
      const executor = createExecutorProxy();

      const result = await registerFamilyService(
        input.houseData,
        input.familyData,
        input.headOfFamilyData,
        input.accountData,
        executor,
      );

      expectServiceError(result, "Password minimal 6 karakter");
      expect(await tableCounts()).toEqual(before);
      expectSavepointRollback(executor);
      expect(argonhashMock).not.toHaveBeenCalled();
    });

    it("rollback graph ketika hashing password gagal", async () => {
      const input = validRegistrationData();
      const before = await tableCounts();
      const executor = createExecutorProxy();
      argonhashMock.mockResolvedValueOnce(undefined);

      const result = await registerFamilyService(
        input.houseData,
        input.familyData,
        input.headOfFamilyData,
        input.accountData,
        executor,
      );

      expect(typeof result).toBe("string");
      expect(result).toContain("error karena:");
      expect(argonhashMock).toHaveBeenCalledWith(input.accountData.password);
      expect(await tableCounts()).toEqual(before);
      expectSavepointRollback(executor);
    });

    it("rollback graph ketika insert account gagal", async () => {
      const input = validRegistrationData();
      const before = await tableCounts();
      const executor = createExecutorProxy(({ normalizedSql }) => {
        if (normalizedSql.startsWith("INSERT INTO acount")) {
          throw new Error("Simulasi kegagalan insert account");
        }
        return undefined;
      });

      const result = await registerFamilyService(
        input.houseData,
        input.familyData,
        input.headOfFamilyData,
        input.accountData,
        executor,
      );

      expectServiceError(result, "Simulasi kegagalan insert account");
      expect(await tableCounts()).toEqual(before);
      expectSavepointRollback(executor);
    });
  });

  describe("transaction ownership", () => {
    it("membuka, commit, dan release transaksi sendiri pada executor default", async () => {
      const house = await seedHouse(globalThis.testDb);
      const input = validRegistrationData({ existingHouseId: house.id });
      const ownedConnection = createOwnedConnectionFacade();
      const getConnectionSpy = jest
        .spyOn(pool, "getConnection")
        .mockResolvedValue(ownedConnection);

      const result = await registerFamilyService(
        input.houseData,
        input.familyData,
        input.headOfFamilyData,
        input.accountData,
      );

      expect(typeof result).toBe("object");
      expect(getConnectionSpy).toHaveBeenCalledTimes(1);
      expect(ownedConnection.beginTransaction).toHaveBeenCalledTimes(1);
      expect(ownedConnection.commit).toHaveBeenCalledTimes(1);
      expect(ownedConnection.rollback).not.toHaveBeenCalled();
      expect(ownedConnection.release).toHaveBeenCalledTimes(1);
    });

    it("hanya memakai savepoint tanpa mengontrol outer transaction pada executor injected", async () => {
      const house = await seedHouse(globalThis.testDb);
      const input = validRegistrationData({ existingHouseId: house.id });
      const executor = createExecutorProxy();

      const result = await registerFamilyService(
        input.houseData,
        input.familyData,
        input.headOfFamilyData,
        input.accountData,
        executor,
      );

      expect(typeof result).toBe("object");
      expect(executor.beginTransaction).not.toHaveBeenCalled();
      expect(executor.commit).not.toHaveBeenCalled();
      expect(executor.rollback).not.toHaveBeenCalled();
      expect(executor.release).not.toHaveBeenCalled();
      expect(
        executor.query.mock.calls.some(([sql]) =>
          normalizeSql(sql).startsWith("SAVEPOINT sp_register_family_"),
        ),
      ).toBe(true);
      expect(
        executor.query.mock.calls.some(([sql]) =>
          normalizeSql(sql).startsWith(
            "RELEASE SAVEPOINT sp_register_family_",
          ),
        ),
      ).toBe(true);
    });
  });
});
