import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import pool from "../../config/sqlconfig.js";
import { submitPaymentService } from "../../services/iplBillingService.js";
import {
  createExecutorProxy,
  createOwnedConnectionFacade,
  expectNoTransactionOwnership,
  expectSavepointProtocol,
  findBill,
  findIplLedgerEntries,
  findPayment,
  findPaymentLinks,
  normalizeSql,
  seedBill,
  seedBillPeriod,
  seedIplFixture,
  seedPayment,
} from "../helpers/iplBilling.js";
import { seedFamilyWithAccount } from "../helpers/seed.js";

async function seedTwoBills(fixture, overrides = {}) {
  const firstPeriod = await seedBillPeriod(globalThis.testDb, {
    title: "IPL Januari Submit",
    createdBy: fixture.actor.id,
  });
  const secondPeriod = await seedBillPeriod(globalThis.testDb, {
    title: "IPL Februari Submit",
    createdBy: fixture.actor.id,
  });
  const first = await seedBill(globalThis.testDb, {
    billPeriodId: firstPeriod.id,
    familyId: fixture.family.id,
    amount: 150000,
    ...overrides,
  });
  const second = await seedBill(globalThis.testDb, {
    billPeriodId: secondPeriod.id,
    familyId: fixture.family.id,
    amount: 250000,
    ...overrides,
  });
  return { periods: [firstPeriod, secondPeriod], bills: [first, second] };
}

async function countPayments() {
  const [rows] = await globalThis.testDb.execute(
    "SELECT COUNT(*) AS total FROM payments",
  );
  return Number(rows[0].total);
}

async function countPaymentLinks() {
  const [rows] = await globalThis.testDb.execute(
    "SELECT COUNT(*) AS total FROM payment_bill_links",
  );
  return Number(rows[0].total);
}

