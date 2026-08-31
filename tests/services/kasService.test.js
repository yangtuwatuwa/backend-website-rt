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
  seedAccount,
  seedFamilyWithAccount,
  seedKasContribution,
} from "../helpers/seed.js";

const emitSyncEventMock = jest.fn();

jest.unstable_mockModule("../../utils/socket.js", () => ({
  emitSyncEvent: emitSyncEventMock,
}));

const notificationModule = await import(
  "../../services/notificationService.js"
);
const actualCreateNotification = notificationModule.createNotification;
const createNotificationMock = jest.fn();

jest.unstable_mockModule("../../services/notificationService.js", () => ({
  ...notificationModule,
  createNotification: createNotificationMock,
}));

const {
  getKasAuditService,
  getMyKasHistoryService,
  getPendingKasContributionsService,
  submitKasContributionService,
  verifyKasContributionService,
} = await import("../../services/kasService.js");

let ownedFacadeCounter = 0;

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
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
  const savepointName = `sp_test_owned_kas_${++ownedFacadeCounter}`;

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

async function seedKasFixture() {
  const fixture = await seedFamilyWithAccount(globalThis.testDb);
  const actor = await seedAccount(globalThis.testDb, {
    role: "bendahara",
    familyId: null,
  });

  return { ...fixture, actor };
}

async function findContribution(id) {
  const [rows] = await globalThis.testDb.execute(
    "SELECT * FROM kas_contributions WHERE id = ?",
    [id],
  );
  return rows[0] ?? null;
}

async function findFamilyContributions(familyId) {
  const [rows] = await globalThis.testDb.execute(
    "SELECT * FROM kas_contributions WHERE family_id = ? ORDER BY id ASC",
    [familyId],
  );
  return rows;
}

async function findKasLedgerEntries() {
  const [rows] = await globalThis.testDb.execute(
    "SELECT * FROM financial_ledger WHERE source_type = 'kas' ORDER BY id ASC",
  );
  return rows;
}

async function findKasNotifications(referenceId) {
  const [rows] = await globalThis.testDb.execute(
    `SELECT * FROM notifications
     WHERE type = 'kas' AND reference_type = 'kas_contribution' AND reference_id = ?
     ORDER BY id ASC`,
    [referenceId],
  );
  return rows;
}

function expectNoTransactionOwnership(executor) {
  expect(executor.beginTransaction).not.toHaveBeenCalled();
  expect(executor.commit).not.toHaveBeenCalled();
  expect(executor.rollback).not.toHaveBeenCalled();
  expect(executor.release).not.toHaveBeenCalled();
}

function expectSavepointProtocol(executor, prefix, { rolledBack = false } = {}) {
  const querySql = executor.query.mock.calls.map(([sql]) => normalizeSql(sql));
  const executeSql = executor.execute.mock.calls.map(([sql]) =>
    normalizeSql(sql),
  );

  expect(querySql.some((sql) => sql.startsWith(`SAVEPOINT ${prefix}`))).toBe(
    true,
  );
  expect(
    querySql.some((sql) => sql.startsWith(`RELEASE SAVEPOINT ${prefix}`)),
  ).toBe(true);

  if (rolledBack) {
    expect(
      querySql.some((sql) =>
        sql.startsWith(`ROLLBACK TO SAVEPOINT ${prefix}`),
      ),
    ).toBe(true);
  }

  expect(
    executeSql.some((sql) =>
      /^(SAVEPOINT|ROLLBACK TO SAVEPOINT|RELEASE SAVEPOINT)\b/.test(sql),
    ),
  ).toBe(false);
}

