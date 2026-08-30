import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import db from "../../config/sqlconfig.js";
import { argonhash, argonverify } from "../../helpers/argon2.js";
import {
  computeBlindIndex,
  encryptEmail,
  normalizeEmail,
} from "../../lib/crypto/email.js";
import { seedAccount, seedOtpCode } from "../helpers/seed.js";

const sendOtpEmailMock = jest.fn();

jest.unstable_mockModule("../../utils/mailer.js", () => ({
  sendOtpEmail: sendOtpEmailMock,
}));

const { requestOtpService, verifyOtpService } = await import(
  "../../services/otpService.js"
);

const KNOWN_OTP = "654321";
let knownOtpHash;
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
  const savepointName = `sp_test_owned_otp_${++ownedFacadeCounter}`;

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

async function seedOtpAccount(overrides = {}) {
  const email = normalizeEmail(
    overrides.email ?? `otp-${Date.now()}-${Math.random()}@example.test`,
  );
  const account = await seedAccount(globalThis.testDb, {
    emailEncrypted: encryptEmail(email),
    emailBlindIdx: computeBlindIndex(email),
    isVerified: 0,
    ...overrides,
  });

  return { ...account, email };
}

async function findOtp(id) {
  const [rows] = await globalThis.testDb.execute(
    "SELECT * FROM otp_codes WHERE id = ?",
    [id],
  );
  return rows[0] ?? null;
}

async function findOtpsForUser(userId) {
  const [rows] = await globalThis.testDb.execute(
    "SELECT * FROM otp_codes WHERE user_id = ? ORDER BY id ASC",
    [userId],
  );
  return rows;
}

async function findAccount(id) {
  const [rows] = await globalThis.testDb.execute(
    "SELECT * FROM acount WHERE id = ?",
    [id],
  );
  return rows[0] ?? null;
}

function expectInjectedScope(executor, prefix) {
  expect(executor.beginTransaction).not.toHaveBeenCalled();
  expect(executor.commit).not.toHaveBeenCalled();
  expect(executor.rollback).not.toHaveBeenCalled();
  expect(executor.release).not.toHaveBeenCalled();
  expect(
    executor.query.mock.calls.some(([sql]) =>
      normalizeSql(sql).startsWith(`SAVEPOINT ${prefix}`),
    ),
  ).toBe(true);
  expect(
    executor.query.mock.calls.some(([sql]) =>
      normalizeSql(sql).startsWith(`RELEASE SAVEPOINT ${prefix}`),
    ),
  ).toBe(true);
}

beforeAll(async () => {
  knownOtpHash = await argonhash(KNOWN_OTP);
});

