export type ReservationTime = {
  date: string;
  time: string;
  endTime: string;
  timezone: string;
};

export function minuteTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

// Reservation dates/times are restaurant wall-clock values, not browser-local instants.
export function reservationWhen(
  r: Pick<ReservationTime, "date" | "time" | "endTime">,
) {
  return `${r.date.split("-").reverse().join(".")} · ${r.time}–${r.endTime}`;
}

export function restaurantClock(timezone: string, date: string) {
  const offset = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    timeZoneName: "shortOffset",
  })
    .formatToParts(new Date(`${date}T12:00:00Z`))
    .find((p) => p.type === "timeZoneName")!
    .value.replace("GMT", "UTC");
  return `Время ресторана (${offset})`;
}