beforeEach(() => {
  emitSyncEventMock.mockReset();
  createNotificationMock.mockReset();
  createNotificationMock.mockImplementation((payload, executor) =>
    actualCreateNotification(payload, executor ?? globalThis.testDb),
  );
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("submitKasContributionService", () => {
  it("mencatat cash_to_bendahara sebagai approved bersama ledger dalam satu savepoint", async () => {
    const fixture = await seedKasFixture();
    const executor = createExecutorProxy();

    const result = await submitKasContributionService(
      {
        familyId: fixture.family.id,
        amount: "75000",
        category: " Sosial ",
        description: "  Bantuan warga  ",
        channel: "cash_to_bendahara",
        recordedBy: fixture.actor.id,
      },
      executor,
    );

    expect(result).toMatchObject({ status: "approved" });
    const contribution = await findContribution(result.contribution_id);
    expect(contribution).toMatchObject({
      family_id: fixture.family.id,
      category: "sosial",
      description: "Bantuan warga",
      channel: "cash_to_bendahara",
      proof_url: "cash_in_hand",
      status: "approved",
      recorded_by: fixture.actor.id,
      verified_by: fixture.actor.id,
    });
    expect(Number(contribution.amount)).toBe(75000);
    expect(contribution.verified_at).not.toBeNull();

    const ledger = await findKasLedgerEntries();
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ type: "in", source_type: "kas" });
    expect(Number(ledger[0].amount)).toBe(75000);
    expect(ledger[0].description).toContain("Iuran Kas [SOSIAL]");
    expect(ledger[0].description).toContain(`KK ID ${fixture.family.id}`);
    expectNoTransactionOwnership(executor);
    expectSavepointProtocol(executor, "sp_submit_kas_");
  });

  it("rollback contribution ketika penulisan ledger gagal", async () => {
    const fixture = await seedKasFixture();
    const executor = createExecutorProxy(({ normalizedSql }) => {
      if (normalizedSql.startsWith("INSERT INTO financial_ledger")) {
        throw new Error("Simulasi kegagalan ledger kas");
      }
      return undefined;
    });

    const result = await submitKasContributionService(
      {
        familyId: fixture.family.id,
        amount: 90000,
        category: "kegiatan",
        description: "Kas acara RT",
        channel: "cash_to_bendahara",
        recordedBy: fixture.actor.id,
      },
      executor,
    );

    expect(result.error).toContain("Simulasi kegagalan ledger kas");
    expect(await findFamilyContributions(fixture.family.id)).toHaveLength(0);
    expect(await findKasLedgerEntries()).toHaveLength(0);
    expectNoTransactionOwnership(executor);
    expectSavepointProtocol(executor, "sp_submit_kas_", {
      rolledBack: true,
    });
  });

  it.each([
    ["transfer", "/uploads/bukti-kas.jpg"],
    ["cash_to_rt", null],
  ])(
    "mencatat tepat satu contribution pending untuk channel %s tanpa ledger",
    async (channel, proofUrl) => {
      const fixture = await seedKasFixture();
      const executor = createExecutorProxy();

      const result = await submitKasContributionService(
        {
          familyId: fixture.family.id,
          amount: 50000,
          category: "kematian",
          description: "Iuran keluarga",
          channel,
          proofUrl,
          recordedBy: fixture.account.id,
        },
        executor,
      );

      expect(result).toMatchObject({ status: "pending" });
      const contributions = await findFamilyContributions(fixture.family.id);
      expect(contributions).toHaveLength(1);
      expect(contributions[0]).toMatchObject({
        id: result.contribution_id,
        status: "pending",
        channel,
        proof_url: proofUrl,
      });
      expect(await findKasLedgerEntries()).toHaveLength(0);
      expectNoTransactionOwnership(executor);
      expectSavepointProtocol(executor, "sp_submit_kas_");
    },
  );
});

