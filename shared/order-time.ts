import type { Order } from "./types";

function createdParts(createdAt: string, timezone: string) {
  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)!.value;
  return {
    date: `${value("day")}.${value("month")}.${value("year")}`,
    time: `${value("hour")}:${value("minute")}`,
  };
}

export function orderTiming(
  order: Pick<Order, "createdAt" | "fulfillment" | "contact">,
  timezone: string,
) {
  const created = createdParts(order.createdAt, timezone);
  const requested = order.contact.time;
  const scheduled = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(requested);
  // Delivery/pickup slots are validated for the day the order was created,
  // so an old order must never borrow today's date or the browser's timezone.
  return {
    created: created ? `${created.date} · ${created.time}` : "Дата не указана",
    expectedLabel:
      order.fulfillment === "DINE_IN"
        ? "Подача"
        : scheduled
          ? order.fulfillment === "DELIVERY"
            ? "Доставить к"
            : "Выдать к"
          : "Ожидают",
    expected:
      requested === "ASAP"
        ? "Как можно скорее"
        : requested === "За столом"
          ? "По готовности"
          : scheduled && created
            ? `${created.date} · ${requested}`
            : requested || "Время не указано",
  };
}
