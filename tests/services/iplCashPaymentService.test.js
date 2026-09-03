import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

import {
  getOutstandingBillsByFamilyService,
  recordCashPaymentService,
} from "../../services/iplBillingService.js";
import {
  createExecutorProxy,
  expectNoTransactionOwnership,
  expectSavepointProtocol,
  findBill,
  findPayment,
  findPaymentLinks,
  seedBill,
  seedBillPeriod,
  seedIplFixture,
} from "../helpers/iplBilling.js";
import { seedFamilyWithAccount } from "../helpers/seed.js";

async function seedCashBills(fixture) {
  const january = await seedBillPeriod(globalThis.testDb, {
    title: "IPL Januari Tunai",
    createdBy: fixture.actor.id,
  });
  const february = await seedBillPeriod(globalThis.testDb, {
    title: "IPL Februari Tunai",
    createdBy: fixture.actor.id,
  });
  const bills = [
    await seedBill(globalThis.testDb, {
      billPeriodId: january.id,
      familyId: fixture.family.id,
      amount: 125000,
    }),
    await seedBill(globalThis.testDb, {
      billPeriodId: february.id,
      familyId: fixture.family.id,
      amount: 275000,
    }),
  ];
  return bills;
}

async function findCashAudits() {
  const [rows] = await globalThis.testDb.execute(
    "SELECT * FROM access_logs WHERE event_type = 'IPL_CASH_PAYMENT_RECORDED' ORDER BY id",
  );
  return rows;
}

async function countKasTransactions() {
  const [rows] = await globalThis.testDb.execute(
    "SELECT COUNT(*) AS total FROM kas_transaksi",
  );
  return Number(rows[0].total);
}

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("getOutstandingBillsByFamilyService", () => {
  it("menggunakan daftar bills unpaid milik KK yang dipilih", async () => {
    const fixture = await seedIplFixture();
    const bills = await seedCashBills(fixture);
    await globalThis.testDb.execute("UPDATE bills SET status = 'paid' WHERE id = ?", [bills[1].id]);

    const result = await getOutstandingBillsByFamilyService(
      fixture.family.id,
      globalThis.testDb,
    );

    expect(result.map((bill) => bill.id)).toEqual([bills[0].id]);
    expect(result[0]).toMatchObject({ family_id: fixture.family.id, status: "unpaid" });
  });
});

