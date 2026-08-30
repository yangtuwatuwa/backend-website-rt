import { afterEach, describe, expect, it, jest } from "@jest/globals";

import pool from "../../config/sqlconfig.js";
import {
  WargaDeletionError,
  deleteWarga,
} from "../../services/wargaDeletionService.js";
import {
  seedAccount,
  seedFamily,
  seedFamilyWithAccount,
  seedKasContribution,
  seedWarga,
  setFamilyHead,
} from "../helpers/seed.js";

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

async function captureError(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }

  throw new Error("Operasi seharusnya gagal, tetapi berhasil.");
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

  const executor = {
    execute: jest.fn((sql, params = []) => runQuery("execute", sql, params)),
    query: jest.fn((sql, params = []) => runQuery("query", sql, params)),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
  };

  return executor;
}

async function seedDeletionFamily({
  family: familyOverrides = {},
  members = [{}],
  headIndex = 0,
} = {}) {
  const family = await seedFamily(globalThis.testDb, familyOverrides);
  const warga = [];

  for (const memberOverrides of members) {
    warga.push(
      await seedWarga(globalThis.testDb, {
        familyId: family.id,
        houseId: family.houseId,
        ...memberOverrides,
      }),
    );
  }

  if (headIndex !== null) {
    await setFamilyHead(globalThis.testDb, family.id, warga[headIndex].id);
    family.kepalaKeluargaId = warga[headIndex].id;
  }

  return { family, house: family.house, warga };
}

async function findWarga(id) {
  const [rows] = await globalThis.testDb.execute(
    "SELECT * FROM warga WHERE id = ?",
    [id],
  );
  return rows[0] ?? null;
}

async function findFamily(id) {
  const [rows] = await globalThis.testDb.execute(
    "SELECT * FROM family WHERE id = ?",
    [id],
  );
  return rows[0] ?? null;
}

async function findHouse(id) {
  const [rows] = await globalThis.testDb.execute(
    "SELECT * FROM house WHERE id = ?",
    [id],
  );
  return rows[0] ?? null;
}

async function findAccount(id) {
  const [rows] = await globalThis.testDb.execute(
    "SELECT * FROM acount WHERE id = ?",
    [id],
  );
  return rows[0] ?? null;
}