function expectNoSavepointOrOwnership(executor) {
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

describe("submitPaymentService", () => {
  it("cash_to_bendahara menyimpan payment, links, bills paid, dan ledger dalam outer+nested savepoint", async () => {
    const fixture = await seedIplFixture();
    const { bills } = await seedTwoBills(fixture);
    const executor = createExecutorProxy();

    const result = await submitPaymentService(
      {
        billIds: bills.map((bill) => bill.id),
        familyId: fixture.family.id,
        amountStated: 400000,
        channel: "cash_to_bendahara",
        recordedBy: fixture.actor.id,
      },
      executor,
    );

    expect(result).toMatchObject({
      bill_ids: bills.map((bill) => bill.id),
      total_amount: 400000,
      bill_status: "paid",
    });
    expect(await findPayment(result.payment_id)).toMatchObject({
      family_id: fixture.family.id,
      channel: "cash_to_bendahara",
      proof_url: "cash_in_hand",
      status: "approved",
      recorded_by: fixture.actor.id,
      verified_by: fixture.actor.id,
    });
    const links = await findPaymentLinks(result.payment_id);
    expect(links).toHaveLength(2);
    expect(links.map((link) => Number(link.allocated_amount))).toEqual([
      150000, 250000,
    ]);
    expect((await findBill(bills[0].id)).status).toBe("paid");
    expect((await findBill(bills[1].id)).status).toBe("paid");

    const ledger = await findIplLedgerEntries();
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ type: "in", source_type: "ipl" });
    expect(Number(ledger[0].amount)).toBe(400000);

    const querySql = executor.query.mock.calls.map(([sql]) => normalizeSql(sql));
    const outerSaveIndex = querySql.findIndex((sql) =>
      sql.startsWith("SAVEPOINT sp_submit_ipl_payment_"),
    );
    const innerSaveIndex = querySql.findIndex((sql) =>
      sql.startsWith("SAVEPOINT sp_create_payment_"),
    );
    const innerReleaseIndex = querySql.findIndex((sql) =>
      sql.startsWith("RELEASE SAVEPOINT sp_create_payment_"),
    );
    const outerReleaseIndex = querySql.findIndex((sql) =>
      sql.startsWith("RELEASE SAVEPOINT sp_submit_ipl_payment_"),
    );
    expect(outerSaveIndex).toBeGreaterThanOrEqual(0);
    expect(innerSaveIndex).toBeGreaterThan(outerSaveIndex);
    expect(innerReleaseIndex).toBeGreaterThan(innerSaveIndex);
    expect(outerReleaseIndex).toBeGreaterThan(innerReleaseIndex);

    const outerName = querySql[outerSaveIndex].split(" ")[1];
    const innerName = querySql[innerSaveIndex].split(" ")[1];
    expect(outerName).not.toBe(innerName);
    expect(outerName).toMatch(/^sp_submit_ipl_payment_/);
    expect(innerName).toMatch(/^sp_create_payment_/);
    expectNoTransactionOwnership(executor);
    expectSavepointProtocol(executor, "sp_submit_ipl_payment_");
    expectSavepointProtocol(executor, "sp_create_payment_");
  });

  it.each([
    ["transfer", "/uploads/bukti-ipl.jpg"],
    ["cash_to_rt", null],
  ])(
    "%s membuat payment+links pending dan bills waiting_verification tanpa ledger",
    async (channel, proofUrl) => {
      const fixture = await seedIplFixture();
      const { bills } = await seedTwoBills(fixture);
      const executor = createExecutorProxy();

      const result = await submitPaymentService(
        {
          billIds: bills.map((bill) => bill.id),
          familyId: fixture.family.id,
          amountStated: 400000,
          channel,
          proofUrl,
          recordedBy: fixture.account.id,
        },
        executor,
      );

      expect(result).toMatchObject({
        total_amount: 400000,
        bill_status: "waiting_verification",
      });
      expect(await findPayment(result.payment_id)).toMatchObject({
        status: "pending",
        channel,
        proof_url: proofUrl,
      });
      expect(await findPaymentLinks(result.payment_id)).toHaveLength(2);
      expect((await findBill(bills[0].id)).status).toBe(
        "waiting_verification",
      );
      expect((await findBill(bills[1].id)).status).toBe(
        "waiting_verification",
      );
      expect(await findIplLedgerEntries()).toHaveLength(0);
      expectNoTransactionOwnership(executor);
      expectSavepointProtocol(executor, "sp_submit_ipl_payment_");
      expectSavepointProtocol(executor, "sp_create_payment_");
    },
  );

  it("bill tidak ditemukan ditolak tanpa mutation atau savepoint", async () => {
    const fixture = await seedIplFixture();
    const executor = createExecutorProxy();
    const beforePayments = await countPayments();

    const result = await submitPaymentService(
      {
        billIds: [99999999],
        familyId: fixture.family.id,
        amountStated: 200000,
        channel: "cash_to_rt",
      },
      executor,
    );

    expect(result.error).toContain("tidak ditemukan");
    expect(await countPayments()).toBe(beforePayments);
    expectNoSavepointOrOwnership(executor);
  });

  it("bill milik family lain ditolak tanpa mutation atau savepoint", async () => {
    const fixture = await seedIplFixture();
    const other = await seedFamilyWithAccount(globalThis.testDb);
    const period = await seedBillPeriod(globalThis.testDb);
    const bill = await seedBill(globalThis.testDb, {
      billPeriodId: period.id,
      familyId: other.family.id,
    });
    const executor = createExecutorProxy();

    const result = await submitPaymentService(
      {
        billIds: [bill.id],
        familyId: fixture.family.id,
        amountStated: 200000,
        channel: "cash_to_rt",
      },
      executor,
    );

    expect(result.error).toContain("bukan milik keluarga Anda");
    expect(await countPayments()).toBe(0);
    expect((await findBill(bill.id)).status).toBe("unpaid");
    expectNoSavepointOrOwnership(executor);
  });

  it("rapel lintas family ditolak tanpa mutation atau savepoint", async () => {
    const first = await seedIplFixture();
    const second = await seedFamilyWithAccount(globalThis.testDb);
    const periodA = await seedBillPeriod(globalThis.testDb);
    const periodB = await seedBillPeriod(globalThis.testDb);
    const billA = await seedBill(globalThis.testDb, {
      billPeriodId: periodA.id,
      familyId: first.family.id,
      amount: 100000,
    });
    const billB = await seedBill(globalThis.testDb, {
      billPeriodId: periodB.id,
      familyId: second.family.id,
      amount: 100000,
    });
    const executor = createExecutorProxy();

    const result = await submitPaymentService(
      {
        billIds: [billA.id, billB.id],
        amountStated: 200000,
        channel: "cash_to_rt",
      },
      executor,
    );

    expect(result.error).toContain("harus milik keluarga / KK yang sama");
    expect(await countPayments()).toBe(0);
    expectNoSavepointOrOwnership(executor);
  });

  it.each([
    ["paid", "sudah lunas"],
    ["exempt", "telah dibebaskan"],
  ])(
    "bill berstatus %s ditolak tanpa mutation atau savepoint",
    async (status, expectedMessage) => {
      const fixture = await seedIplFixture();
      const period = await seedBillPeriod(globalThis.testDb);
      const bill = await seedBill(globalThis.testDb, {
        billPeriodId: period.id,
        familyId: fixture.family.id,
        status,
      });
      const executor = createExecutorProxy();

      const result = await submitPaymentService(
        {
          billIds: [bill.id],
          familyId: fixture.family.id,
          amountStated: 200000,
          channel: "cash_to_rt",
        },
        executor,
      );

      expect(result.error).toContain(expectedMessage);
      expect(await countPayments()).toBe(0);
      expect((await findBill(bill.id)).status).toBe(status);
      expectNoSavepointOrOwnership(executor);
    },
  );

  it("bill dalam payment pending lain ditolak tanpa mutation atau savepoint", async () => {
    const fixture = await seedIplFixture();
    const period = await seedBillPeriod(globalThis.testDb);
    const bill = await seedBill(globalThis.testDb, {
      billPeriodId: period.id,
      familyId: fixture.family.id,
      status: "waiting_verification",
    });
    const existing = await seedPayment(globalThis.testDb, {
      familyId: fixture.family.id,
      totalAmount: 200000,
      status: "pending",
      links: [{ billId: bill.id, allocatedAmount: 200000 }],
    });
    const executor = createExecutorProxy();

    const result = await submitPaymentService(
      {
        billIds: [bill.id],
        familyId: fixture.family.id,
        amountStated: 200000,
        channel: "cash_to_rt",
      },
      executor,
    );

    expect(result.error).toContain("sedang dalam proses verifikasi pending");
    expect(await countPayments()).toBe(1);
    expect(await countPaymentLinks()).toBe(1);
    expect((await findPayment(existing.id)).status).toBe("pending");
    expectNoSavepointOrOwnership(executor);
  });

  it("nominal tidak cocok ditolak tanpa mutation atau savepoint", async () => {
    const fixture = await seedIplFixture();
    const { bills } = await seedTwoBills(fixture);
    const executor = createExecutorProxy();

    const result = await submitPaymentService(
      {
        billIds: bills.map((bill) => bill.id),
        familyId: fixture.family.id,
        amountStated: 399999,
        channel: "cash_to_rt",
      },
      executor,
    );

    expect(result.error).toContain("tidak sesuai dengan total tagihan");
    expect(await countPayments()).toBe(0);
    expect(await countPaymentLinks()).toBe(0);
    expect((await findBill(bills[0].id)).status).toBe("unpaid");
    expect((await findBill(bills[1].id)).status).toBe("unpaid");
    expectNoSavepointOrOwnership(executor);
  });

  it("default membuka, commit, dan release transaksi sendiri", async () => {
    const fixture = await seedIplFixture();
    const { bills } = await seedTwoBills(fixture);
    const ownedConnection = createOwnedConnectionFacade("submit_payment");
    const getConnectionSpy = jest
      .spyOn(pool, "getConnection")
      .mockResolvedValue(ownedConnection);

    const result = await submitPaymentService({
      billIds: bills.map((bill) => bill.id),
      familyId: fixture.family.id,
      amountStated: 400000,
      channel: "cash_to_bendahara",
      recordedBy: fixture.actor.id,
    });

    expect(result).toMatchObject({ bill_status: "paid" });
    expect(getConnectionSpy).toHaveBeenCalledTimes(1);
    expect(ownedConnection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(ownedConnection.commit).toHaveBeenCalledTimes(1);
    expect(ownedConnection.rollback).not.toHaveBeenCalled();
    expect(ownedConnection.release).toHaveBeenCalledTimes(1);
    expect((await findPayment(result.payment_id)).status).toBe("approved");
    expect(await findIplLedgerEntries()).toHaveLength(1);
  });
});
