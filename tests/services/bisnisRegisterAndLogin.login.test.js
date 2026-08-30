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
  encryptEmail,
  normalizeEmail,
} from "../../lib/crypto/email.js";
import { seedAccount } from "../helpers/seed.js";

const argonhashMock = jest.fn();
const argonverifyMock = jest.fn();
const generateJwtMock = jest.fn();
const sendOtpEmailMock = jest.fn();

jest.unstable_mockModule("../../helpers/argon2.js", () => ({
  argonhash: argonhashMock,
  argonverify: argonverifyMock,
}));
jest.unstable_mockModule("../../helpers/jwttoken.js", () => ({
  generateJwt: generateJwtMock,
}));
jest.unstable_mockModule("../../utils/mailer.js", () => ({
  sendOtpEmail: sendOtpEmailMock,
}));

const importLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
const { loginUser } = await import(
  "../../services/bisnisRegisterAndLogin.js"
);
importLogSpy.mockRestore();

let sequence = 0;

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
  };
}

async function seedLoginAccount(overrides = {}) {
  const email = normalizeEmail(
    overrides.email ?? `${uniqueData("login")}@example.test`,
  );
  const account = await seedAccount(globalThis.testDb, {
    emailEncrypted: encryptEmail(email),
    emailBlindIdx: computeBlindIndex(email),
    isVerified: 1,
    mustChangePassword: 0,
    ...overrides,
  });
  return { ...account, email };
}

async function findAccessLogs(username) {
  const [rows] = await globalThis.testDb.execute(
    "SELECT * FROM access_logs WHERE username = ? ORDER BY id ASC",
    [username],
  );
  return rows;
}

function expectSafeUser(user) {
  expect(user).toBeDefined();
  expect(user).not.toHaveProperty("password");
  expect(user).not.toHaveProperty("email");
  expect(user).not.toHaveProperty("email_encrypted");
  expect(user).not.toHaveProperty("email_blind_idx");
}