async function findDeleteAuditLogs(wargaId) {
  const [rows] = await globalThis.testDb.execute(
    "SELECT * FROM access_logs WHERE event_type = 'DELETE_WARGA' ORDER BY id ASC",
  );

  return rows.filter((row) => {
    try {
      return Number(JSON.parse(row.details).warga_id) === Number(wargaId);
    } catch {
      return false;
    }
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("deleteWarga", () => {
  describe("validasi sebelum mutasi", () => {
    it("menolak INVALID_WARGA_ID sebelum menjalankan query", async () => {
      const executor = createExecutorProxy();

      for (const invalidId of ["abc", 0, -1, 1.5]) {
        await expect(deleteWarga(invalidId, {}, executor)).rejects.toMatchObject({
          name: "WargaDeletionError",
          status: 400,
          code: "INVALID_WARGA_ID",
        });
      }

      expect(executor.execute).not.toHaveBeenCalled();
    });

    it("mengembalikan WARGA_NOT_FOUND untuk ID yang tidak ada", async () => {
      const [rows] = await globalThis.testDb.execute(
        "SELECT COALESCE(MAX(id), 0) + 100000 AS missing_id FROM warga",
      );
      const missingId = Number(rows[0].missing_id);

      await expect(
        deleteWarga(missingId, {}, globalThis.testDb),
      ).rejects.toMatchObject({
        name: "WargaDeletionError",
        status: 404,
        code: "WARGA_NOT_FOUND",
      });

      expect(await findDeleteAuditLogs(missingId)).toHaveLength(0);
    });

    it("menolak ACTIVE_HEAD_ACCOUNT dan melaporkan accountIds", async () => {
      const fixture = await seedFamilyWithAccount(globalThis.testDb);

      const error = await captureError(
        deleteWarga(fixture.warga.id, {}, globalThis.testDb),
      );

      expect(error).toBeInstanceOf(WargaDeletionError);
      expect(error).toMatchObject({
        status: 409,
        code: "ACTIVE_HEAD_ACCOUNT",
        details: { accountIds: [fixture.account.id] },
      });
      expect((await findWarga(fixture.warga.id)).status_data).toBe("diterima");
      expect(await findFamily(fixture.family.id)).not.toBeNull();
      expect(await findAccount(fixture.account.id)).not.toBeNull();
      expect(await findDeleteAuditLogs(fixture.warga.id)).toHaveLength(0);
    });

    it("menolak HEAD_REPLACEMENT_REQUIRED dengan candidateMembers terurut", async () => {
      const fixture = await seedDeletionFamily({
        members: [
          { nama: "Kepala Test" },
          { nama: "Calon Pertama" },
          { nama: "Calon Kedua" },
        ],
      });
      const [head, firstCandidate, secondCandidate] = fixture.warga;

      const error = await captureError(
        deleteWarga(head.id, {}, globalThis.testDb),
      );

      expect(error).toBeInstanceOf(WargaDeletionError);
      expect(error).toMatchObject({
        status: 409,
        code: "HEAD_REPLACEMENT_REQUIRED",
        details: {
          candidateMembers: [
            { id: firstCandidate.id, nama: firstCandidate.nama },
            { id: secondCandidate.id, nama: secondCandidate.nama },
          ],
        },
      });
      expect((await findWarga(head.id)).status_data).toBe("diterima");
      expect(await findDeleteAuditLogs(head.id)).toHaveLength(0);
    });
  });

  describe("jalur mutasi", () => {
    it("melakukan soft-delete anggota non-kepala ketika family masih berisi", async () => {
      const fixture = await seedDeletionFamily({
        members: [{ nama: "Kepala Aktif" }, { nama: "Anggota Dihapus" }],
      });
      const [head, target] = fixture.warga;
      const options = {
        actorId: 77,
        actorUsername: "rt-test",
        ipAddress: "127.0.0.1",
        userAgent: "jest",
      };

      const result = await deleteWarga(target.id, options, globalThis.testDb);

      expect(result).toEqual({
        deletedId: target.id,
        nama: target.nama,
        family_id: fixture.family.id,
        mode: "soft_delete",
        familyDeleted: false,
      });
      expect((await findWarga(target.id)).status_data).toBe("ditolak");
      expect((await findWarga(head.id)).status_data).toBe("diterima");
      expect(await findFamily(fixture.family.id)).not.toBeNull();
      expect(await findHouse(fixture.house.id)).not.toBeNull();

      const auditLogs = await findDeleteAuditLogs(target.id);
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0]).toMatchObject({
        username: options.actorUsername,
        ip_address: options.ipAddress,
        user_agent: options.userAgent,
        status: "success",
      });
      expect(JSON.parse(auditLogs[0].details)).toMatchObject({
        actor_id: options.actorId,
        warga_id: target.id,
        family_id: fixture.family.id,
        family_deleted: false,
      });
    });

    it("rollback savepoint ketika ACTIVE_FAMILY_ACCOUNT ditemukan setelah soft-delete", async () => {
      const fixture = await seedDeletionFamily({ headIndex: null });
      const target = fixture.warga[0];
      const account = await seedAccount(globalThis.testDb, {
        familyId: fixture.family.id,
      });

      const error = await captureError(
        deleteWarga(target.id, {}, globalThis.testDb),
      );

      expect(error).toMatchObject({
        status: 409,
        code: "ACTIVE_FAMILY_ACCOUNT",
        details: { accountIds: [account.id] },
      });
      expect((await findWarga(target.id)).status_data).toBe("diterima");
      expect(await findFamily(fixture.family.id)).not.toBeNull();
      expect(await findAccount(account.id)).not.toBeNull();
      expect((await findHouse(fixture.house.id)).status).toBe("pribadi");
      expect(await findDeleteAuditLogs(target.id)).toHaveLength(0);
    });

    it("rollback savepoint ketika FAMILY_HISTORY_REQUIRES_ARCHIVE ditemukan", async () => {
      const fixture = await seedDeletionFamily();
      const target = fixture.warga[0];
      const contribution = await seedKasContribution(globalThis.testDb, {
        familyId: fixture.family.id,
      });

      const error = await captureError(
        deleteWarga(target.id, {}, globalThis.testDb),
      );

      expect(error).toMatchObject({
        status: 409,
        code: "FAMILY_HISTORY_REQUIRES_ARCHIVE",
      });
      expect(Number(error.details.bills_total)).toBe(0);
      expect(Number(error.details.payments_total)).toBe(0);
      expect(Number(error.details.kas_total)).toBe(1);
      expect((await findWarga(target.id)).status_data).toBe("diterima");
      expect(await findFamily(fixture.family.id)).not.toBeNull();
      const [historyRows] = await globalThis.testDb.execute(
        "SELECT id FROM kas_contributions WHERE id = ?",
        [contribution.id],
      );
      expect(historyRows).toHaveLength(1);
      expect(await findDeleteAuditLogs(target.id)).toHaveLength(0);
    });

    it("melakukan cascade lengkap untuk warga terakhir tanpa akun atau histori", async () => {
      const fixture = await seedDeletionFamily();
      const target = fixture.warga[0];

      const result = await deleteWarga(target.id, {}, globalThis.testDb);

      expect(result).toEqual({
        deletedId: target.id,
        nama: target.nama,
        family_id: fixture.family.id,
        mode: "family_cascade",
        familyDeleted: true,
      });
      expect(await findWarga(target.id)).toBeNull();
      expect(await findFamily(fixture.family.id)).toBeNull();
      expect((await findHouse(fixture.house.id)).status).toBe("available");

      const auditLogs = await findDeleteAuditLogs(target.id);
      expect(auditLogs).toHaveLength(1);
      expect(JSON.parse(auditLogs[0].details)).toMatchObject({
        warga_id: target.id,
        family_id: fixture.family.id,
        family_deleted: true,
      });
    });
  });

  describe("failure injection", () => {
    it("mengembalikan WARGA_DELETE_RACE ketika soft-delete tidak memengaruhi baris", async () => {
      const fixture = await seedDeletionFamily({
        members: [{ nama: "Kepala" }, { nama: "Target Race" }],
      });
      const target = fixture.warga[1];
      const executor = createExecutorProxy(({ normalizedSql }) => {
        if (
          normalizedSql.startsWith("UPDATE warga") &&
          normalizedSql.includes("SET status_data = 'ditolak'")
        ) {
          return { handled: true, value: [{ affectedRows: 0 }] };
        }
        return undefined;
      });

      const error = await captureError(deleteWarga(target.id, {}, executor));

      expect(error).toMatchObject({
        status: 409,
        code: "WARGA_DELETE_RACE",
      });
      expect((await findWarga(target.id)).status_data).toBe("diterima");
      expect(await findDeleteAuditLogs(target.id)).toHaveLength(0);
      expect(
        executor.query.mock.calls.some(([sql]) =>
          normalizeSql(sql).startsWith("ROLLBACK TO SAVEPOINT"),
        ),
      ).toBe(true);
    });

    it("rollback seluruh cascade ketika penulisan audit log gagal", async () => {
      const fixture = await seedDeletionFamily();
      const target = fixture.warga[0];
      const executor = createExecutorProxy(({ normalizedSql }) => {
        if (normalizedSql.startsWith("INSERT INTO access_logs")) {
          throw new Error("Simulasi kegagalan audit log");
        }
        return undefined;
      });

      await expect(deleteWarga(target.id, {}, executor)).rejects.toThrow(
        "Simulasi kegagalan audit log",
      );

      expect((await findWarga(target.id)).status_data).toBe("diterima");
      expect(await findFamily(fixture.family.id)).not.toBeNull();
      expect((await findHouse(fixture.house.id)).status).toBe("pribadi");
      expect(await findDeleteAuditLogs(target.id)).toHaveLength(0);
      expect(
        executor.query.mock.calls.some(([sql]) =>
          normalizeSql(sql).startsWith("ROLLBACK TO SAVEPOINT"),
        ),
      ).toBe(true);
    });
  });

  describe("transaction ownership", () => {
    it("membuka, commit, dan release transaksi sendiri pada executor default", async () => {
      const fixture = await seedDeletionFamily({
        members: [{ nama: "Kepala" }, { nama: "Target Owned" }],
      });
      const target = fixture.warga[1];
      const facadeSavepoint = "sp_test_owned_delete_warga";
      const ownedConnection = {
        execute: jest.fn((sql, params = []) =>
          globalThis.testDb.execute(sql, params),
        ),
        beginTransaction: jest.fn(() =>
          globalThis.testDb.query(`SAVEPOINT ${facadeSavepoint}`),
        ),
        commit: jest.fn(() =>
          globalThis.testDb.query(`RELEASE SAVEPOINT ${facadeSavepoint}`),
        ),
        rollback: jest.fn(async () => {
          await globalThis.testDb.query(
            `ROLLBACK TO SAVEPOINT ${facadeSavepoint}`,
          );
          await globalThis.testDb.query(
            `RELEASE SAVEPOINT ${facadeSavepoint}`,
          );
        }),
        release: jest.fn(),
      };
      const getConnectionSpy = jest
        .spyOn(pool, "getConnection")
        .mockResolvedValue(ownedConnection);

      const result = await deleteWarga(target.id);

      expect(result.mode).toBe("soft_delete");
      expect(getConnectionSpy).toHaveBeenCalledTimes(1);
      expect(ownedConnection.beginTransaction).toHaveBeenCalledTimes(1);
      expect(ownedConnection.commit).toHaveBeenCalledTimes(1);
      expect(ownedConnection.rollback).not.toHaveBeenCalled();
      expect(ownedConnection.release).toHaveBeenCalledTimes(1);
      expect((await findWarga(target.id)).status_data).toBe("ditolak");
    });

    it("tidak mengontrol outer transaction ketika executor diinjeksi", async () => {
      const fixture = await seedDeletionFamily({
        members: [{ nama: "Kepala" }, { nama: "Target Injected" }],
      });
      const target = fixture.warga[1];
      const executor = createExecutorProxy();

      const result = await deleteWarga(target.id, {}, executor);

      expect(result.mode).toBe("soft_delete");
      expect(executor.beginTransaction).not.toHaveBeenCalled();
      expect(executor.commit).not.toHaveBeenCalled();
      expect(executor.rollback).not.toHaveBeenCalled();
      expect(executor.release).not.toHaveBeenCalled();
      expect(
        executor.query.mock.calls.some(([sql]) =>
          normalizeSql(sql).startsWith("SAVEPOINT sp_delete_warga_"),
        ),
      ).toBe(true);
      expect(
        executor.query.mock.calls.some(([sql]) =>
          normalizeSql(sql).startsWith(
            "RELEASE SAVEPOINT sp_delete_warga_",
          ),
        ),
      ).toBe(true);
      expect((await findWarga(target.id)).status_data).toBe("ditolak");
    });
  });
});