describe("verifyKasContributionService", () => {
  it("mengembalikan error tanpa mutation atau savepoint ketika contribution tidak ditemukan", async () => {
    const executor = createExecutorProxy();
    const [rows] = await globalThis.testDb.execute(
      "SELECT COALESCE(MAX(id), 0) + 100000 AS missing_id FROM kas_contributions",
    );

    const result = await verifyKasContributionService(
      {
        contributionId: Number(rows[0].missing_id),
        decision: "approved",
        actorId: 1,
      },
      executor,
    );

    expect(result.error).toBe("Data iuran kas tidak ditemukan!");
    expect(executor.query).not.toHaveBeenCalled();
    expect(await findKasLedgerEntries()).toHaveLength(0);
    expect(createNotificationMock).not.toHaveBeenCalled();
    expectNoTransactionOwnership(executor);
  });

  it.each(["approved", "rejected"])(
    "mengembalikan error tanpa mutation atau savepoint ketika status sudah %s",
    async (status) => {
      const fixture = await seedKasFixture();
      const contribution = await seedKasContribution(globalThis.testDb, {
        familyId: fixture.family.id,
        status,
        rejectReason: status === "rejected" ? "Sudah ditolak" : null,
      });
      const executor = createExecutorProxy();

      const result = await verifyKasContributionService(
        {
          contributionId: contribution.id,
          decision: "approved",
          actorId: fixture.actor.id,
        },
        executor,
      );

      expect(result.error).toContain("sudah pernah diproses");
      expect((await findContribution(contribution.id)).status).toBe(status);
      expect(executor.query).not.toHaveBeenCalled();
      expect(await findKasLedgerEntries()).toHaveLength(0);
      expect(createNotificationMock).not.toHaveBeenCalled();
      expectNoTransactionOwnership(executor);
    },
  );

  it("approve memperbarui status serta membuat ledger dan notification DB", async () => {
    const fixture = await seedKasFixture();
    const contribution = await seedKasContribution(globalThis.testDb, {
      familyId: fixture.family.id,
      amount: 125000,
      category: "kegiatan",
      description: "Perayaan kampung",
      status: "pending",
      recordedBy: fixture.account.id,
    });
    const executor = createExecutorProxy();

    const result = await verifyKasContributionService(
      {
        contributionId: contribution.id,
        decision: "approved",
        actorId: fixture.actor.id,
      },
      executor,
    );

    expect(result).toMatchObject({
      contribution_id: contribution.id,
      status: "approved",
    });
    const stored = await findContribution(contribution.id);
    expect(stored).toMatchObject({
      status: "approved",
      reject_reason: null,
      verified_by: fixture.actor.id,
    });
    expect(stored.verified_at).not.toBeNull();

    const ledger = await findKasLedgerEntries();
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ type: "in", source_type: "kas" });
    expect(Number(ledger[0].amount)).toBe(125000);

    const notifications = await findKasNotifications(contribution.id);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      account_id: fixture.account.id,
      title: "Iuran Kas Disetujui",
      reference_type: "kas_contribution",
    });
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        familyId: fixture.family.id,
        referenceId: contribution.id,
        emitRealtime: false,
      }),
      executor,
    );
    expect(emitSyncEventMock).not.toHaveBeenCalled();
    expectNoTransactionOwnership(executor);
    expectSavepointProtocol(executor, "sp_verify_kas_");
  });

  it("reject memperbarui status dan notification DB tanpa membuat ledger", async () => {
    const fixture = await seedKasFixture();
    const contribution = await seedKasContribution(globalThis.testDb, {
      familyId: fixture.family.id,
      amount: 60000,
      category: "sosial",
      status: "pending",
      recordedBy: fixture.account.id,
    });
    const executor = createExecutorProxy();

    const result = await verifyKasContributionService(
      {
        contributionId: contribution.id,
        decision: "rejected",
        actorId: fixture.actor.id,
        rejectReason: "  Bukti pembayaran tidak terbaca  ",
      },
      executor,
    );

    expect(result).toMatchObject({
      contribution_id: contribution.id,
      status: "rejected",
      reject_reason: "Bukti pembayaran tidak terbaca",
    });
    expect(await findContribution(contribution.id)).toMatchObject({
      status: "rejected",
      reject_reason: "Bukti pembayaran tidak terbaca",
      verified_by: fixture.actor.id,
    });
    expect(await findKasLedgerEntries()).toHaveLength(0);

    const notifications = await findKasNotifications(contribution.id);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      account_id: fixture.account.id,
      title: "Iuran Kas Ditolak",
      reference_type: "kas_contribution",
    });
    expect(notifications[0].message).toContain(
      "Alasan: Bukti pembayaran tidak terbaca",
    );
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ emitRealtime: false }),
      executor,
    );
    expect(emitSyncEventMock).not.toHaveBeenCalled();
    expectNoTransactionOwnership(executor);
    expectSavepointProtocol(executor, "sp_verify_kas_");
  });

  it("tetap menyelesaikan approve ketika insert notification gagal", async () => {
    const fixture = await seedKasFixture();
    const contribution = await seedKasContribution(globalThis.testDb, {
      familyId: fixture.family.id,
      status: "pending",
    });
    const executor = createExecutorProxy(({ normalizedSql }) => {
      if (normalizedSql.startsWith("INSERT INTO notifications")) {
        throw new Error("Simulasi kegagalan notification kas");
      }
      return undefined;
    });

    const result = await verifyKasContributionService(
      {
        contributionId: contribution.id,
        decision: "approved",
        actorId: fixture.actor.id,
      },
      executor,
    );

    expect(result).toMatchObject({ status: "approved" });
    expect((await findContribution(contribution.id)).status).toBe("approved");
    expect(await findKasLedgerEntries()).toHaveLength(1);
    expect(await findKasNotifications(contribution.id)).toHaveLength(0);
    expectNoTransactionOwnership(executor);
    expectSavepointProtocol(executor, "sp_verify_kas_");
  });

  it.each([
    ["approved", null],
    ["rejected", "Data transfer tidak sesuai"],
  ])(
    "rollback atomik status, ledger, dan notification ketika release savepoint gagal pada %s",
    async (decision, rejectReason) => {
      const fixture = await seedKasFixture();
      const contribution = await seedKasContribution(globalThis.testDb, {
        familyId: fixture.family.id,
        status: "pending",
      });
      let releaseFailed = false;
      const executor = createExecutorProxy(({ normalizedSql }) => {
        if (
          !releaseFailed &&
          normalizedSql.startsWith("RELEASE SAVEPOINT sp_verify_kas_")
        ) {
          releaseFailed = true;
          throw new Error("Simulasi kegagalan release savepoint kas");
        }
        return undefined;
      });

      const result = await verifyKasContributionService(
        {
          contributionId: contribution.id,
          decision,
          actorId: fixture.actor.id,
          rejectReason,
        },
        executor,
      );

      expect(result.error).toContain("Simulasi kegagalan release savepoint kas");
      expect(await findContribution(contribution.id)).toMatchObject({
        status: "pending",
        reject_reason: null,
        verified_by: null,
        verified_at: null,
      });
      expect(await findKasLedgerEntries()).toHaveLength(0);
      expect(await findKasNotifications(contribution.id)).toHaveLength(0);
      expect(emitSyncEventMock).not.toHaveBeenCalled();
      expectNoTransactionOwnership(executor);
      expectSavepointProtocol(executor, "sp_verify_kas_", {
        rolledBack: true,
      });
    },
  );
});