beforeEach(() => {
  sendOtpEmailMock.mockReset();
  sendOtpEmailMock.mockResolvedValue({ messageId: "mock-message" });
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("requestOtpService", () => {
  it("membuat OTP, memakai email akun, dan memakai savepoint pada executor injected", async () => {
    const account = await seedOtpAccount({ email: "owner@example.test" });
    const executor = createExecutorProxy();

    const result = await requestOtpService(
      account.id,
      "attacker@example.test",
      "VERIFICATION",
      executor,
    );

    expect(result).toMatchObject({ success: true, userId: account.id });
    expect(sendOtpEmailMock).toHaveBeenCalledTimes(1);
    const [destination, plaintextOtp] = sendOtpEmailMock.mock.calls[0];
    expect(destination).toBe(account.email);
    expect(destination).not.toBe("attacker@example.test");
    expect(plaintextOtp).toMatch(/^\d{6}$/);

    const otpRows = await findOtpsForUser(account.id);
    expect(otpRows).toHaveLength(1);
    expect(otpRows[0]).toMatchObject({
      purpose: "VERIFICATION",
      is_used: 0,
      attempts: 0,
    });
    expect(await argonverify(otpRows[0].otp_hash, plaintextOtp)).toBe(true);
    expectInjectedScope(executor, "sp_request_otp_");
  });

  it("menginvalidasi OTP lama hanya untuk purpose yang sama", async () => {
    const account = await seedOtpAccount();
    const oldVerificationOtp = await seedOtpCode(globalThis.testDb, {
      userId: account.id,
      otpHash: "unused-old-verification-hash",
    });
    const passwordResetOtp = await seedOtpCode(globalThis.testDb, {
      userId: account.id,
      otpHash: "unused-password-reset-hash",
      purpose: "PASSWORD_RESET",
    });

    await requestOtpService(
      account.id,
      null,
      "VERIFICATION",
      globalThis.testDb,
    );

    const otpRows = await findOtpsForUser(account.id);
    expect(otpRows).toHaveLength(3);
    expect((await findOtp(oldVerificationOtp.id)).is_used).toBe(1);
    expect((await findOtp(passwordResetOtp.id)).is_used).toBe(0);
    expect(
      otpRows.filter(
        (otp) => otp.purpose === "VERIFICATION" && otp.is_used === 0,
      ),
    ).toHaveLength(1);
  });

  it("rollback invalidasi OTP lama ketika insert OTP baru gagal", async () => {
    const account = await seedOtpAccount();
    const oldOtp = await seedOtpCode(globalThis.testDb, {
      userId: account.id,
      otpHash: "old-active-hash",
    });
    const executor = createExecutorProxy(({ normalizedSql }) => {
      if (normalizedSql.startsWith("INSERT INTO otp_codes")) {
        throw new Error("Simulasi kegagalan insert OTP");
      }
      return undefined;
    });

    await expect(
      requestOtpService(account.id, null, "VERIFICATION", executor),
    ).rejects.toThrow("Simulasi kegagalan insert OTP");

    expect((await findOtp(oldOtp.id)).is_used).toBe(0);
    expect(await findOtpsForUser(account.id)).toHaveLength(1);
    expect(sendOtpEmailMock).not.toHaveBeenCalled();
    expect(
      executor.query.mock.calls.some(([sql]) =>
        normalizeSql(sql).startsWith("ROLLBACK TO SAVEPOINT sp_request_otp_"),
      ),
    ).toBe(true);
  });

  it("memiliki ownership transaksi penuh pada executor default", async () => {
    const account = await seedOtpAccount();
    const ownedConnection = createOwnedConnectionFacade();
    const getConnectionSpy = jest
      .spyOn(db, "getConnection")
      .mockResolvedValue(ownedConnection);

    const result = await requestOtpService(
      account.id,
      null,
      "VERIFICATION",
    );

    expect(result.success).toBe(true);
    expect(getConnectionSpy).toHaveBeenCalledTimes(1);
    expect(ownedConnection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(ownedConnection.commit).toHaveBeenCalledTimes(1);
    expect(ownedConnection.rollback).not.toHaveBeenCalled();
    expect(ownedConnection.release).toHaveBeenCalledTimes(1);
    expect(ownedConnection.release.mock.invocationCallOrder[0]).toBeLessThan(
      sendOtpEmailMock.mock.invocationCallOrder[0],
    );
  });
});

describe("verifyOtpService", () => {
  it("memverifikasi OTP, menandainya used, dan mengaktifkan akun dalam savepoint injected", async () => {
    const account = await seedOtpAccount();
    const otp = await seedOtpCode(globalThis.testDb, {
      userId: account.id,
      otpHash: knownOtpHash,
    });
    const executor = createExecutorProxy();

    const result = await verifyOtpService(
      account.id,
      KNOWN_OTP,
      "VERIFICATION",
      executor,
    );

    expect(result).toMatchObject({
      success: true,
      userId: account.id,
      is_verified: 1,
    });
    expect((await findOtp(otp.id)).is_used).toBe(1);
    expect((await findAccount(account.id)).is_verified).toBe(1);
    expectInjectedScope(executor, "sp_verify_otp_");
  });

  it("menambah attempts dan menyisakan dua percobaan ketika OTP salah", async () => {
    const account = await seedOtpAccount();
    const otp = await seedOtpCode(globalThis.testDb, {
      userId: account.id,
      otpHash: knownOtpHash,
    });

    const result = await verifyOtpService(
      account.id,
      "000000",
      "VERIFICATION",
      globalThis.testDb,
    );

    expect(result).toEqual({
      success: false,
      message: "Kode OTP salah. Sisa percobaan: 2",
    });
    expect(await findOtp(otp.id)).toMatchObject({ attempts: 1, is_used: 0 });
    expect((await findAccount(account.id)).is_verified).toBe(0);
  });

  it("menandai OTP used ketika percobaan salah terakhir habis", async () => {
    const account = await seedOtpAccount();
    const otp = await seedOtpCode(globalThis.testDb, {
      userId: account.id,
      otpHash: knownOtpHash,
      attempts: 2,
    });

    const result = await verifyOtpService(
      account.id,
      "000000",
      "VERIFICATION",
      globalThis.testDb,
    );

    expect(result).toEqual({
      success: false,
      message: "Kode OTP salah. Batas percobaan habis, silakan minta OTP baru.",
    });
    expect(await findOtp(otp.id)).toMatchObject({ attempts: 3, is_used: 1 });
    expect((await findAccount(account.id)).is_verified).toBe(0);
  });

  it("rollback mark-as-used ketika update verifikasi akun gagal", async () => {
    const account = await seedOtpAccount();
    const otp = await seedOtpCode(globalThis.testDb, {
      userId: account.id,
      otpHash: knownOtpHash,
    });
    const executor = createExecutorProxy(({ normalizedSql }) => {
      if (
        normalizedSql.startsWith("UPDATE acount SET is_verified = 1")
      ) {
        throw new Error("Simulasi kegagalan update akun");
      }
      return undefined;
    });

    await expect(
      verifyOtpService(account.id, KNOWN_OTP, "VERIFICATION", executor),
    ).rejects.toThrow("Simulasi kegagalan update akun");

    expect((await findOtp(otp.id)).is_used).toBe(0);
    expect((await findAccount(account.id)).is_verified).toBe(0);
    expect(
      executor.query.mock.calls.some(([sql]) =>
        normalizeSql(sql).startsWith("ROLLBACK TO SAVEPOINT sp_verify_otp_"),
      ),
    ).toBe(true);
  });

  it("memiliki ownership transaksi penuh pada executor default", async () => {
    const account = await seedOtpAccount();
    const otp = await seedOtpCode(globalThis.testDb, {
      userId: account.id,
      otpHash: knownOtpHash,
    });
    const ownedConnection = createOwnedConnectionFacade();
    const getConnectionSpy = jest
      .spyOn(db, "getConnection")
      .mockResolvedValue(ownedConnection);

    const result = await verifyOtpService(
      account.id,
      KNOWN_OTP,
      "VERIFICATION",
    );

    expect(result.success).toBe(true);
    expect(getConnectionSpy).toHaveBeenCalledTimes(1);
    expect(ownedConnection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(ownedConnection.commit).toHaveBeenCalledTimes(1);
    expect(ownedConnection.rollback).not.toHaveBeenCalled();
    expect(ownedConnection.release).toHaveBeenCalledTimes(1);
    expect((await findOtp(otp.id)).is_used).toBe(1);
    expect((await findAccount(account.id)).is_verified).toBe(1);
  });
});
