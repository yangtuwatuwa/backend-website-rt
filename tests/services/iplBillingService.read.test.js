import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  createBillPeriodService,
  getAllBillPeriodsService,
  getBillDetailWithAuthService,
  getBillPeriodDetailService,
  getMyBillsService,
  getPaymentAuditService,
  getPendingPaymentsService,
  getPeriodSummaryService,
  setExemptService,
} from "../../services/iplBillingService.js";
import {
  createExecutorProxy,
  expectNoTransactionOwnership,
  findBill,
  normalizeSql,
  seedBill,
  seedBillPeriod,
  seedIplFixture,
  seedPayment,
} from "../helpers/iplBilling.js";

function expectExecutorSql(executor, fragments) {
  const sqlCalls = executor.execute.mock.calls.map(([sql]) => normalizeSql(sql));
  for (const fragment of fragments) {
    expect(sqlCalls.some((sql) => sql.includes(fragment))).toBe(true);
  }
  expect(executor.query).not.toHaveBeenCalled();
  expectNoTransactionOwnership(executor);
}

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("executor propagation pada fungsi IPL sederhana", () => {
  it("createBillPeriodService memakai executor untuk lookup, insert, dan refetch", async () => {
    const fixture = await seedIplFixture();
    const executor = createExecutorProxy();

    const result = await createBillPeriodService(
      {
        title: "  IPL Propagasi Create  ",
        defaultAmount: "315000",
        dueDate: "2098-07-31",
        periodMonth: 7,
        periodYear: 2098,
        createdBy: fixture.actor.id,
      },
      executor,
    );

    expect(result.period).toMatchObject({
      title: "IPL Propagasi Create",
      status: "draft",
      period_month: 7,
      period_year: 2098,
    });
    expect(Number(result.period.default_amount)).toBe(315000);
    expectExecutorSql(executor, [
      "FROM bill_periods WHERE period_month = ? AND period_year = ?",
      "INSERT INTO bill_periods",
      "WHERE bp.id = ?",
    ]);
  });

  it("getAllBillPeriodsService meneruskan filter melalui executor", async () => {
    await seedBillPeriod(globalThis.testDb, {
      title: "Draft Read List",
      status: "draft",
      periodYear: 2088,
    });
    await seedBillPeriod(globalThis.testDb, {
      title: "Published Read List",
      status: "published",
      periodYear: 2088,
    });
    const executor = createExecutorProxy();

    const result = await getAllBillPeriodsService(
      { status: "published", periodYear: 2088, limit: 10, offset: 0 },
      executor,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: "Published Read List",
      status: "published",
    });
    expectExecutorSql(executor, ["FROM bill_periods bp", "bp.status = ?"]);
  });

  it("getBillPeriodDetailService memakai executor untuk period dan summary", async () => {
    const fixture = await seedIplFixture();
    const period = await seedBillPeriod(globalThis.testDb, {
      createdBy: fixture.actor.id,
    });
    await seedBill(globalThis.testDb, {
      billPeriodId: period.id,
      familyId: fixture.family.id,
      amount: 210000,
      status: "unpaid",
    });
    const executor = createExecutorProxy();

    const result = await getBillPeriodDetailService(period.id, executor);

    expect(result.period.id).toBe(period.id);
    expect(result.summary).toMatchObject({
      total_bills: 1,
      total_billed: 210000,
      total_uncollected: 210000,
    });
    expectExecutorSql(executor, [
      "WHERE bp.id = ?",
      "FROM bills WHERE bill_period_id = ?",
    ]);
  });

  it("setExemptService memakai executor untuk lookup, update, dan refetch", async () => {
    const fixture = await seedIplFixture();
    const period = await seedBillPeriod(globalThis.testDb);
    const bill = await seedBill(globalThis.testDb, {
      billPeriodId: period.id,
      familyId: fixture.family.id,
      status: "unpaid",
    });
    const executor = createExecutorProxy();

    const result = await setExemptService(
      bill.id,
      "  Rumah tidak dihuni  ",
      fixture.actor.id,
      executor,
    );

    expect(result.bill).toMatchObject({
      id: bill.id,
      status: "exempt",
      exempt_reason: "Rumah tidak dihuni",
      exempt_by: fixture.actor.id,
    });
    expect(await findBill(bill.id)).toMatchObject({
      status: "exempt",
      exempt_reason: "Rumah tidak dihuni",
      exempt_by: fixture.actor.id,
    });
    expectExecutorSql(executor, [
      "FROM bills b",
      "SET status = 'exempt'",
    ]);
    expect(
      executor.execute.mock.calls.filter(([sql]) =>
        normalizeSql(sql).includes("FROM bills b"),
      ),
    ).toHaveLength(2);
  });

  it("getPeriodSummaryService memakai executor untuk period dan summary", async () => {
    const fixture = await seedIplFixture();
    const period = await seedBillPeriod(globalThis.testDb);
    await seedBill(globalThis.testDb, {
      billPeriodId: period.id,
      familyId: fixture.family.id,
      amount: 190000,
      status: "paid",
    });
    const executor = createExecutorProxy();

    const result = await getPeriodSummaryService(period.id, executor);

    expect(result.summary).toMatchObject({
      total_bills: 1,
      count_paid: 1,
      total_collected: 190000,
    });
    expectExecutorSql(executor, [
      "WHERE bp.id = ?",
      "FROM bills WHERE bill_period_id = ?",
    ]);
  });

  it("getMyBillsService memakai executor yang sama untuk account dan bills family", async () => {
    const fixture = await seedIplFixture();
    const period = await seedBillPeriod(globalThis.testDb);
    const bill = await seedBill(globalThis.testDb, {
      billPeriodId: period.id,
      familyId: fixture.family.id,
      status: "unpaid",
    });
    const executor = createExecutorProxy();

    const result = await getMyBillsService(
      fixture.account.id,
      { status: "unpaid" },
      executor,
    );

    expect(result.map((row) => row.id)).toContain(bill.id);
    expectExecutorSql(executor, [
      "FROM acount WHERE id = ?",
      "WHERE b.family_id = ?",
    ]);
  });

  it("getBillDetailWithAuthService memakai executor untuk bill, account, dan payments", async () => {
    const fixture = await seedIplFixture();
    const period = await seedBillPeriod(globalThis.testDb);
    const bill = await seedBill(globalThis.testDb, {
      billPeriodId: period.id,
      familyId: fixture.family.id,
      status: "paid",
    });
    const payment = await seedPayment(globalThis.testDb, {
      familyId: fixture.family.id,
      totalAmount: 200000,
      status: "approved",
      links: [{ billId: bill.id, allocatedAmount: 200000 }],
    });
    const executor = createExecutorProxy();

    const result = await getBillDetailWithAuthService(
      bill.id,
      fixture.account.id,
      "warga",
      executor,
    );

    expect(result.bill.id).toBe(bill.id);
    expect(result.payments.map((row) => row.id)).toContain(payment.id);
    expectExecutorSql(executor, [
      "FROM bills b",
      "FROM acount WHERE id = ?",
      "FROM payments p JOIN payment_bill_links pbl",
    ]);
  });

  it("getPendingPaymentsService memakai executor untuk list dan nested payment links", async () => {
    const fixture = await seedIplFixture();
    const period = await seedBillPeriod(globalThis.testDb);
    const bill = await seedBill(globalThis.testDb, {
      billPeriodId: period.id,
      familyId: fixture.family.id,
      status: "waiting_verification",
    });
    const pending = await seedPayment(globalThis.testDb, {
      familyId: fixture.family.id,
      status: "pending",
      links: [{ billId: bill.id, allocatedAmount: 200000 }],
    });
    await seedPayment(globalThis.testDb, {
      familyId: fixture.family.id,
      status: "approved",
      links: [],
    });
    const executor = createExecutorProxy();

    const result = await getPendingPaymentsService(
      { limit: 10, offset: 0 },
      executor,
    );

    expect(result.map((row) => row.id)).toEqual([pending.id]);
    expect(result[0].bills).toHaveLength(1);
    expectExecutorSql(executor, [
      "WHERE p.status = 'pending'",
      "FROM payment_bill_links pbl",
    ]);
  });

  it("getPaymentAuditService memakai executor untuk filter dan nested payment links", async () => {
    const fixture = await seedIplFixture();
    const period = await seedBillPeriod(globalThis.testDb);
    const bill = await seedBill(globalThis.testDb, {
      billPeriodId: period.id,
      familyId: fixture.family.id,
      status: "waiting_verification",
    });
    const matching = await seedPayment(globalThis.testDb, {
      familyId: fixture.family.id,
      channel: "cash_to_rt",
      status: "pending",
      links: [{ billId: bill.id, allocatedAmount: 200000 }],
    });
    await seedPayment(globalThis.testDb, {
      familyId: fixture.family.id,
      channel: "transfer",
      status: "rejected",
      rejectReason: "Tidak cocok",
      links: [],
    });
    const executor = createExecutorProxy();

    const result = await getPaymentAuditService(
      {
        channel: "cash_to_rt",
        status: "pending",
        billPeriodId: period.id,
        limit: 10,
        offset: 0,
      },
      executor,
    );

    expect(result.map((row) => row.id)).toEqual([matching.id]);
    expect(result[0].bills).toHaveLength(1);
    expectExecutorSql(executor, [
      "FROM payments p",
      "p.channel = ?",
      "p.status = ?",
      "b.bill_period_id = ?",
      "FROM payment_bill_links pbl",
    ]);
  });
});