describe("read services meneruskan executor", () => {
  it("getPendingKasContributionsService memakai executor injected", async () => {
    const fixture = await seedKasFixture();
    const pending = await seedKasContribution(globalThis.testDb, {
      familyId: fixture.family.id,
      status: "pending",
    });
    await seedKasContribution(globalThis.testDb, {
      familyId: fixture.family.id,
      status: "approved",
    });
    const executor = createExecutorProxy();

    const result = await getPendingKasContributionsService(
      { limit: 10, offset: 0 },
      executor,
    );

    expect(result.map((row) => row.id)).toContain(pending.id);
    expect(
      executor.execute.mock.calls.some(([sql]) =>
        normalizeSql(sql).includes("FROM kas_contributions k"),
      ),
    ).toBe(true);
  });

  it("getMyKasHistoryService memakai executor yang sama untuk account dan family history", async () => {
    const fixture = await seedKasFixture();
    const otherFixture = await seedFamilyWithAccount(globalThis.testDb);
    const ownContribution = await seedKasContribution(globalThis.testDb, {
      familyId: fixture.family.id,
      status: "pending",
    });
    const otherContribution = await seedKasContribution(globalThis.testDb, {
      familyId: otherFixture.family.id,
      status: "pending",
    });
    const executor = createExecutorProxy();

    const result = await getMyKasHistoryService(fixture.account.id, executor);

    expect(result.map((row) => row.id)).toContain(ownContribution.id);
    expect(result.map((row) => row.id)).not.toContain(otherContribution.id);
    expect(
      executor.execute.mock.calls.some(([sql]) =>
        normalizeSql(sql).includes("FROM acount WHERE id = ?"),
      ),
    ).toBe(true);
    expect(
      executor.execute.mock.calls.some(([sql]) =>
        normalizeSql(sql).includes("WHERE k.family_id = ?"),
      ),
    ).toBe(true);
  });

  it("getKasAuditService meneruskan filter melalui executor injected", async () => {
    const fixture = await seedKasFixture();
    const matching = await seedKasContribution(globalThis.testDb, {
      familyId: fixture.family.id,
      category: "kegiatan",
      channel: "cash_to_rt",
      status: "rejected",
      rejectReason: "Ditolak untuk test audit",
    });
    await seedKasContribution(globalThis.testDb, {
      familyId: fixture.family.id,
      category: "sosial",
      channel: "transfer",
      status: "pending",
    });
    const executor = createExecutorProxy();

    const result = await getKasAuditService(
      {
        category: "kegiatan",
        status: "rejected",
        channel: "cash_to_rt",
        limit: 10,
        offset: 0,
      },
      executor,
    );

    expect(result.map((row) => row.id)).toEqual([matching.id]);
    const auditCall = executor.execute.mock.calls.find(([sql]) =>
      normalizeSql(sql).includes("WHERE 1=1"),
    );
    expect(auditCall).toBeDefined();
    expect(auditCall[1]).toEqual([
      "kegiatan",
      "rejected",
      "cash_to_rt",
      "10",
      "0",
    ]);
  });
});

