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
  seedFamilyWithAccount,
} from "../helpers/seed.js";

const sendOtpEmailMock = jest.fn();
const argonhashMock = jest.fn();

jest.unstable_mockModule("../../utils/mailer.js", () => ({
  sendOtpEmail: sendOtpEmailMock,
}));
jest.unstable_mockModule("../../helpers/argon2.js", () => ({
  argonhash: argonhashMock,
}));

const importLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
const {
  bindAccountToFamilyService,
  checkAccountStatusService,
  generateStaffAccount,
  generateWargaAccount,
} = await import("../../services/createAccount.js");
importLogSpy.mockRestore();

let sequence = 0;
let ownedFacadeCounter = 0;

function uniqueData(prefix) {
  sequence += 1;
  return `${prefix}-${Date.now()}-${process.pid}-${sequence}`;
}

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
  const savepointName = `sp_test_owned_create_account_${++ownedFacadeCounter}`;

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

async function accountAndOtpCounts() {
  const [rows] = await globalThis.testDb.execute(
    `SELECT
      (SELECT COUNT(*) FROM acount) AS account_total,
      (SELECT COUNT(*) FROM otp_codes) AS otp_total`,
  );
  return {
    account: Number(rows[0].account_total),
    otp: Number(rows[0].otp_total),
  };
}

async function findAccount(id) {
  const [rows] = await globalThis.testDb.execute(
    "SELECT * FROM acount WHERE id = ?",
    [id],
  );
  return rows[0] ?? null;
}

async function findAccountsByFamily(familyId) {
  const [rows] = await globalThis.testDb.execute(
    "SELECT * FROM acount WHERE family_id = ? ORDER BY id ASC",
    [familyId],
  );
  return rows;
}

async function findOtps(userId) {
  const [rows] = await globalThis.testDb.execute(
    "SELECT * FROM otp_codes WHERE user_id = ? ORDER BY id ASC",
    [userId],
  );
  return rows;
}

async function seedAccountWithEmail(email, overrides = {}) {
  const normalized = normalizeEmail(email);
  return seedAccount(globalThis.testDb, {
    emailEncrypted: encryptEmail(normalized),
    emailBlindIdx: computeBlindIndex(normalized),
    ...overrides,
  });
}

function wargaAccountInput() {
  const suffix = uniqueData("warga-account");
  return {
    username: `user_${suffix}`,
    password: "Password123!",
    email: `${suffix}@example.test`,
  };
}

function expectErrorString(result, message) {
  expect(typeof result).toBe("string");
  expect(result).toContain(message);
}

function expectSavepointRollback(executor) {
  expect(
    executor.query.mock.calls.some(([sql]) =>
      normalizeSql(sql).startsWith(
        "ROLLBACK TO SAVEPOINT sp_generate_warga_account_",
      ),
    ),
  ).toBe(true);
}

