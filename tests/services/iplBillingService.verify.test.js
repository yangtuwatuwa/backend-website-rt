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
  createExecutorProxy,
  createOwnedConnectionFacade,
  expectNoTransactionOwnership,
  expectSavepointProtocol,
  findBill,
  findIplLedgerEntries,
  findNotifications,
  findPayment,
  seedBill,
  seedBillPeriod,
  seedIplFixture,
  seedPayment,
} from "../helpers/iplBilling.js";

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

const { verifyPaymentService } = await import(
  "../../services/iplBillingService.js"
);

async function seedLinkedBills(fixture, { statuses = ["waiting_verification", "waiting_verification"] } = {}) {
  const firstPeriod = await seedBillPeriod(globalThis.testDb, {
    title: "IPL Januari Verify",
    createdBy: fixture.actor.id,
  });
  const secondPeriod = await seedBillPeriod(globalThis.testDb, {
    title: "IPL Februari Verify",
    createdBy: fixture.actor.id,
  });
  const first = await seedBill(globalThis.testDb, {
    billPeriodId: firstPeriod.id,
    familyId: fixture.family.id,
    amount: 175000,
    status: statuses[0],
  });
  const second = await seedBill(globalThis.testDb, {
    billPeriodId: secondPeriod.id,
    familyId: fixture.family.id,
    amount: 225000,
    status: statuses[1],
  });
  return { bills: [first, second], periods: [firstPeriod, secondPeriod] };
}

async function seedNormalPendingPayment(fixture) {
  const { bills } = await seedLinkedBills(fixture);
  const payment = await seedPayment(globalThis.testDb, {
    familyId: fixture.family.id,
    totalAmount: 400000,
    status: "pending",
    recordedBy: fixture.account.id,
    links: [
      { billId: bills[0].id, allocatedAmount: 175000 },
      { billId: bills[1].id, allocatedAmount: 225000 },
    ],
  });
  return { bills, payment };
}

async function seedMixedExemptPayment(fixture, { mismatch = false } = {}) {
  const exemptAt = new Date("2026-04-15T08:30:00.000Z");
  const firstPeriod = await seedBillPeriod(globalThis.testDb, {
    title: "IPL Mixed Normal",
    createdBy: fixture.actor.id,
  });
  const secondPeriod = await seedBillPeriod(globalThis.testDb, {
    title: "IPL Mixed Exempt",
    createdBy: fixture.actor.id,
  });
  const normalBill = await seedBill(globalThis.testDb, {
    billPeriodId: firstPeriod.id,
    familyId: fixture.family.id,
    amount: 180000,
    status: "waiting_verification",
  });
  const exemptBill = await seedBill(globalThis.testDb, {
    billPeriodId: secondPeriod.id,
    familyId: fixture.family.id,
    amount: 220000,
    status: "exempt",
    exemptReason: "Rumah kosong sementara",
    exemptBy: fixture.actor.id,
    exemptAt,
  });
  const payment = await seedPayment(globalThis.testDb, {
    familyId: fixture.family.id,
    totalAmount: 400000,
    status: "pending",
    recordedBy: fixture.account.id,
    links: [
      {
        billId: normalBill.id,
        allocatedAmount: mismatch ? 179999 : 180000,
      },
      { billId: exemptBill.id, allocatedAmount: 220000 },
    ],
  });
  return { payment, normalBill, exemptBill, exemptAt };
}

