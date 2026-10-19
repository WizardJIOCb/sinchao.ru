import { test } from "node:test";
import assert from "node:assert/strict";
import { orderTiming } from "../shared/order-time";
import type { Order } from "../shared/types";

const order = {
  createdAt: "2026-10-19T20:15:00.000Z",
  fulfillment: "DELIVERY",
  contact: { time: "18:30" },
} as Order;

test("order creation and requested slot use the restaurant date across UTC midnight", () => {
  assert.deepEqual(orderTiming(order, "Asia/Yekaterinburg"), {
    created: "20.10.2026 · 01:15",
    expectedLabel: "Доставить к",
    expected: "20.10.2026 · 18:30",
  });
  assert.equal(
    orderTiming(order, "America/Los_Angeles").created,
    "19.10.2026 · 13:15",
  );
});

test("ASAP has no invented deadline; pickup shows the original day", () => {
  assert.equal(
    orderTiming(
      { ...order, contact: { ...order.contact, time: "ASAP" } },
      "Asia/Yekaterinburg",
    ).expected,
    "Как можно скорее",
  );
  assert.deepEqual(
    orderTiming({ ...order, fulfillment: "PICKUP" }, "Asia/Yekaterinburg"),
    {
      created: "20.10.2026 · 01:15",
      expectedLabel: "Выдать к",
      expected: "20.10.2026 · 18:30",
    },
  );
});

test("table orders and reservation preorders retain their distinct serving time", () => {
  const dine = {
    ...order,
    fulfillment: "DINE_IN" as const,
    contact: { ...order.contact, time: "За столом" },
  };
  assert.equal(
    orderTiming(dine, "Asia/Yekaterinburg").expected,
    "По готовности",
  );
  const reservation = "21.10.2026 · 18:00–19:30";
  const timing = orderTiming(
    { ...dine, contact: { ...dine.contact, time: reservation } },
    "Asia/Yekaterinburg",
  );
  assert.equal(timing.expectedLabel, "Подача");
  assert.equal(timing.expected, reservation);
});
