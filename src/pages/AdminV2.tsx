import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { api, money } from "../api";
import {
  reservationWhen,
  restaurantClock,
} from "../../shared/reservation-time";
import { FloorPlan } from "../V2";
import { orderLabels, type Reservation, type User } from "../../shared/types";
import type {
  EventInfo,
  Gift,
  Table,
  V2Settings,
  Visit,
} from "../../shared/v2";

const emptyTable = {
  name: "Новый стол",
  seats: 4,
  x: 15,
  y: 15,
  zone: "Зал",
  shape: "round",
  active: true,
};
type GiftRow = Gift & { buyer_name: string };
function QrImage({ token, name }: { token: string; name: string }) {
  const [src, setSrc] = useState("");
  const url = location.origin + "/dine-in/" + token;
  useEffect(() => {
    void QRCode.toDataURL(url, {
      width: 600,
      margin: 3,
      errorCorrectionLevel: "M",
    }).then(setSrc);
  }, [url]);
  return (
    <div>
      <img className="qr-image" src={src || undefined} alt={"QR-код " + name} />
      <a href={src} download={name + "-QR.png"}>
        Скачать QR для печати
      </a>
      <p>
        <a href={url} target="_blank" rel="noreferrer">
          Открыть меню {name}
        </a>
      </p>
    </div>
  );
}
export function AdminV2({
  user,
  say,
  refresh,
}: {
  user: User;
  say: (s: string) => void;
  refresh: () => Promise<void>;
}) {
  const [tab, setTab] = useState("hall"),
    [tables, setTables] = useState<Table[]>([]),
    [settings, setSettings] = useState<V2Settings | null>(null),
    [visits, setVisits] = useState<Visit[]>([]),
    [events, setEvents] = useState<EventInfo[]>([]),
    [gifts, setGifts] = useState<GiftRow[]>([]),
    [reservations, setReservations] = useState<Reservation[]>([]),
    [editing, setEditing] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [guests, setGuests] = useState<
      { name: string; phone: string; email: string; guests: number }[] | null
    >(null),
    [confirm, setConfirm] = useState<{
      text: string;
      path: string;
      method: string;
      body: unknown;
    } | null>(null);
  const redeemKey = useRef(crypto.randomUUID());
  const tableForm = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (tab === "tables" && editing && tableForm.current) {
      tableForm.current.scrollIntoView({ behavior: "smooth", block: "center" });
      tableForm.current
        .querySelector<HTMLInputElement>('[name="name"]')
        ?.focus({ preventScroll: true });
    }
  }, [editing, tab]);
  const manager = ["ADMIN", "MANAGER"].includes(user.role);
  async function load() {
    const [t, v, e, g, d] = await Promise.all([
      api<{ tables: Table[]; settings: V2Settings }>("/admin/v2/tables"),
      api<Visit[]>("/admin/v2/visits"),
      api<EventInfo[]>("/admin/v2/events"),
      api<GiftRow[]>("/admin/v2/gifts"),
      api<{ reservations: Reservation[] }>("/admin/dashboard"),
    ]);
    setTables(t.tables);
    setSettings(t.settings);
    setVisits(v);
    setEvents(e);
    setGifts(g);
    setReservations(d.reservations);
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load().catch(() => {});
    }, 10000);
    return () => clearInterval(t);
  }, []);
  async function mutate(
    path: string,
    method: string,
    body: unknown,
    key?: string,
  ) {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      await api(path, method, body, key);
      await load();
      await refresh();
      setConfirm(null);
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const editTable = tables.find((t) => t.id === editing) ?? emptyTable;
  return (
    <div className="admin-v2">
      <div className="categories">
        {[
          ["hall", "Зал и обслуживание"],
          ["tables", "Столы и QR"],
          ["events", "События"],
          ["gifts", "Сертификаты"],
          ["rules", "Правила V2"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "selected" : ""}
            onClick={() => {
              setTab(id);
              setEditing(null);
              setConfirm(null);
              setError("");
              setGuests(null);
            }}
          >
            {label}
            {id === "hall" &&
            visits.some((v) => v.calls.some((c) => c.status === "OPEN"))
              ? " •"
              : ""}
          </button>
        ))}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {confirm && (
        <div className="admin-confirm" role="alert">
          <p>{confirm.text}</p>
          <div className="button-row">
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void mutate(confirm.path, confirm.method, confirm.body)
              }
            >
              Да, подтверждаю
            </button>
            <button className="secondary" onClick={() => setConfirm(null)}>
              Назад
            </button>
          </div>
        </div>
      )}
      {tab === "hall" && (
        <>
          <h2>Гости за столами</h2>
          <p>
            Откройте посещение, сообщите гостям шестизначный код. Заказы
            поступают в общую очередь кухни. Код действует только до закрытия
            посещения.
          </p>
          <form
            className="record inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void mutate("/admin/v2/visits", "POST", {
                tableId: f.get("tableId"),
                ...(f.get("reservationId")
                  ? { reservationId: f.get("reservationId") }
                  : {}),
              });
            }}
          >
            <label>
              Стол
              <select name="tableId" required>
                {tables
                  .filter(
                    (t) => t.active && !visits.some((v) => v.tableId === t.id),
                  )
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {t.seats} мест
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Бронь
              <select name="reservationId">
                <option value="">Без брони</option>
                {reservations
                  .filter((r) => r.status === "CONFIRMED" && r.tableId)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {reservationWhen(r)} ·{" "}
                      {restaurantClock(r.timezone, r.date)} · {r.tableName} ·{" "}
                      {r.name}
                      {r.preorder ? " · предзаказ" : ""}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className="primary"
              disabled={
                busy ||
                !tables.some(
                  (t) => t.active && !visits.some((v) => v.tableId === t.id),
                )
              }
            >
              Открыть посещение
            </button>
          </form>
          {!visits.length && <p>Открытых посещений пока нет.</p>}
          {visits.map((v) => (
            <article className="record" key={v.id}>
              <div className="record-head">
                <h2>{v.tableName}</h2>
                <span>
                  Код визита: <code className="visit-code">{v.joinCode}</code>
                </span>
              </div>
              {v.reservation && (
                <p>
                  Бронь: <strong>{reservationWhen(v.reservation)}</strong> ·{" "}
                  {restaurantClock(v.reservation.timezone, v.reservation.date)}
                </p>
              )}
              {v.calls
                .filter((c) => c.status === "OPEN")
                .map((c) => (
                  <div className="admin-confirm record-head" key={c.id}>
                    <b>
                      {c.kind === "WAITER"
                        ? "Гости зовут официанта"
                        : "Гости просят счёт"}
                    </b>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        void mutate(`/admin/v2/calls/${c.id}/done`, "POST", {})
                      }
                    >
                      Обслужено
                    </button>
                  </div>
                ))}
              {v.orders.map((o) => (
                <div className="visit-order" key={o.id}>
                  <div className="record-head">
                    <b>
                      №{o.number} · {money(o.total)}
                    </b>
                    <span>
                      {orderLabels[o.status]} ·{" "}
                      {o.paymentStatus === "PAID" ? "Оплачен" : "Не оплачен"}
                    </span>
                  </div>
                  {o.items.map((i) => (
                    <p key={i.id}>
                      {i.name} × {i.quantity} · {i.modifierNames.join(", ")}{" "}
                      {i.notes && " — " + i.notes}
                    </p>
                  ))}
                  <div className="button-row">
                    {(
                      {
                        CREATED: ["CONFIRMED", "CANCELLED"],
                        CONFIRMED: ["PREPARING", "CANCELLED"],
                        PREPARING: ["READY"],
                        READY: ["COMPLETED"],
                      } as Record<string, string[]>
                    )[o.status]?.map((status) => (
                      <button
                        className="secondary"
                        key={status}
                        disabled={
                          busy ||
                          (status === "COMPLETED" && o.paymentStatus !== "PAID")
                        }
                        onClick={() =>
                          void mutate(`/admin/orders/${o.id}/status`, "PATCH", {
                            status,
                          })
                        }
                      >
                        {orderLabels[status]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <h3>
                Счёт: {money(v.total)} · оплачено {money(v.paid)}
              </h3>
              {!v.shares.length && v.total > 0 && (
                <form
                  className="inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void mutate(`/admin/v2/visits/${v.id}/split`, "POST", {
                      count: Number(new FormData(e.currentTarget).get("count")),
                    });
                  }}
                >
                  <label>
                    Количество частей
                    <input
                      name="count"
                      type="number"
                      min={1}
                      max={20}
                      defaultValue={1}
                    />
                  </label>
                  <button className="secondary" disabled={busy}>
                    Подготовить счёт
                  </button>
                </form>
              )}
              {v.shares.map((s) => (
                <div className="record-head" key={s.id}>
                  <span>Часть {s.position}</span>
                  <span>
                    <b>{money(s.amount)}</b>
                    {!!s.giftPaid && (
                      <small> · сертификатом {money(s.giftPaid)}</small>
                    )}
                    <small> · ID части: {s.id}</small>
                  </span>
                  {s.paid ? (
                    <span className="badge">Оплачена</span>
                  ) : (
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        setConfirm({
                          text: `Подтвердить фактическое получение ${money(s.amount - s.giftPaid)} за часть ${s.position}, ${v.tableName}?`,
                          path: `/admin/v2/visits/${v.id}/shares/${s.id}/pay`,
                          method: "POST",
                          body: {},
                        })
                      }
                    >
                      Подтвердить оплату
                    </button>
                  )}
                </div>
              ))}
              <div className="button-row">
                {!!v.shares.length &&
                  !v.shares.some((s) => s.paid || s.giftPaid > 0) && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void mutate(
                          `/admin/v2/visits/${v.id}/split`,
                          "DELETE",
                          {},
                        )
                      }
                    >
                      Отменить разделение счёта
                    </button>
                  )}
                <button
                  className="secondary"
                  disabled={
                    busy ||
                    v.orders.some(
                      (o) => !["COMPLETED", "CANCELLED"].includes(o.status),
                    )
                  }
                  onClick={() =>
                    setConfirm({
                      text: `Закрыть посещение ${v.tableName}? Старый код перестанет действовать.`,
                      path: `/admin/v2/visits/${v.id}/close`,
                      method: "POST",
                      body: {},
                    })
                  }
                >
                  Закрыть посещение
                </button>
              </div>
            </article>
          ))}
        </>
      )}
      {tab === "tables" && (
        <>
          <div className="table-admin-grid">
            <div>
              <h2>Схема зала</h2>
              {manager && (
                <label className="table-selector">
                  Выберите стол для редактирования
                  <select
                    value={editing && editing !== "new" ? editing : ""}
                    onChange={(e) => setEditing(e.target.value || null)}
                  >
                    <option value="">Выбрать стол</option>
                    {tables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {t.active ? "" : " · выключен"}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <FloorPlan
                floor={{
                  tables,
                  verified: settings?.floorPlanVerified ?? false,
                }}
                selected={editing ?? undefined}
                onSelect={manager ? setEditing : undefined}
              />
              {manager && (
                <button className="primary" onClick={() => setEditing("new")}>
                  Добавить стол
                </button>
              )}
            </div>
            {manager && editing && (
              <form
                ref={tableForm}
                key={editing}
                className="record standard-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const ok = await mutate(
                    "/admin/v2/tables" +
                      (editing === "new" ? "" : "/" + editing),
                    editing === "new" ? "POST" : "PUT",
                    {
                      name: f.get("name"),
                      seats: Number(f.get("seats")),
                      x: Number(f.get("x")),
                      y: Number(f.get("y")),
                      zone: f.get("zone"),
                      shape: f.get("shape"),
                      active: f.get("active") === "on",
                    },
                  );
                  if (ok) {
                    say("Стол сохранён");
                    if (editing === "new") setEditing(null);
                  }
                }}
              >
                <h3>
                  {editing === "new"
                    ? "Новый стол"
                    : `Настройки: ${editTable.name}`}
                </h3>
                <p className="muted">
                  X — положение слева направо, Y — сверху вниз. Изменения
                  применяются кнопкой «Сохранить стол».
                </p>
                <label>
                  Название
                  <input
                    name="name"
                    required
                    maxLength={50}
                    defaultValue={editTable.name}
                  />
                </label>
                <div className="form-grid">
                  <label>
                    Мест
                    <input
                      name="seats"
                      type="number"
                      min={1}
                      max={20}
                      defaultValue={editTable.seats}
                    />
                  </label>
                  <label>
                    Зона
                    <input
                      name="zone"
                      required
                      maxLength={60}
                      defaultValue={editTable.zone}
                    />
                  </label>
                  <label>
                    Положение X, %
                    <input
                      name="x"
                      type="number"
                      min={0}
                      max={85}
                      defaultValue={editTable.x}
                    />
                  </label>
                  <label>
                    Положение Y, %
                    <input
                      name="y"
                      type="number"
                      min={0}
                      max={80}
                      defaultValue={editTable.y}
                    />
                  </label>
                </div>
                <label>
                  Форма
                  <select name="shape" defaultValue={editTable.shape}>
                    <option value="round">Круглый</option>
                    <option value="square">Прямоугольный</option>
                    <option value="long">Длинный</option>
                  </select>
                </label>
                <label className="preorder-toggle">
                  <input
                    name="active"
                    type="checkbox"
                    defaultChecked={editTable.active}
                  />
                  Доступен гостям
                </label>
                <button className="primary" disabled={busy}>
                  Сохранить стол
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setEditing(null)}
                >
                  Закрыть
                </button>
              </form>
            )}
          </div>
          <div className="table-qr-grid">
            {tables.map((t) => (
              <article className="record" key={t.id}>
                <h3>
                  {t.name} · {t.seats} мест
                </h3>
                <p>{t.active ? t.zone : "Выключен"}</p>
                <p className="muted">
                  X: {t.x}% · Y: {t.y}%
                </p>
                {manager && (
                  <button
                    type="button"
                    className="secondary"
                    aria-label={`Редактировать ${t.name}`}
                    onClick={() => {
                      setEditing(t.id);
                      if (editing === t.id)
                        tableForm.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        });
                    }}
                  >
                    Редактировать
                  </button>
                )}
                {t.token && <QrImage token={t.token} name={t.name} />}
              </article>
            ))}
          </div>
        </>
      )}
      {tab === "events" && (
        <>
          <h2>События ресторана</h2>
          {manager && (
            <button className="primary" onClick={() => setEditing("new-event")}>
              Создать событие
            </button>
          )}
          {editing &&
            manager &&
            (() => {
              const event = events.find((e) => e.id === editing);
              return (
                <form
                  key={editing}
                  className="record standard-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    if (
                      await mutate(
                        "/admin/v2/events/" +
                          (editing === "new-event" ? "new" : editing),
                        "PUT",
                        {
                          title: f.get("title"),
                          description: f.get("description"),
                          starts_at: new Date(
                            String(f.get("date")) +
                              "T" +
                              String(f.get("time")) +
                              ":00+05:00",
                          ).toISOString(),
                          capacity: Number(f.get("capacity")),
                          active: f.get("active") === "on",
                        },
                      )
                    )
                      setEditing(null);
                  }}
                >
                  <label>
                    Название
                    <input
                      name="title"
                      required
                      minLength={2}
                      maxLength={120}
                      defaultValue={event?.title}
                    />
                  </label>
                  <label>
                    Описание
                    <textarea
                      name="description"
                      maxLength={2000}
                      defaultValue={event?.description}
                    />
                  </label>
                  <div className="form-grid">
                    <label>
                      Дата в Октябрьском
                      <input
                        name="date"
                        type="date"
                        required
                        defaultValue={
                          event
                            ? new Date(
                                new Date(event.starts_at).getTime() +
                                  5 * 3600000,
                              )
                                .toISOString()
                                .slice(0, 10)
                            : undefined
                        }
                      />
                    </label>
                    <label>
                      Время в Октябрьском
                      <input
                        name="time"
                        type="time"
                        required
                        defaultValue={
                          event
                            ? new Date(
                                new Date(event.starts_at).getTime() +
                                  5 * 3600000,
                              )
                                .toISOString()
                                .slice(11, 16)
                            : "18:00"
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Мест
                    <input
                      name="capacity"
                      type="number"
                      min={1}
                      max={300}
                      defaultValue={event?.capacity ?? 20}
                    />
                  </label>
                  <label className="preorder-toggle">
                    <input
                      name="active"
                      type="checkbox"
                      defaultChecked={event?.active ?? false}
                    />
                    Опубликовать и открыть запись
                  </label>
                  <button className="primary" disabled={busy}>
                    Сохранить событие
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setEditing(null)}
                  >
                    Закрыть
                  </button>
                </form>
              );
            })()}
          {events.map((e) => (
            <article className="record" key={e.id}>
              <h3>{e.title}</h3>
              <p>
                {new Date(e.starts_at).toLocaleString("ru-RU", {
                  timeZone: "Asia/Yekaterinburg",
                })}{" "}
                · {e.reserved}/{e.capacity} мест ·{" "}
                {e.active ? "Опубликовано" : "Запись закрыта"}
              </p>
              <div className="button-row">
                {manager && (
                  <button
                    className="secondary"
                    onClick={() => setEditing(e.id)}
                  >
                    Редактировать событие
                  </button>
                )}
                <button
                  className="secondary"
                  onClick={() =>
                    void api<typeof guests>(`/admin/v2/events/${e.id}/guests`)
                      .then(setGuests)
                      .catch((e) => setError(e.message))
                  }
                >
                  Список гостей
                </button>
              </div>
            </article>
          ))}
          {guests && (
            <div className="record">
              <h3>Список гостей</h3>
              {!guests.length && <p>Записей нет.</p>}
              {guests.map((g, i) => (
                <p key={i}>
                  {g.name} · {g.guests} гостей · {g.phone || g.email}
                </p>
              ))}
            </div>
          )}
        </>
      )}
      {tab === "gifts" && (
        <>
          <h2>Подарочные сертификаты</h2>
          <p>
            Активация означает, что ресторан действительно получил оплату.
            Использование сертификата списывает баланс и учитывается в оплате
            заказа.
          </p>
          <form
            className="record standard-form"
            onChange={() => {
              redeemKey.current = crypto.randomUUID();
            }}
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                await mutate(
                  "/admin/v2/gifts/redeem",
                  "POST",
                  {
                    code: f.get("code"),
                    ...(f.get("target") === "share"
                      ? { shareId: f.get("orderId") }
                      : { orderId: f.get("orderId") }),
                    amount: Math.round(Number(f.get("amount")) * 100),
                  },
                  redeemKey.current,
                )
              ) {
                redeemKey.current = crypto.randomUUID();
                say("Сертификат применён к заказу.");
              }
            }}
          >
            <h3>Оплатить заказ сертификатом</h3>
            <label>
              Что оплачиваем
              <select name="target">
                <option value="order">Заказ доставки или самовывоза</option>
                <option value="share">Часть счёта за столом</option>
              </select>
            </label>
            <label>
              Код сертификата
              <input name="code" required maxLength={24} />
            </label>
            <label>
              ID заказа или части счёта
              <input
                name="orderId"
                required
                placeholder="ID указан в заказе или рядом с частью счёта"
              />
            </label>
            <label>
              Сумма списания, ₽
              <input
                name="amount"
                type="number"
                min={0.01}
                step={0.01}
                max={100000}
                required
              />
            </label>
            <button className="primary" disabled={busy}>
              Списать в оплату заказа
            </button>
          </form>
          {gifts.map((g) => (
            <article className="record" key={g.id}>
              <h3>
                {money(g.amount)} · {g.buyer_name}
              </h3>
              <p>{g.message}</p>
              <p>
                {g.status === "PENDING"
                  ? "Ожидает оплаты"
                  : g.status === "ACTIVE"
                    ? "Активен · остаток " + money(g.balance)
                    : "Отменён"}
              </p>
              {g.status === "ACTIVE" && (
                <code className="gift-code">{g.code}</code>
              )}
              {g.status === "PENDING" && (
                <div className="button-row">
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      setConfirm({
                        text: `Подтвердить получение ${money(g.amount)} за сертификат покупателя ${g.buyer_name}?`,
                        path: `/admin/v2/gifts/${g.id}/activate`,
                        method: "POST",
                        body: {},
                      })
                    }
                  >
                    Оплата получена — активировать
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void mutate(`/admin/v2/gifts/${g.id}/cancel`, "POST", {})
                    }
                  >
                    Отменить заявку
                  </button>
                </div>
              )}
            </article>
          ))}
        </>
      )}
      {tab === "rules" &&
        settings &&
        (manager ? (
          <form
            className="record standard-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void mutate("/admin/v2/settings", "PUT", {
                floorPlanVerified: f.get("floor") === "on",
                referralsEnabled: f.get("referrals") === "on",
                referralPoints: Number(f.get("points")),
                giftValidityDays: Number(f.get("days")),
              });
            }}
          >
            <h2>Правила V2</h2>
            <label className="preorder-toggle">
              <input
                name="floor"
                type="checkbox"
                defaultChecked={settings.floorPlanVerified}
              />
              Расположение, номера и вместимость столов проверены по настоящему
              залу
            </label>
            <label className="preorder-toggle">
              <input
                name="referrals"
                type="checkbox"
                defaultChecked={settings.referralsEnabled}
              />
              Программа приглашений включена
            </label>
            <label>
              Бонус каждому за первый заказ друга
              <input
                name="points"
                type="number"
                min={0}
                max={1000}
                defaultValue={settings.referralPoints}
              />
            </label>
            <label>
              Срок действия сертификата после оплаты, дней
              <input
                name="days"
                type="number"
                min={1}
                max={1095}
                defaultValue={settings.giftValidityDays}
              />
            </label>
            <p>
              Для региональных маршрутов Food Journey заполните поле region у
              блюд в редакторе меню. Аллергены и острота также берутся из
              карточек ресторана.
            </p>
            <button className="primary" disabled={busy}>
              Сохранить правила V2
            </button>
          </form>
        ) : (
          <p>Изменять правила может управляющий.</p>
        ))}
    </div>
  );
}
