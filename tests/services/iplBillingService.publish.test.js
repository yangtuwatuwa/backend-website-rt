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
  findBillPeriod,
  findBillsByPeriod,
  findNotifications,
  seedBillPeriod,
  seedIplFixture,
} from "../helpers/iplBilling.js";
import { seedFamilyWithAccount } from "../helpers/seed.js";

const emitSyncEventMock = jest.fn();
jest.unstable_mockModule("../../utils/socket.js", () => ({
  emitSyncEvent: emitSyncEventMock,
}));

const notificationModule = await import(
  "../../services/notificationService.js"
);
const actualBroadcast = notificationModule.createBroadcastFamilyNotifications;
const createBroadcastMock = jest.fn();
jest.unstable_mockModule("../../services/notificationService.js", () => ({
  ...notificationModule,
  createBroadcastFamilyNotifications: createBroadcastMock,
}));

const billModel = await import("../../models/billModel.js");
const actualGetSummary = billModel.getBillsSummaryByPeriodId;
const getSummaryMock = jest.fn();
jest.unstable_mockModule("../../models/billModel.js", () => ({
  ...billModel,
  getBillsSummaryByPeriodId: getSummaryMock,
}));

const { publishBillPeriodService } = await import(
  "../../services/iplBillingService.js"
);