function expectExemptPreserved(stored, original, exemptAt) {
  expect(stored).toMatchObject({
    id: original.id,
    status: "exempt",
    exempt_reason: original.exemptReason,
    exempt_by: original.exemptBy,
  });
  expect(new Date(stored.exempt_at).getTime()).toBe(exemptAt.getTime());
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

describe("verifyPaymentService", () => {
  it("approve normal memperbarui payment+bills serta membuat ledger dan notification", async () => {
    const fixture = await seedIplFixture();
    const { bills, payment } = await seedNormalPendingPayment(fixture);
    const executor = createExecutorProxy();

    const result = await verifyPaymentService(
      {
        paymentId: payment.id,
        decision: "approved",
        actorId: fixture.actor.id,
      },
      executor,
    );

    expect(result).toMatchObject({
      payment_id: payment.id,
      bill_ids: bills.map((bill) => bill.id),
      status: "approved",
    });
    expect(await findPayment(payment.id)).toMatchObject({
      status: "approved",
      reject_reason: null,
      verified_by: fixture.actor.id,
    });
    expect((await findBill(bills[0].id)).status).toBe("paid");
    expect((await findBill(bills[1].id)).status).toBe("paid");
    const ledger = await findIplLedgerEntries();
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ type: "in", source_type: "ipl" });
    expect(Number(ledger[0].amount)).toBe(400000);
    const notifications = await findNotifications("payment", payment.id);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      account_id: fixture.account.id,
      title: "Pembayaran IPL Disetujui (Lunas)",
    });
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ emitRealtime: false }),
      executor,
    );
    expect(emitSyncEventMock).not.toHaveBeenCalled();
    expectNoTransactionOwnership(executor);
    expectSavepointProtocol(executor, "sp_verify_ipl_payment_");
  });

  it("auto-reject mismatch mereset bill non-exempt tetapi mempertahankan bill exempt beserta metadata", async () => {
    const fixture = await seedIplFixture();
    const { payment, normalBill, exemptBill, exemptAt } =
      await seedMixedExemptPayment(fixture, { mismatch: true });
    const executor = createExecutorProxy();

    const result = await verifyPaymentService(
      {
        paymentId: payment.id,
        decision: "approved",
        actorId: fixture.actor.id,
      },
      executor,
    );

    expect(result).toMatchObject({
      status: "rejected",
      reject_reason: "nominal tidak sesuai pada salah satu tagihan",
    });
    expect(await findPayment(payment.id)).toMatchObject({
      status: "rejected",
      reject_reason: "nominal tidak sesuai pada salah satu tagihan",
      verified_by: fixture.actor.id,
    });
    expect((await findBill(normalBill.id)).status).toBe("unpaid");
    expectExemptPreserved(await findBill(exemptBill.id), exemptBill, exemptAt);
    expect(await findIplLedgerEntries()).toHaveLength(0);
    const notifications = await findNotifications("payment", payment.id);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].title).toBe("Pembayaran IPL Ditolak");
    expect(emitSyncEventMock).not.toHaveBeenCalled();
    expectNoTransactionOwnership(executor);
    expectSavepointProtocol(executor, "sp_verify_ipl_payment_");
  });

  it("reject manual mereset bill non-exempt dan mempertahankan metadata exempt", async () => {
    const fixture = await seedIplFixture();
    const { payment, normalBill, exemptBill, exemptAt } =
      await seedMixedExemptPayment(fixture);
    const executor = createExecutorProxy();

    const result = await verifyPaymentService(
      {
        paymentId: payment.id,
        decision: "rejected",
        actorId: fixture.actor.id,
        rejectReason: "  Rekening koran tidak cocok  ",
      },
      executor,
    );

    expect(result).toMatchObject({
      status: "rejected",
      reject_reason: "Rekening koran tidak cocok",
    });
    expect(await findPayment(payment.id)).toMatchObject({
      status: "rejected",
      reject_reason: "Rekening koran tidak cocok",
      verified_by: fixture.actor.id,
    });
    expect((await findBill(normalBill.id)).status).toBe("unpaid");
    expectExemptPreserved(await findBill(exemptBill.id), exemptBill, exemptAt);
    expect(await findIplLedgerEntries()).toHaveLength(0);
    const notifications = await findNotifications("payment", payment.id);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toContain(
      "Alasan: Rekening koran tidak cocok",
    );
    expect(emitSyncEventMock).not.toHaveBeenCalled();
    expectNoTransactionOwnership(executor);
    expectSavepointProtocol(executor, "sp_verify_ipl_payment_");
  });

  it("payment tidak ditemukan menghasilkan error tanpa mutation atau savepoint", async () => {
    const executor = createExecutorProxy();
    const [rows] = await globalThis.testDb.execute(
      "SELECT COALESCE(MAX(id), 0) + 100000 AS missing_id FROM payments",
    );

    const result = await verifyPaymentService(
      {
        paymentId: Number(rows[0].missing_id),
        decision: "approved",
        actorId: 1,
      },
      executor,
    );

    expect(result.error).toBe("Data pembayaran tidak ditemukan!");
    expect(executor.query).not.toHaveBeenCalled();
    expect(createNotificationMock).not.toHaveBeenCalled();
    expect(await findIplLedgerEntries()).toHaveLength(0);
    expectNoTransactionOwnership(executor);
  });

  it.each(["approved", "rejected"])(
    "payment berstatus %s ditolak tanpa mutation atau savepoint",
    async (status) => {
      const fixture = await seedIplFixture();
      const payment = await seedPayment(globalThis.testDb, {
        familyId: fixture.family.id,
        status,
        rejectReason: status === "rejected" ? "Sudah ditolak" : null,
      });
      const executor = createExecutorProxy();

      const result = await verifyPaymentService(
        {
          paymentId: payment.id,
          decision: "approved",
          actorId: fixture.actor.id,
        },
        executor,
      );

      expect(result.error).toContain("sudah pernah diproses");
      expect((await findPayment(payment.id)).status).toBe(status);
      expect(executor.query).not.toHaveBeenCalled();
      expect(createNotificationMock).not.toHaveBeenCalled();
      expectNoTransactionOwnership(executor);
    },
  );

  it("payment pending tanpa link menghasilkan error tanpa mutation atau savepoint", async () => {
    const fixture = await seedIplFixture();
    const payment = await seedPayment(globalThis.testDb, {
      familyId: fixture.family.id,
      status: "pending",
      links: [],
    });
    const executor = createExecutorProxy();

    const result = await verifyPaymentService(
      {
        paymentId: payment.id,
        decision: "approved",
        actorId: fixture.actor.id,
      },
      executor,
    );

    expect(result.error).toContain("tidak memiliki tagihan yang terhubung");
    expect((await findPayment(payment.id)).status).toBe("pending");
    expect(executor.query).not.toHaveBeenCalled();
    expect(createNotificationMock).not.toHaveBeenCalled();
    expectNoTransactionOwnership(executor);
  });

  it("default memiliki ownership penuh dan mengirim notification realtime", async () => {
    const fixture = await seedIplFixture();
    const { payment } = await seedNormalPendingPayment(fixture);
    const ownedConnection = createOwnedConnectionFacade("verify_payment");
    const getConnectionSpy = jest
      .spyOn(pool, "getConnection")
      .mockResolvedValue(ownedConnection);

    const result = await verifyPaymentService({
      paymentId: payment.id,
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
    expect((await findPayment(payment.id)).status).toBe("approved");
    expect(await findIplLedgerEntries()).toHaveLength(1);
    expect(await findNotifications("payment", payment.id)).toHaveLength(1);
  });
});
