import { expect, jest } from "@jest/globals";

let ownedFacadeCounter = 0;

export function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

export function createExecutorProxy(intercept) {
  const runQuery = async (method, sql, params = []) => {
    const intercepted = await intercept?.({
      method,
      sql,
      normalizedSql: normalizeSql(sql),
      params,
    });
    if (intercepted?.handled) return intercepted.value;
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

export function createOwnedConnectionFacade(label, intercept) {
  const savepointName = `sp_test_owned_${label}_${++ownedFacadeCounter}`;
  const runQuery = async (method, sql, params = []) => {
    const intercepted = await intercept?.({
      method,
      sql,
      normalizedSql: normalizeSql(sql),
      params,
    });
    if (intercepted?.handled) return intercepted.value;
    return globalThis.testDb[method](sql, params);
  };

  return {
    execute: jest.fn((sql, params = []) => runQuery("execute", sql, params)),
    query: jest.fn((sql, params = []) => runQuery("query", sql, params)),
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

export function expectNoTransactionOwnership(executor) {
  expect(executor.beginTransaction).not.toHaveBeenCalled();
  expect(executor.commit).not.toHaveBeenCalled();
  expect(executor.rollback).not.toHaveBeenCalled();
  expect(executor.release).not.toHaveBeenCalled();
}

export function expectSavepointProtocol(
  executor,
  prefix,
  { rolledBack = false } = {},
) {
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

export async function findFamily(id) {
  const [rows] = await globalThis.testDb.execute(
    "SELECT * FROM family WHERE id = ?",
    [id],
  );
  return rows[0] ?? null;
}

export async function findWarga(id) {
  const [rows] = await globalThis.testDb.execute(
    "SELECT * FROM warga WHERE id = ?",
    [id],
  );
  return rows[0] ?? null;
}

export async function findWargaByNik(nik) {
  const [rows] = await globalThis.testDb.execute(
    "SELECT * FROM warga WHERE nik = ? ORDER BY id DESC",
    [nik],
  );
  return rows[0] ?? null;
}