beforeEach(() => {
  argonhashMock.mockReset();
  argonverifyMock.mockReset();
  argonverifyMock.mockResolvedValue(true);
  generateJwtMock.mockReset();
  generateJwtMock.mockImplementation(
    ({ id, role }) => `mock-jwt:${id}:${role}`,
  );
  sendOtpEmailMock.mockReset();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("loginUser", () => {
  it("login sukses melalui username dan menulis LOGIN_SUCCESS", async () => {
    const account = await seedLoginAccount();

    const result = await loginUser(
      account.username,
      "correct-password",
      "10.0.0.1",
      "jest-username",
      globalThis.testDb,
    );

    expect(result).toMatchObject({
      status: "login berhasil",
      token: `mock-jwt:${account.id}:${account.role}`,
      user: {
        id: account.id,
        username: account.username,
        role: account.role,
        must_change_password: 0,
        is_verified: 1,
      },
    });
    expectSafeUser(result.user);
    const logs = await findAccessLogs(account.username);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      event_type: "LOGIN_SUCCESS",
      status: "success",
      details: `Role: ${account.role}`,
    });
  });

  it("login sukses melalui email case-insensitive memakai blind index", async () => {
    const account = await seedLoginAccount({ email: "blind@example.test" });

    const result = await loginUser(
      "  BLIND@EXAMPLE.TEST  ",
      "correct-password",
      "10.0.0.2",
      "jest-email",
      globalThis.testDb,
    );

    expect(result.status).toBe("login berhasil");
    expect(result.user.id).toBe(account.id);
    expect(argonverifyMock).toHaveBeenCalledWith(
      account.password,
      "correct-password",
    );
    expect((await findAccessLogs(account.username))[0].event_type).toBe(
      "LOGIN_SUCCESS",
    );
  });

  it("menolak password salah dan menulis LOGIN_FAILED", async () => {
    const account = await seedLoginAccount();
    argonverifyMock.mockResolvedValueOnce(false);

    const result = await loginUser(
      account.username,
      "wrong-password",
      "10.0.0.3",
      "jest-wrong-password",
      globalThis.testDb,
    );

    expect(result).toBe("password salah");
    expect(generateJwtMock).not.toHaveBeenCalled();
    const logs = await findAccessLogs(account.username);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      event_type: "LOGIN_FAILED",
      status: "failed",
      details: "Password salah",
    });
  });

  it("menolak account yang tidak ditemukan dan menulis LOGIN_ATTEMPT", async () => {
    const identifier = uniqueData("missing-user");

    const result = await loginUser(
      identifier,
      "password",
      "10.0.0.4",
      "jest-missing",
      globalThis.testDb,
    );

    expect(result).toBe("username atau email tidak ditemukan");
    expect(argonverifyMock).not.toHaveBeenCalled();
    expect(generateJwtMock).not.toHaveBeenCalled();
    const logs = await findAccessLogs(identifier);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      event_type: "LOGIN_ATTEMPT",
      status: "failed",
      details: "Akun tidak ditemukan",
    });
  });

  it("mengembalikan error dan mengaudit DB lookup failure", async () => {
    const identifier = uniqueData("db-error-user");
    const executor = createExecutorProxy(({ normalizedSql }) => {
      if (
        normalizedSql.startsWith("SELECT") &&
        normalizedSql.includes("FROM acount WHERE username = ?")
      ) {
        throw new Error("Simulasi DB lookup login gagal");
      }
      return undefined;
    });

    const result = await loginUser(
      identifier,
      "password",
      "10.0.0.5",
      "jest-db-error",
      executor,
    );

    expect(result).toBe("error");
    expect(argonverifyMock).not.toHaveBeenCalled();
    const logs = await findAccessLogs(identifier);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      event_type: "LOGIN_ATTEMPT",
      status: "failed",
      details: "DB error",
    });
  });

  it("memblokir account belum verified dan menulis LOGIN_BLOCKED_UNVERIFIED", async () => {
    const account = await seedLoginAccount({ isVerified: 0 });

    const result = await loginUser(
      account.username,
      "correct-password",
      "10.0.0.6",
      "jest-unverified",
      globalThis.testDb,
    );

    expect(result).toEqual({
      success: false,
      status: "unverified",
      userId: account.id,
      message: "Akun belum diverifikasi. Silakan masukkan kode OTP.",
    });
    expect(generateJwtMock).not.toHaveBeenCalled();
    const logs = await findAccessLogs(account.username);
    expect(logs[0]).toMatchObject({
      event_type: "LOGIN_BLOCKED_UNVERIFIED",
      status: "failed",
      details: "Akun belum diverifikasi OTP",
    });
  });

  it("mengembalikan must_change_password beserta token untuk account terkait", async () => {
    const account = await seedLoginAccount({ mustChangePassword: 1 });

    const result = await loginUser(
      account.username,
      "correct-password",
      "10.0.0.7",
      "jest-change-password",
      globalThis.testDb,
    );

    expect(result).toMatchObject({
      status: "must_change_password",
      token: `mock-jwt:${account.id}:${account.role}`,
      user: {
        id: account.id,
        must_change_password: 1,
      },
    });
    expectSafeUser(result.user);
    expect((await findAccessLogs(account.username))[0].event_type).toBe(
      "LOGIN_SUCCESS",
    );
  });

  it("membangun JWT hanya dari id dan role account", async () => {
    const account = await seedLoginAccount({ role: "bendahara" });

    const result = await loginUser(
      account.username,
      "correct-password",
      "10.0.0.8",
      "jest-jwt",
      globalThis.testDb,
    );

    expect(generateJwtMock).toHaveBeenCalledTimes(1);
    expect(generateJwtMock).toHaveBeenCalledWith({
      id: account.id,
      role: "bendahara",
    });
    expect(result.token).toBe(`mock-jwt:${account.id}:bendahara`);
  });

  it("menyaring seluruh field sensitif dari response user", async () => {
    const account = await seedLoginAccount();

    const result = await loginUser(
      account.username,
      "correct-password",
      "10.0.0.9",
      "jest-sanitize",
      globalThis.testDb,
    );

    expectSafeUser(result.user);
    expect(Object.keys(result.user).sort()).toEqual(
      [
        "family_id",
        "id",
        "is_verified",
        "must_change_password",
        "role",
        "username",
      ].sort(),
    );
  });

  it("menulis metadata IP dan user-agent pada audit login", async () => {
    const account = await seedLoginAccount();
    const ipAddress = "192.0.2.25";
    const userAgent = "integration-test-agent";

    await loginUser(
      account.username,
      "correct-password",
      ipAddress,
      userAgent,
      globalThis.testDb,
    );

    const logs = await findAccessLogs(account.username);
    expect(logs[0]).toMatchObject({
      ip_address: ipAddress,
      user_agent: userAgent,
      event_type: "LOGIN_SUCCESS",
    });
  });

  it("meneruskan executor yang sama ke lookup account dan audit log", async () => {
    const account = await seedLoginAccount();
    const executor = createExecutorProxy();
    const globalExecuteSpy = jest.spyOn(pool, "execute");

    const result = await loginUser(
      account.username,
      "correct-password",
      "10.0.0.11",
      "jest-propagation",
      executor,
    );

    expect(result.status).toBe("login berhasil");
    expect(globalExecuteSpy).not.toHaveBeenCalled();
    const sqlCalls = executor.execute.mock.calls.map(([sql]) =>
      normalizeSql(sql),
    );
    expect(
      sqlCalls.some(
        (sql) =>
          sql.startsWith("SELECT") &&
          sql.includes("FROM acount WHERE username = ?"),
      ),
    ).toBe(true);
    expect(
      sqlCalls.some((sql) => sql.startsWith("INSERT INTO access_logs")),
    ).toBe(true);
  });

  it("tetap mengembalikan login sukses ketika audit log injected gagal", async () => {
    const account = await seedLoginAccount();
    const executor = createExecutorProxy(({ normalizedSql }) => {
      if (normalizedSql.startsWith("INSERT INTO access_logs")) {
        throw new Error("Simulasi audit login gagal");
      }
      return undefined;
    });

    const result = await loginUser(
      account.username,
      "correct-password",
      "10.0.0.12",
      "jest-audit-failure",
      executor,
    );

    expect(result).toMatchObject({
      status: "login berhasil",
      user: { id: account.id },
    });
    expect(await findAccessLogs(account.username)).toHaveLength(0);
  });
});