describe("transaction ownership", () => {
  it("submit membuka, commit, dan release transaksi sendiri pada executor default", async () => {
    const fixture = await seedKasFixture();
    const ownedConnection = createOwnedConnectionFacade();
    const getConnectionSpy = jest
      .spyOn(pool, "getConnection")
      .mockResolvedValue(ownedConnection);

    const result = await submitKasContributionService({
      familyId: fixture.family.id,
      amount: 80000,
      category: "lainnya",
      description: "Kas ownership submit",
      channel: "cash_to_bendahara",
      recordedBy: fixture.actor.id,
    });

    expect(result).toMatchObject({ status: "approved" });
    expect(getConnectionSpy).toHaveBeenCalledTimes(1);
    expect(ownedConnection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(ownedConnection.commit).toHaveBeenCalledTimes(1);
    expect(ownedConnection.rollback).not.toHaveBeenCalled();
    expect(ownedConnection.release).toHaveBeenCalledTimes(1);
    expect(await findContribution(result.contribution_id)).not.toBeNull();
    expect(await findKasLedgerEntries()).toHaveLength(1);
  });

  it("verify membuka, commit, dan release transaksi sendiri lalu mengirim notification realtime", async () => {
    const fixture = await seedKasFixture();
    const contribution = await seedKasContribution(globalThis.testDb, {
      familyId: fixture.family.id,
      status: "pending",
    });
    const ownedConnection = createOwnedConnectionFacade();
    const getConnectionSpy = jest
      .spyOn(pool, "getConnection")
      .mockResolvedValue(ownedConnection);

    const result = await verifyKasContributionService({
      contributionId: contribution.id,
      decision: "approved",
      actorId: fixture.actor.id,
    });

    expect(result).toMatchObject({ status: "approved" });
    expect(getConnectionSpy).toHaveBeenCalledTimes(1);
    expect(ownedConnection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(ownedConnection.commit).toHaveBeenCalledTimes(1);
    expect(ownedConnection.rollback).not.toHaveBeenCalled();
    expect(ownedConnection.release).toHaveBeenCalledTimes(1);
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ emitRealtime: true }),
      undefined,
    );
    expect(emitSyncEventMock).toHaveBeenCalledWith("notification");
    expect((await findContribution(contribution.id)).status).toBe("approved");
    expect(await findKasLedgerEntries()).toHaveLength(1);
    expect(await findKasNotifications(contribution.id)).toHaveLength(1);
  });
});