beforeEach(() => {
  argonhashMock.mockReset();
  argonhashMock.mockImplementation(async (value) => `mock-hash:${value}`);
  sendOtpEmailMock.mockReset();
  sendOtpEmailMock.mockResolvedValue({ messageId: "mock-message" });
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("generateWargaAccount", () => {
  it("menolak seluruh field wajib yang kosong sebelum membuka koneksi", async () => {
    const getConnectionSpy = jest.spyOn(pool, "getConnection");
    const cases = [
      [null, "username", "password", "a@example.test", "familyId wajib"],
      [1, "", "password", "a@example.test", "username wajib"],
      [1, "username", "", "a@example.test", "password wajib"],
      [1, "username", "password", "", "email wajib"],
    ];

    for (const [familyId, username, password, email, expected] of cases) {
      const result = await generateWargaAccount(
        familyId,
        username,
        password,
        email,
      );
      expectErrorString(result, expected);
    }

    expect(getConnectionSpy).not.toHaveBeenCalled();
    expect(sendOtpEmailMock).not.toHaveBeenCalled();
  });

  it("membuat akun warga dan OTP serta mengirim email ter-normalisasi", async () => {
    const family = await seedFamily(globalThis.testDb);
    const input = wargaAccountInput();
    const executor = createExecutorProxy();

    const result = await generateWargaAccount(
      family.id,
      `  ${input.username}  `,
      input.password,
      `  ${input.email.toUpperCase()}  `,
      executor,
    );

    expect(result).toMatchObject({
      success: true,
      username: input.username,
      temporaryPassword: input.password,
    });
    const account = await findAccount(result.userId);
    expect(account).toMatchObject({
      username: input.username,
      password: `mock-hash:${input.password}`,
      role: "warga",
      family_id: family.id,
      must_change_password: 1,
      is_verified: 0,
    });
    expect(decryptEmail(account.email_encrypted)).toBe(input.email);
    expect(account.email_blind_idx).toBe(computeBlindIndex(input.email));

    const otpRows = await findOtps(account.id);
    expect(otpRows).toHaveLength(1);
    const [mailDestination, plaintextOtp] = sendOtpEmailMock.mock.calls[0];
    expect(mailDestination).toBe(input.email);
    expect(plaintextOtp).toMatch(/^\d{6}$/);
    expect(otpRows[0]).toMatchObject({
      otp_hash: `mock-hash:${plaintextOtp}`,
      purpose: "VERIFICATION",
      is_used: 0,
    });
  });

  it("menolak family yang sudah mempunyai akun sebelum mutation", async () => {
    const fixture = await seedFamilyWithAccount(globalThis.testDb);
    const input = wargaAccountInput();
    const before = await accountAndOtpCounts();
    const executor = createExecutorProxy();

    const result = await generateWargaAccount(
      fixture.family.id,
      input.username,
      input.password,
      input.email,
      executor,
    );

    expectErrorString(result, "keluarga ini sudah punya akun");
    expect(await accountAndOtpCounts()).toEqual(before);
    expect(executor.query).not.toHaveBeenCalled();
    expect(sendOtpEmailMock).not.toHaveBeenCalled();
  });

  it("menolak username duplicate sebelum mutation", async () => {
    const family = await seedFamily(globalThis.testDb);
    const existing = await seedAccount(globalThis.testDb);
    const input = wargaAccountInput();
    const before = await accountAndOtpCounts();
    const executor = createExecutorProxy();

    const result = await generateWargaAccount(
      family.id,
      existing.username,
      input.password,
      input.email,
      executor,
    );

    expectErrorString(result, "username ini sudah digunakan");
    expect(await accountAndOtpCounts()).toEqual(before);
    expect(executor.query).not.toHaveBeenCalled();
  });

  it("menolak email duplicate sebelum mutation", async () => {
    const family = await seedFamily(globalThis.testDb);
    const duplicateEmail = `${uniqueData("duplicate-email")}@example.test`;
    await seedAccountWithEmail(duplicateEmail);
    const input = wargaAccountInput();
    const before = await accountAndOtpCounts();
    const executor = createExecutorProxy();

    const result = await generateWargaAccount(
      family.id,
      input.username,
      input.password,
      duplicateEmail.toUpperCase(),
      executor,
    );

    expectErrorString(result, "email sudah terdaftar");
    expect(await accountAndOtpCounts()).toEqual(before);
    expect(executor.query).not.toHaveBeenCalled();
  });

  it("tidak meninggalkan mutation ketika hashing password gagal", async () => {
    const family = await seedFamily(globalThis.testDb);
    const input = wargaAccountInput();
    const before = await accountAndOtpCounts();
    const executor = createExecutorProxy();
    argonhashMock.mockResolvedValueOnce(undefined);

    const result = await generateWargaAccount(
      family.id,
      input.username,
      input.password,
      input.email,
      executor,
    );

    expectErrorString(result, "error karena:");
    expect(await accountAndOtpCounts()).toEqual(before);
    expectSavepointRollback(executor);
    expect(sendOtpEmailMock).not.toHaveBeenCalled();
  });

  it("rollback ketika familyId tidak memenuhi foreign key", async () => {
    const [rows] = await globalThis.testDb.execute(
      "SELECT COALESCE(MAX(id), 0) + 100000 AS missing_id FROM family",
    );
    const input = wargaAccountInput();
    const before = await accountAndOtpCounts();
    const executor = createExecutorProxy();

    const result = await generateWargaAccount(
      Number(rows[0].missing_id),
      input.username,
      input.password,
      input.email,
      executor,
    );

    expectErrorString(result, "error karena:");
    expect(await accountAndOtpCounts()).toEqual(before);
    expectSavepointRollback(executor);
  });

  it("rollback ketika insert account gagal", async () => {
    const family = await seedFamily(globalThis.testDb);
    const input = wargaAccountInput();
    const before = await accountAndOtpCounts();
    const executor = createExecutorProxy(({ normalizedSql }) => {
      if (normalizedSql.startsWith("INSERT INTO acount")) {
        throw new Error("Simulasi kegagalan insert account warga");
      }
      return undefined;
    });

    const result = await generateWargaAccount(
      family.id,
      input.username,
      input.password,
      input.email,
      executor,
    );

    expectErrorString(result, "Simulasi kegagalan insert account warga");
    expect(await accountAndOtpCounts()).toEqual(before);
    expectSavepointRollback(executor);
  });

  it("rollback account ketika hashing OTP gagal", async () => {
    const family = await seedFamily(globalThis.testDb);
    const input = wargaAccountInput();
    const before = await accountAndOtpCounts();
    const executor = createExecutorProxy();
    argonhashMock
      .mockResolvedValueOnce(`mock-hash:${input.password}`)
      .mockResolvedValueOnce(undefined);

    const result = await generateWargaAccount(
      family.id,
      input.username,
      input.password,
      input.email,
      executor,
    );

    expectErrorString(result, "error karena:");
    expect(await accountAndOtpCounts()).toEqual(before);
    expectSavepointRollback(executor);
    expect(sendOtpEmailMock).not.toHaveBeenCalled();
  });

  it("rollback account ketika insert OTP gagal", async () => {
    const family = await seedFamily(globalThis.testDb);
    const input = wargaAccountInput();
    const before = await accountAndOtpCounts();
    const executor = createExecutorProxy(({ normalizedSql }) => {
      if (normalizedSql.startsWith("INSERT INTO otp_codes")) {
        throw new Error("Simulasi kegagalan insert OTP akun warga");
      }
      return undefined;
    });

    const result = await generateWargaAccount(
      family.id,
      input.username,
      input.password,
      input.email,
      executor,
    );

    expectErrorString(result, "Simulasi kegagalan insert OTP akun warga");
    expect(await accountAndOtpCounts()).toEqual(before);
    expectSavepointRollback(executor);
    expect(sendOtpEmailMock).not.toHaveBeenCalled();
  });

  it("tetap sukses dan menyimpan account+OTP ketika mailer gagal", async () => {
    const family = await seedFamily(globalThis.testDb);
    const input = wargaAccountInput();
    sendOtpEmailMock.mockRejectedValueOnce(new Error("SMTP test gagal"));

    const result = await generateWargaAccount(
      family.id,
      input.username,
      input.password,
      input.email,
      globalThis.testDb,
    );

    expect(result.success).toBe(true);
    expect(await findAccount(result.userId)).not.toBeNull();
    expect(await findOtps(result.userId)).toHaveLength(1);
    expect(sendOtpEmailMock).toHaveBeenCalledTimes(1);
  });

  it("memiliki ownership transaksi penuh pada executor default", async () => {
    const family = await seedFamily(globalThis.testDb);
    const input = wargaAccountInput();
    const ownedConnection = createOwnedConnectionFacade();
    const getConnectionSpy = jest
      .spyOn(pool, "getConnection")
      .mockResolvedValue(ownedConnection);

    const result = await generateWargaAccount(
      family.id,
      input.username,
      input.password,
      input.email,
    );

    expect(result.success).toBe(true);
    expect(getConnectionSpy).toHaveBeenCalledTimes(1);
    expect(ownedConnection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(ownedConnection.commit).toHaveBeenCalledTimes(1);
    expect(ownedConnection.rollback).not.toHaveBeenCalled();
    expect(ownedConnection.release).toHaveBeenCalledTimes(1);
  });

  it("hanya memakai savepoint tanpa mengontrol outer transaction pada executor injected", async () => {
    const family = await seedFamily(globalThis.testDb);
    const input = wargaAccountInput();
    const executor = createExecutorProxy();

    const result = await generateWargaAccount(
      family.id,
      input.username,
      input.password,
      input.email,
      executor,
    );

    expect(result.success).toBe(true);
    expect(executor.beginTransaction).not.toHaveBeenCalled();
    expect(executor.commit).not.toHaveBeenCalled();
    expect(executor.rollback).not.toHaveBeenCalled();
    expect(executor.release).not.toHaveBeenCalled();
    expect(
      executor.query.mock.calls.some(([sql]) =>
        normalizeSql(sql).startsWith(
          "SAVEPOINT sp_generate_warga_account_",
        ),
      ),
    ).toBe(true);
    expect(
      executor.query.mock.calls.some(([sql]) =>
        normalizeSql(sql).startsWith(
          "RELEASE SAVEPOINT sp_generate_warga_account_",
        ),
      ),
    ).toBe(true);
  });
});

describe("generateStaffAccount", () => {
  it("membuat akun staff verified tanpa family", async () => {
    const username = uniqueData("staff");
    const email = `${uniqueData("staff-email")}@example.test`;

    const result = await generateStaffAccount(
      username,
      "StaffPass123!",
      email,
      "bendahara",
      globalThis.testDb,
    );

    const account = await findAccount(result.userId);
    expect(account).toMatchObject({
      username,
      password: "mock-hash:StaffPass123!",
      role: "bendahara",
      family_id: null,
      must_change_password: 1,
      is_verified: 1,
    });
    expect(decryptEmail(account.email_encrypted)).toBe(email);
    expect(sendOtpEmailMock).not.toHaveBeenCalled();
  });

  it("menolak username staff duplicate", async () => {
    const existing = await seedAccount(globalThis.testDb);

    const result = await generateStaffAccount(
      existing.username,
      "StaffPass123!",
      `${uniqueData("staff")}@example.test`,
      "sekertaris",
      globalThis.testDb,
    );

    expectErrorString(result, "username ini sudah digunakan");
  });

  it("menolak email staff duplicate", async () => {
    const email = `${uniqueData("staff-duplicate")}@example.test`;
    await seedAccountWithEmail(email);

    const result = await generateStaffAccount(
      uniqueData("staff"),
      "StaffPass123!",
      email.toUpperCase(),
      "sekertaris",
      globalThis.testDb,
    );

    expectErrorString(result, "email sudah terdaftar");
  });

  it("mengembalikan error ketika insert staff gagal", async () => {
    const executor = createExecutorProxy(({ normalizedSql }) => {
      if (normalizedSql.startsWith("INSERT INTO acount")) {
        throw new Error("Simulasi kegagalan insert staff");
      }
      return undefined;
    });

    const result = await generateStaffAccount(
      uniqueData("staff"),
      "StaffPass123!",
      `${uniqueData("staff-email")}@example.test`,
      "bendahara",
      executor,
    );

    expectErrorString(result, "Simulasi kegagalan insert staff");
  });
});

describe("bindAccountToFamilyService", () => {
  it("menghubungkan akun ke family", async () => {
    const family = await seedFamily(globalThis.testDb);
    const account = await seedAccount(globalThis.testDb);

    const result = await bindAccountToFamilyService(
      account.id,
      family.id,
      globalThis.testDb,
    );

    expect(result.affectedRows).toBe(1);
    expect((await findAccount(account.id)).family_id).toBe(family.id);
  });

  it("membedakan account tidak ditemukan dan FK family invalid", async () => {
    const [idRows] = await globalThis.testDb.execute(
      `SELECT
        (SELECT COALESCE(MAX(id), 0) + 100000 FROM acount) AS missing_account,
        (SELECT COALESCE(MAX(id), 0) + 100000 FROM family) AS missing_family`,
    );

    const noAccountResult = await bindAccountToFamilyService(
      Number(idRows[0].missing_account),
      Number(idRows[0].missing_family),
      globalThis.testDb,
    );
    expect(noAccountResult.affectedRows).toBe(0);

    const account = await seedAccount(globalThis.testDb);
    const invalidFamilyResult = await bindAccountToFamilyService(
      account.id,
      Number(idRows[0].missing_family),
      globalThis.testDb,
    );
    expectErrorString(invalidFamilyResult, "error karena:");
    expect((await findAccount(account.id)).family_id).toBeNull();
  });
});

describe("checkAccountStatusService", () => {
  it("mengembalikan status registered dan unregistered dengan alias kompatibel", async () => {
    const registered = await seedFamilyWithAccount(globalThis.testDb);
    const unregistered = await seedFamily(globalThis.testDb);

    const registeredStatus = await checkAccountStatusService(
      registered.family.id,
      globalThis.testDb,
    );
    expect(registeredStatus).toMatchObject({
      familyId: registered.family.id,
      family_id: registered.family.id,
      exists: true,
      hasAccount: true,
      has_account: true,
      status: "registered",
      accountId: registered.account.id,
      account_id: registered.account.id,
    });

    const unregisteredStatus = await checkAccountStatusService(
      unregistered.id,
      globalThis.testDb,
    );
    expect(unregisteredStatus).toMatchObject({
      familyId: unregistered.id,
      family_id: unregistered.id,
      exists: false,
      hasAccount: false,
      has_account: false,
      status: "unregistered",
      accountId: null,
      account_id: null,
    });
  });
});
