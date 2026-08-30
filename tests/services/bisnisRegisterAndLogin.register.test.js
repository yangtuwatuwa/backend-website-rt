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
import { seedAccount, seedFamily } from "../helpers/seed.js";

const sendOtpEmailMock = jest.fn();
const argonhashMock = jest.fn();
const argonverifyMock = jest.fn();

jest.unstable_mockModule("../../utils/mailer.js", () => ({
  sendOtpEmail: sendOtpEmailMock,
}));
jest.unstable_mockModule("../../helpers/argon2.js", () => ({
  argonhash: argonhashMock,
  argonverify: argonverifyMock,
}));

const importLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
const { register } = await import("../../services/bisnisRegisterAndLogin.js");
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

function registrationInput(overrides = {}) {
  const suffix = uniqueData("register");
  return {
    username: `user_${suffix}`,
    password: "Password123!",
    email: `${suffix}@example.test`,
    role: "warga",
    familyId: null,
    ...overrides,
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
  const savepointName = `sp_test_owned_register_${++ownedFacadeCounter}`;

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

function expectErrorString(result, message) {
  expect(typeof result).toBe("string");
  expect(result).toContain(message);
}

function expectSavepointRollback(executor) {
  expect(
    executor.query.mock.calls.some(([sql]) =>
      normalizeSql(sql).startsWith("ROLLBACK TO SAVEPOINT sp_register_"),
    ),
  ).toBe(true);
}

beforeEach(() => {
  argonhashMock.mockReset();
  argonhashMock.mockImplementation(async (value) => `mock-hash:${value}`);
  argonverifyMock.mockReset();
  sendOtpEmailMock.mockReset();
  sendOtpEmailMock.mockResolvedValue({ messageId: "mock-message" });
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("register", () => {
  it("menolak email, username, dan password kosong sebelum membuka koneksi", async () => {
    const getConnectionSpy = jest.spyOn(pool, "getConnection");
    const cases = [
      ["username", "password", "", "email wajib"],
      ["", "password", "a@example.test", "username wajib"],
      ["username", "", "a@example.test", "password wajib"],
    ];

    for (const [username, password, email, expected] of cases) {
      const result = await register(username, password, email);
      expectErrorString(result, expected);
    }

    expect(getConnectionSpy).not.toHaveBeenCalled();
    expect(sendOtpEmailMock).not.toHaveBeenCalled();
  });

  it("membuat account+OTP dengan role/family dan mengirim email ter-normalisasi", async () => {
    const family = await seedFamily(globalThis.testDb);
    const input = registrationInput({ familyId: family.id });

    const result = await register(
      `  ${input.username}  `,
      input.password,
      `  ${input.email.toUpperCase()}  `,
      input.role,
      input.familyId,
      globalThis.testDb,
    );

    expect(result).toMatchObject({
      success: true,
      response: 201,
      user: {
        username: input.username,
        email: input.email,
        role: "warga",
        family_id: family.id,
      },
    });
    const account = await findAccount(result.userId);
    expect(account).toMatchObject({
      username: input.username,
      password: `mock-hash:${input.password}`,
      role: "warga",
      family_id: family.id,
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

  it("menolak username duplicate sebelum mutation", async () => {
    const existing = await seedAccount(globalThis.testDb);
    const input = registrationInput({ username: existing.username });
    const before = await accountAndOtpCounts();
    const executor = createExecutorProxy();

    const result = await register(
      input.username,
      input.password,
      input.email,
      input.role,
      input.familyId,
      executor,
    );

    expectErrorString(result, "username sudah digunakan");
    expect(await accountAndOtpCounts()).toEqual(before);
    expect(executor.query).not.toHaveBeenCalled();
    expect(sendOtpEmailMock).not.toHaveBeenCalled();
  });

  it("menolak email duplicate sebelum mutation", async () => {
    const duplicateEmail = `${uniqueData("duplicate-email")}@example.test`;
    await seedAccountWithEmail(duplicateEmail);
    const input = registrationInput({ email: duplicateEmail.toUpperCase() });
    const before = await accountAndOtpCounts();
    const executor = createExecutorProxy();

    const result = await register(
      input.username,
      input.password,
      input.email,
      input.role,
      input.familyId,
      executor,
    );

    expectErrorString(result, "email sudah terdaftar");
    expect(await accountAndOtpCounts()).toEqual(before);
    expect(executor.query).not.toHaveBeenCalled();
  });

  it("tidak meninggalkan mutation ketika hashing password gagal", async () => {
    const input = registrationInput();
    const before = await accountAndOtpCounts();
    const executor = createExecutorProxy();
    argonhashMock.mockResolvedValueOnce(undefined);

    const result = await register(
      input.username,
      input.password,
      input.email,
      input.role,
      input.familyId,
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
    const input = registrationInput({
      familyId: Number(rows[0].missing_id),
    });
    const before = await accountAndOtpCounts();
    const executor = createExecutorProxy();

    const result = await register(
      input.username,
      input.password,
      input.email,
      input.role,
      input.familyId,
      executor,
    );

    expectErrorString(result, "error karena:");
    expect(await accountAndOtpCounts()).toEqual(before);
    expectSavepointRollback(executor);
  });

  it("rollback ketika insert account gagal", async () => {
    const input = registrationInput();
    const before = await accountAndOtpCounts();
    const executor = createExecutorProxy(({ normalizedSql }) => {
      if (normalizedSql.startsWith("INSERT INTO acount")) {
        throw new Error("Simulasi kegagalan insert register account");
      }
      return undefined;
    });

    const result = await register(
      input.username,
      input.password,
      input.email,
      input.role,
      input.familyId,
      executor,
    );

    expectErrorString(result, "Simulasi kegagalan insert register account");
    expect(await accountAndOtpCounts()).toEqual(before);
    expectSavepointRollback(executor);
  });

  it("rollback account ketika hashing OTP gagal", async () => {
    const input = registrationInput();
    const before = await accountAndOtpCounts();
    const executor = createExecutorProxy();
    argonhashMock
      .mockResolvedValueOnce(`mock-hash:${input.password}`)
      .mockResolvedValueOnce(undefined);

    const result = await register(
      input.username,
      input.password,
      input.email,
      input.role,
      input.familyId,
      executor,
    );

    expectErrorString(result, "error karena:");
    expect(await accountAndOtpCounts()).toEqual(before);
    expectSavepointRollback(executor);
    expect(sendOtpEmailMock).not.toHaveBeenCalled();
  });

  it("rollback account ketika insert OTP gagal", async () => {
    const input = registrationInput();
    const before = await accountAndOtpCounts();
    const executor = createExecutorProxy(({ normalizedSql }) => {
      if (normalizedSql.startsWith("INSERT INTO otp_codes")) {
        throw new Error("Simulasi kegagalan insert register OTP");
      }
      return undefined;
    });

    const result = await register(
      input.username,
      input.password,
      input.email,
      input.role,
      input.familyId,
      executor,
    );

    expectErrorString(result, "Simulasi kegagalan insert register OTP");
    expect(await accountAndOtpCounts()).toEqual(before);
    expectSavepointRollback(executor);
    expect(sendOtpEmailMock).not.toHaveBeenCalled();
  });

  it("tetap sukses dan menyimpan account+OTP ketika mailer gagal", async () => {
    const input = registrationInput();
    sendOtpEmailMock.mockRejectedValueOnce(new Error("SMTP register gagal"));

    const result = await register(
      input.username,
      input.password,
      input.email,
      input.role,
      input.familyId,
      globalThis.testDb,
    );

    expect(result.success).toBe(true);
    expect(await findAccount(result.userId)).not.toBeNull();
    expect(await findOtps(result.userId)).toHaveLength(1);
    expect(sendOtpEmailMock).toHaveBeenCalledTimes(1);
  });

  it("memiliki ownership transaksi penuh pada executor default", async () => {
    const input = registrationInput();
    const ownedConnection = createOwnedConnectionFacade();
    const getConnectionSpy = jest
      .spyOn(pool, "getConnection")
      .mockResolvedValue(ownedConnection);

    const result = await register(
      input.username,
      input.password,
      input.email,
      input.role,
      input.familyId,
    );

    expect(result.success).toBe(true);
    expect(getConnectionSpy).toHaveBeenCalledTimes(1);
    expect(ownedConnection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(ownedConnection.commit).toHaveBeenCalledTimes(1);
    expect(ownedConnection.rollback).not.toHaveBeenCalled();
    expect(ownedConnection.release).toHaveBeenCalledTimes(1);
  });

  it("hanya memakai savepoint tanpa mengontrol outer transaction pada executor injected", async () => {
    const input = registrationInput();
    const executor = createExecutorProxy();

    const result = await register(
      input.username,
      input.password,
      input.email,
      input.role,
      input.familyId,
      executor,
    );

    expect(result.success).toBe(true);
    expect(executor.beginTransaction).not.toHaveBeenCalled();
    expect(executor.commit).not.toHaveBeenCalled();
    expect(executor.rollback).not.toHaveBeenCalled();
    expect(executor.release).not.toHaveBeenCalled();
    expect(
      executor.query.mock.calls.some(([sql]) =>
        normalizeSql(sql).startsWith("SAVEPOINT sp_register_"),
      ),
    ).toBe(true);
    expect(
      executor.query.mock.calls.some(([sql]) =>
        normalizeSql(sql).startsWith("RELEASE SAVEPOINT sp_register_"),
      ),
    ).toBe(true);
  });
});
