import { test } from "node:test";
import assert from "node:assert/strict";
import {
  minuteTime,
  reservationWhen,
  restaurantClock,
} from "../shared/reservation-time";
import { reservationView } from "../server/modules/reservations";

test("reservation interval uses saved bounds and restaurant timezone, regardless of browser timezone", () => {
  const row = {
    data: { date: "2026-10-01", time: "12:00", timezone: "Asia/Yekaterinburg" },
    start_minute: 720,
    end_minute: 810,
  };
  const booking = reservationView(row);
  assert.equal(reservationWhen(booking), "01.10.2026 · 12:00–13:30");
  assert.equal(
    restaurantClock(booking.timezone, booking.date),
    "Время ресторана (UTC+5)",
  );
  assert.equal(minuteTime(1440), "24:00");
  // Historical duration comes from the saved row, not today's reservation settings.
  assert.equal(reservationView({ ...row, end_minute: 840 }).endTime, "14:00");
});
