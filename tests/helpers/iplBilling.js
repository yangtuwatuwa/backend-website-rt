import { jest } from "@jest/globals";

import {
  seedAccount,
  seedFamilyWithAccount,
} from "./seed.js";

let sequence = 0;
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

export function createOwnedConnectionFacade(label = "ipl") {
  const savepointName = `sp_test_owned_${label}_${++ownedFacadeCounter}`;

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

export async function seedIplFixture() {
  const fixture = await seedFamilyWithAccount(globalThis.testDb);
  const actor = await seedAccount(globalThis.testDb, {
    role: "bendahara",
    familyId: null,
  });
  return { ...fixture, actor };
}

export async function seedBillPeriod(executor, overrides = {}) {
  sequence += 1;
  const period = {
    title: `Periode IPL Test ${sequence}`,
    defaultAmount: 200000,
    dueDate: "2099-12-31",
    periodMonth: ((sequence - 1) % 12) + 1,
    periodYear: 2090 + Math.floor((sequence - 1) / 12),
    status: "draft",
    createdBy: null,
    ...overrides,
  };

  const [result] = await executor.execute(
    `INSERT INTO bill_periods
      (title, default_amount, due_date, period_month, period_year, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      period.title,
      period.defaultAmount,
      period.dueDate,
      period.periodMonth,
      period.periodYear,
      period.status,
      period.createdBy,
    ],
  );
  return { id: result.insertId, ...period };
}

export async function seedBill(executor, overrides = {}) {
  if (!overrides.billPeriodId || !overrides.familyId) {
    throw new Error("seedBill memerlukan billPeriodId dan familyId.");
  }
  const bill = {
    amount: 200000,
    dueDate: "2099-12-31",
    status: "unpaid",
    exemptReason: null,
    exemptBy: null,
    exemptAt: null,
    ...overrides,
  };
  const [result] = await executor.execute(
    `INSERT INTO bills
      (bill_period_id, family_id, amount, due_date, status,
       exempt_reason, exempt_by, exempt_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      bill.billPeriodId,
      bill.familyId,
      bill.amount,
      bill.dueDate,
      bill.status,
      bill.exemptReason,
      bill.exemptBy,
      bill.exemptAt,
    ],
  );
  return { id: result.insertId, ...bill };
}

export async function seedPayment(executor, overrides = {}) {
  if (!overrides.familyId) {
    throw new Error("seedPayment memerlukan familyId.");
  }
  const payment = {
    totalAmount: 200000,
    channel: "transfer",
    proofUrl: "/uploads/test-payment.jpg",
    status: "pending",
    rejectReason: null,
    recordedBy: null,
    verifiedBy: null,
    verifiedAt: null,
    links: [],
    ...overrides,
  };
  const [result] = await executor.execute(
    `INSERT INTO payments
      (family_id, total_amount, channel, proof_url, status, reject_reason,
       recorded_by, verified_by, verified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payment.familyId,
      payment.totalAmount,
      payment.channel,
      payment.proofUrl,
      payment.status,
      payment.rejectReason,
      payment.recordedBy,
      payment.verifiedBy,
      payment.verifiedAt,
    ],
  );

  for (const link of payment.links) {
    await executor.execute(
      `INSERT INTO payment_bill_links
        (payment_id, bill_id, allocated_amount) VALUES (?, ?, ?)`,
      [result.insertId, link.billId, link.allocatedAmount],
    );
  }
  return { id: result.insertId, ...payment };
}

export async function findBillPeriod(id) {
  const [rows] = await globalThis.testDb.execute(
    "SELECT * FROM bill_periods WHERE id = ?",
    [id],
  );
  return rows[0] ?? null;
}

export async function findBillsByPeriod(periodId) {
  const [rows] = await globalThis.testDb.execute(
    "SELECT * FROM bills WHERE bill_period_id = ? ORDER BY family_id, id",
    [periodId],
  );
  return rows;
}

export async function findBill(id) {
  const [rows] = await globalThis.testDb.execute(
    "SELECT * FROM bills WHERE id = ?",
    [id],
  );
  return rows[0] ?? null;
}

export async function findPayment(id) {
  const [rows] = await globalThis.testDb.execute(
    "SELECT * FROM payments WHERE id = ?",
    [id],
  );
  return rows[0] ?? null;
}

export async function findPaymentLinks(paymentId) {
  const [rows] = await globalThis.testDb.execute(
    "SELECT * FROM payment_bill_links WHERE payment_id = ? ORDER BY bill_id",
    [paymentId],
  );
  return rows;
}

export async function findIplLedgerEntries() {
  const [rows] = await globalThis.testDb.execute(
    "SELECT * FROM financial_ledger WHERE source_type = 'ipl' ORDER BY id",
  );
  return rows;
}

export async function findNotifications(referenceType, referenceId) {
  const [rows] = await globalThis.testDb.execute(
    `SELECT * FROM notifications
     WHERE type = 'ipl' AND reference_type = ? AND reference_id = ?
     ORDER BY account_id, id`,
    [referenceType, referenceId],
  );
  return rows;
}

