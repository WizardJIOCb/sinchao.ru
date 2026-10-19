import { useEffect, useState } from "react";
import type { Order, Reservation } from "../../shared/types";
import type { Table, Visit } from "../../shared/v2";
import { orderLabels } from "../../shared/types";
import {
  reservationWhen,
  restaurantClock,
} from "../../shared/reservation-time";
import { api, money } from "../api";
import { OrderTiming } from "../OrderTiming";

type State = {
  tables: Table[];
  visits: Visit[];
  orders: Order[];
  reservations: Reservation[];
  now: { date: string; minutes: number; timezone: string };
};
export function OperatorPanel({ go }: { go: (tab: string) => void }) {
  const [data, setData] = useState<State | null>(null),
    [error, setError] = useState("");
  const [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState("");
  useEffect(() => {
    let active = true,
      loading = false;
    async function load() {
      if (loading) return;
      loading = true;
      try {
        const d = await api<State>("/admin/operator");
        if (active) {
          setData(d);
          setError("");
          setUpdated(new Date().toLocaleTimeString("ru-RU"));
        }
      } catch (e: any) {
        if (active) setError(e.message);
      } finally {
        loading = false;
      }
    }
    void load();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);
  async function action(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(path, "POST", body);
      setData(await api<State>("/admin/operator"));
      setUpdated(new Date().toLocaleTimeString("ru-RU"));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!data) return <p role="status">{error || "Загружаем смену…"}</p>;
  const table = data.tables.find((t) => t.id === selected);
  const visit = data.visits.find((v) => v.tableId === selected);
  const calls = data.visits.flatMap((v) =>
    v.calls
      .filter((c) => c.status === "OPEN")
      .map((c) => ({ ...c, table: v.tableName })),
  );
  const booked = (id: string) =>
    data.reservations.filter(
      (r) => r.tableId === id && r.status === "CONFIRMED",
    );
  const upcoming = (id: string) =>
    booked(id).find(
      (r) =>
        Number(r.endTime.slice(0, 2)) * 60 + Number(r.endTime.slice(3)) >
        data.now.minutes,
    );
  return (
    <div className="operator-panel">
      <h2>Панель оператора</h2>
      <p>
        {data.now.date.split("-").reverse().join(".")} ·{" "}
        {restaurantClock(data.now.timezone, data.now.date)} · Обновлено{" "}
        {updated}. Автообновление каждые 10 секунд.
      </p>
      {error && (
        <p role="alert" className="error">
          Данные могут быть устаревшими: {error}
        </p>
      )}
      <div className="operator-stats">
        <span>
          <b>
            {data.visits.length} / {data.tables.length}
          </b>{" "}
          столов занято
        </span>
        <button onClick={() => go("orders")}>
          <b>{data.orders.length}</b> активных заказов
        </button>
        <button onClick={() => go("reservations")}>
          <b>
            {data.reservations.filter((r) => r.status === "CONFIRMED").length}
          </b>{" "}
          ожидаемых броней сегодня
        </button>
        <span>
          <b>{calls.length}</b> вызовов
        </span>
      </div>
      {!!calls.length && (
        <section className="record">
          <h3>Гости ждут</h3>
          {calls.map((c) => (
            <div className="record-head" key={c.id}>
              <strong>
                {c.table} ·{" "}
                {c.kind === "BILL" ? "Просят счёт" : "Зовут официанта"}
              </strong>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void action(`/admin/v2/calls/${c.id}/done`, {})}
              >
                Обслужено
              </button>
            </div>
          ))}
        </section>
      )}
      <h3>Столы · выберите для подробностей</h3>
      <div className="operator-tables">
        {data.tables.map((t) => {
          const v = data.visits.find((v) => v.tableId === t.id),
            r = upcoming(t.id);
          return (
            <button
              key={t.id}
              className={`operator-table ${v ? "occupied" : r ? "reserved" : "free"} ${selected === t.id ? "selected" : ""}`}
              aria-pressed={selected === t.id}
              onClick={() => setSelected(t.id)}
            >
              <strong>{t.name}</strong>
              <small>
                {t.zone} · {t.seats} мест
              </small>
              <span>
                {v
                  ? "Гости за столом"
                  : r
                    ? `Бронь ${r.time}–${r.endTime}`
                    : "Свободен сейчас"}
              </span>
              {v?.calls.some((c) => c.status === "OPEN") && (
                <b>Гости вызывают</b>
              )}
            </button>
          );
        })}
      </div>
      {table && (
        <section className="record">
          <h3>
            {table.name} · {table.zone}
          </h3>
          {visit ? (
            <>
              <p>
                Гости за столом · Код визита: <b>{visit.joinCode}</b>
              </p>
              <p>
                Счёт {money(visit.total)} · чаевые {money(visit.tip)} · оплачено{" "}
                {money(visit.paid)}
              </p>
              <button className="primary" onClick={() => go("v2")}>
                Счёт и обслуживание
              </button>
            </>
          ) : (
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void action("/admin/v2/visits", { tableId: table.id })
              }
            >
              Посадить гостей без брони
            </button>
          )}
          {!booked(table.id).length && <p>Ожидаемых броней на сегодня нет.</p>}
          {booked(table.id).map((r) => (
            <div className="operator-booking" key={r.id}>
              <p>
                <b>{reservationWhen(r)}</b> · {r.partySize} гостей · {r.name}
              </p>
              <a href={"tel:" + r.phone}>{r.phone}</a>
              {r.preorder && <p>Есть предзаказ на {money(r.preorder.total)}</p>}
              {!visit && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void action("/admin/v2/visits", {
                      tableId: table.id,
                      reservationId: r.id,
                    })
                  }
                >
                  Посадить по этой брони
                </button>
              )}
            </div>
          ))}
        </section>
      )}
      <div className="operator-queues">
        <section className="record">
          <h3>Заказы в работе</h3>
          {data.orders.length ? (
            data.orders.map((o) => (
              <div className="operator-order" key={o.id}>
                <p>
                  №{o.number} ·{" "}
                  {o.tableName ||
                    (o.fulfillment === "DELIVERY"
                      ? "Доставка"
                      : "Самовывоз")}{" "}
                  · {orderLabels[o.status]} · {money(o.total)}
                </p>
                <OrderTiming order={o} timezone={data.now.timezone} />
              </div>
            ))
          ) : (
            <p>Активных заказов нет.</p>
          )}
          <button className="secondary" onClick={() => go("orders")}>
            Управлять заказами
          </button>
        </section>
        <section className="record">
          <h3>Брони сегодня</h3>
          {data.reservations.length ? (
            data.reservations.map((r) => (
              <p key={r.id}>
                <b>
                  {r.time}–{r.endTime}
                </b>{" "}
                · {r.tableName || "Без стола"} · {r.partySize} гостей · {r.name}
                {r.status === "SEATED" ? " · за столом" : ""}
              </p>
            ))
          ) : (
            <p>Броней на сегодня нет.</p>
          )}
          <button className="secondary" onClick={() => go("reservations")}>
            Управлять бронями
          </button>
        </section>
      </div>
    </div>
  );
}