describe("recordCashPaymentService", () => {
  it("mencatat satu bill lunas dengan nominal authoritative dan audit", async () => {
    const fixture = await seedIplFixture();
    const [bill] = await seedCashBills(fixture);
    const executor = createExecutorProxy();

    const result = await recordCashPaymentService(
      {
        familyId: fixture.family.id,
        billIds: [bill.id],
        actorId: fixture.actor.id,
        actorRole: "bendahara",
        actorUsername: fixture.actor.username,
        ipAddress: "127.0.0.1",
        userAgent: "jest",
      },
      executor,
    );

    expect(result).toMatchObject({
      family_id: fixture.family.id,
      bill_ids: [bill.id],
      total_amount: 125000,
      bill_status: "paid",
      payment_method: "cash_to_bendahara",
    });
    expect(await findPayment(result.payment_id)).toMatchObject({
      family_id: fixture.family.id,
      total_amount: "125000.00",
      channel: "cash_to_bendahara",
      status: "approved",
      recorded_by: fixture.actor.id,
      verified_by: fixture.actor.id,
    });
    expect(await findPaymentLinks(result.payment_id)).toHaveLength(1);
    expect((await findBill(bill.id)).status).toBe("paid");

    const audits = await findCashAudits();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      username: fixture.actor.username,
      ip_address: "127.0.0.1",
      user_agent: "jest",
      status: "success",
    });
    expect(JSON.parse(audits[0].details)).toMatchObject({
      actor_id: fixture.actor.id,
      actor_role: "bendahara",
      family_id: fixture.family.id,
      bill_ids: [bill.id],
      payment_id: result.payment_id,
      total_amount: 125000,
      payment_method: "cash_to_bendahara",
    });
    expectNoTransactionOwnership(executor);
    expectSavepointProtocol(executor, "sp_record_ipl_cash_");
  });

  it("mendukung rapel beberapa bill dan menjumlahkan nominal server-side", async () => {
    const fixture = await seedIplFixture();
    const bills = await seedCashBills(fixture);

    const result = await recordCashPaymentService(
      {
        familyId: fixture.family.id,
        billIds: bills.map((bill) => bill.id),
        actorId: fixture.actor.id,
        actorRole: "bendahara",
      },
      globalThis.testDb,
    );

    expect(result).toMatchObject({
      bill_ids: bills.map((bill) => bill.id),
      total_amount: 400000,
      bill_status: "paid",
    });
    expect(await findPaymentLinks(result.payment_id)).toHaveLength(2);
    expect((await findBill(bills[0].id)).status).toBe("paid");
    expect((await findBill(bills[1].id)).status).toBe("paid");
    expect(await findCashAudits()).toHaveLength(1);
  });

  it("menolak bill milik KK lain tanpa mutasi", async () => {
    const fixture = await seedIplFixture();
    const other = await seedFamilyWithAccount(globalThis.testDb);
    const period = await seedBillPeriod(globalThis.testDb);
    const bill = await seedBill(globalThis.testDb, {
      billPeriodId: period.id,
      familyId: other.family.id,
    });
    const executor = createExecutorProxy();

    const result = await recordCashPaymentService(
      {
        familyId: fixture.family.id,
        billIds: [bill.id],
        actorId: fixture.actor.id,
        actorRole: "bendahara",
      },
      executor,
    );

    expect(result.error).toContain("bukan milik keluarga Anda");
    expect(result.statusCode).toBe(409);
    expect((await findBill(bill.id)).status).toBe("unpaid");
    expect(await findCashAudits()).toHaveLength(0);
    expectNoTransactionOwnership(executor);
    expectSavepointProtocol(executor, "sp_record_ipl_cash_", { rolledBack: true });
  });

  it("menolak bill yang sudah paid tanpa double-processing", async () => {
    const fixture = await seedIplFixture();
    const [bill] = await seedCashBills(fixture);
    await globalThis.testDb.execute("UPDATE bills SET status = 'paid' WHERE id = ?", [bill.id]);

    const result = await recordCashPaymentService(
      {
        familyId: fixture.family.id,
        billIds: [bill.id],
        actorId: fixture.actor.id,
        actorRole: "bendahara",
      },
      globalThis.testDb,
    );

    expect(result.error).toContain("sudah lunas");
    expect((await findBill(bill.id)).status).toBe("paid");
    expect(await findCashAudits()).toHaveLength(0);
  });

  it("tidak membuat kas_transaksi sebagai side effect", async () => {
    const fixture = await seedIplFixture();
    const [bill] = await seedCashBills(fixture);
    const before = await countKasTransactions();

    const result = await recordCashPaymentService(
      {
        familyId: fixture.family.id,
        billIds: [bill.id],
        actorId: fixture.actor.id,
        actorRole: "bendahara",
      },
      globalThis.testDb,
    );

    expect(result.error).toBeUndefined();
    expect(await countKasTransactions()).toBe(before);
  });

  it("rollback payment dan status bill ketika audit gagal", async () => {
    const fixture = await seedIplFixture();
    const [bill] = await seedCashBills(fixture);
    const executor = createExecutorProxy(({ normalizedSql }) => {
      if (normalizedSql.startsWith("INSERT INTO access_logs")) {
        throw new Error("Simulasi audit IPL gagal");
      }
      return undefined;
    });

    const result = await recordCashPaymentService(
      {
        familyId: fixture.family.id,
        billIds: [bill.id],
        actorId: fixture.actor.id,
        actorRole: "bendahara",
      },
      executor,
    );

    expect(result).toMatchObject({ statusCode: 500 });
    expect(result.error).toContain("Simulasi audit IPL gagal");
    expect((await findBill(bill.id)).status).toBe("unpaid");
    const [payments] = await globalThis.testDb.execute(
      "SELECT id FROM payments WHERE family_id = ?",
      [fixture.family.id],
    );
    expect(payments).toHaveLength(0);
    expect(await findCashAudits()).toHaveLength(0);
    expectNoTransactionOwnership(executor);
    expectSavepointProtocol(executor, "sp_record_ipl_cash_", { rolledBack: true });
  });
});