beforeEach(() => {
  emitSyncEventMock.mockReset();
  createBroadcastMock.mockReset();
  createBroadcastMock.mockImplementation((payload, executor) =>
    actualBroadcast(payload, executor ?? globalThis.testDb),
  );
  getSummaryMock.mockReset();
  getSummaryMock.mockImplementation((periodId, executor) =>
    actualGetSummary(
      periodId,
      !executor || executor === pool ? globalThis.testDb : executor,
    ),
  );
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("publishBillPeriodService", () => {
  it("membuat bill semua family, publish period, dan menyimpan broadcast notification dalam savepoint", async () => {
    const first = await seedIplFixture();
    const second = await seedFamilyWithAccount(globalThis.testDb);
    const period = await seedBillPeriod(globalThis.testDb, {
      defaultAmount: 275000,
      createdBy: first.actor.id,
    });
    const executor = createExecutorProxy();

    const result = await publishBillPeriodService(
      period.id,
      first.actor.id,
      executor,
    );

    expect(result).toMatchObject({
      period_id: period.id,
      total_bills_generated: 2,
      summary: { total_bills: 2, total_billed: 550000 },
    });
    expect((await findBillPeriod(period.id)).status).toBe("published");
    const bills = await findBillsByPeriod(period.id);
    expect(bills).toHaveLength(2);
    expect(bills.map((bill) => bill.family_id)).toEqual([
      first.family.id,
      second.family.id,
    ]);
    expect(bills.every((bill) => Number(bill.amount) === 275000)).toBe(true);
    expect(bills.every((bill) => bill.status === "unpaid")).toBe(true);

    const notifications = await findNotifications("bill_period", period.id);
    expect(notifications).toHaveLength(2);
    expect(notifications.map((row) => row.account_id)).toEqual([
      first.account.id,
      second.account.id,
    ]);
    expect(createBroadcastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        familyIds: [first.family.id, second.family.id],
        referenceId: period.id,
        emitRealtime: false,
      }),
      executor,
    );
    expect(emitSyncEventMock).not.toHaveBeenCalled();
    expectNoTransactionOwnership(executor);
    expectSavepointProtocol(executor, "sp_publish_bill_period_");
  });

  it("menolak period yang tidak ditemukan tanpa mutation atau savepoint", async () => {
    const executor = createExecutorProxy();
    const [rows] = await globalThis.testDb.execute(
      "SELECT COALESCE(MAX(id), 0) + 100000 AS missing_id FROM bill_periods",
    );

    const result = await publishBillPeriodService(
      Number(rows[0].missing_id),
      1,
      executor,
    );

    expect(result.error).toBe("Periode tagihan tidak ditemukan!");
    expect(executor.query).not.toHaveBeenCalled();
    expect(createBroadcastMock).not.toHaveBeenCalled();
    expectNoTransactionOwnership(executor);
  });

  it("menolak period yang sudah published tanpa menambah bill atau notification", async () => {
    const fixture = await seedIplFixture();
    const period = await seedBillPeriod(globalThis.testDb, {
      status: "published",
      createdBy: fixture.actor.id,
    });
    const executor = createExecutorProxy();

    const result = await publishBillPeriodService(
      period.id,
      fixture.actor.id,
      executor,
    );

    expect(result.error).toContain("sudah pernah dipublish");
    expect(await findBillsByPeriod(period.id)).toHaveLength(0);
    expect(await findNotifications("bill_period", period.id)).toHaveLength(0);
    expect(executor.query).not.toHaveBeenCalled();
    expectNoTransactionOwnership(executor);
  });

  it("menolak ketika tidak ada family tanpa membuat savepoint", async () => {
    const fixture = await seedIplFixture();
    const period = await seedBillPeriod(globalThis.testDb, {
      createdBy: fixture.actor.id,
    });
    const executor = createExecutorProxy(({ normalizedSql }) => {
      if (normalizedSql.includes("SELECT f.id AS family_id FROM family f")) {
        return { handled: true, value: [[], []] };
      }
      return undefined;
    });

    const result = await publishBillPeriodService(
      period.id,
      fixture.actor.id,
      executor,
    );

    expect(result.error).toContain("Tidak ada keluarga");
    expect((await findBillPeriod(period.id)).status).toBe("draft");
    expect(await findBillsByPeriod(period.id)).toHaveLength(0);
    expect(executor.query).not.toHaveBeenCalled();
    expectNoTransactionOwnership(executor);
  });

  it("rollback batch bills ketika update period gagal setelah createBatchBills", async () => {
    const fixture = await seedIplFixture();
    const period = await seedBillPeriod(globalThis.testDb, {
      createdBy: fixture.actor.id,
    });
    const executor = createExecutorProxy(({ normalizedSql }) => {
      if (normalizedSql === "UPDATE bill_periods SET status = ? WHERE id = ?") {
        throw new Error("Simulasi kegagalan update period");
      }
      return undefined;
    });

    const result = await publishBillPeriodService(
      period.id,
      fixture.actor.id,
      executor,
    );

    expect(result.error).toContain("Simulasi kegagalan update period");
    expect((await findBillPeriod(period.id)).status).toBe("draft");
    expect(await findBillsByPeriod(period.id)).toHaveLength(0);
    expect(await findNotifications("bill_period", period.id)).toHaveLength(0);
    expectSavepointProtocol(executor, "sp_publish_bill_period_", {
      rolledBack: true,
    });
  });

  it("injected rollback penuh termasuk notification ketika summary gagal", async () => {
    const fixture = await seedIplFixture();
    const period = await seedBillPeriod(globalThis.testDb, {
      createdBy: fixture.actor.id,
    });
    const executor = createExecutorProxy();
    getSummaryMock.mockRejectedValueOnce(
      new Error("Simulasi kegagalan summary injected"),
    );

    const result = await publishBillPeriodService(
      period.id,
      fixture.actor.id,
      executor,
    );

    expect(result.error).toContain("Simulasi kegagalan summary injected");
    expect((await findBillPeriod(period.id)).status).toBe("draft");
    expect(await findBillsByPeriod(period.id)).toHaveLength(0);
    expect(await findNotifications("bill_period", period.id)).toHaveLength(0);
    expect(createBroadcastMock).toHaveBeenCalledTimes(1);
    expectSavepointProtocol(executor, "sp_publish_bill_period_", {
      rolledBack: true,
    });
  });

  it("mendokumentasikan default sudah commit sehingga state tersimpan ketika summary gagal", async () => {
    const fixture = await seedIplFixture();
    const period = await seedBillPeriod(globalThis.testDb, {
      createdBy: fixture.actor.id,
    });
    const ownedConnection = createOwnedConnectionFacade("publish_summary");
    jest.spyOn(pool, "getConnection").mockResolvedValue(ownedConnection);
    getSummaryMock.mockRejectedValueOnce(
      new Error("Simulasi kegagalan summary setelah commit"),
    );

    const result = await publishBillPeriodService(period.id, fixture.actor.id);

    expect(result.error).toContain("Simulasi kegagalan summary setelah commit");
    expect(ownedConnection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(ownedConnection.commit).toHaveBeenCalledTimes(1);
    expect(ownedConnection.rollback).not.toHaveBeenCalled();
    expect(ownedConnection.release).toHaveBeenCalledTimes(1);
    expect((await findBillPeriod(period.id)).status).toBe("published");
    expect(await findBillsByPeriod(period.id)).toHaveLength(1);
    expect(await findNotifications("bill_period", period.id)).toHaveLength(1);
  });

  it("default memiliki ownership penuh dan mengirim notification realtime", async () => {
    const fixture = await seedIplFixture();
    const period = await seedBillPeriod(globalThis.testDb, {
      createdBy: fixture.actor.id,
    });
    const ownedConnection = createOwnedConnectionFacade("publish_success");
    const getConnectionSpy = jest
      .spyOn(pool, "getConnection")
      .mockResolvedValue(ownedConnection);

    const result = await publishBillPeriodService(period.id, fixture.actor.id);

    expect(result).toMatchObject({
      period_id: period.id,
      total_bills_generated: 1,
    });
    expect(getConnectionSpy).toHaveBeenCalledTimes(1);
    expect(ownedConnection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(ownedConnection.commit).toHaveBeenCalledTimes(1);
    expect(ownedConnection.rollback).not.toHaveBeenCalled();
    expect(ownedConnection.release).toHaveBeenCalledTimes(1);
    expect(createBroadcastMock).toHaveBeenCalledWith(
      expect.objectContaining({ emitRealtime: true }),
      undefined,
    );
    expect(emitSyncEventMock).toHaveBeenCalledWith("notification");
  });
});
