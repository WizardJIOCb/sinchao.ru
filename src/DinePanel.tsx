import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CreditCard, Plus, Utensils } from "lucide-react";
import { api, money } from "./api";
import { reservationWhen } from "../shared/reservation-time";
import type { Visit } from "../shared/v2";
import { VisitTips } from "./Tips";
import { OnlineBillPayment } from "./OnlineBillPayment";

export function DinePanel({
  refreshKey,
  token,
  tableName,
  tableReady,
  onVisit,
  openMenu,
  openCart,
  say,
}: {
  refreshKey: number;
  token: string;
  tableName: string;
  tableReady: boolean;
  onVisit: (visit: Visit | null) => void;
  openMenu: () => void;
  openCart: () => void;
  say: (text: string) => void;
}) {
  const [visit, setVisit] = useState<Visit | null>(null);
  const [code, setCode] = useState("");
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [billOpen, setBillOpen] = useState(() =>
    new URLSearchParams(location.search).has("payment"),
  );
  const bill = useRef<HTMLDetailsElement>(null);
  const visitPath =
    "/v2/visit" + (token ? "?token=" + encodeURIComponent(token) : "");
  const load = useCallback(async () => {
    const value = await api<Visit | null>(visitPath);
    setVisit(value);
    onVisit(value);
    setLoading(false);
  }, [visitPath, onVisit]);
  useEffect(() => {
    let active = true;
    let polling = false;
    setVisit(null);
    onVisit(null);
    setLoading(true);
    setError("");
    async function update() {
      if (polling) return;
      polling = true;
      try {
        const value = await api<Visit | null>(visitPath);
        if (active) {
          setVisit(value);
          onVisit(value);
          setError("");
        }
      } catch (e: any) {
        if (active) {
          setVisit(null);
          onVisit(null);
          setError(e.message);
        }
      } finally {
        polling = false;
        if (active) setLoading(false);
      }
    }
    void update();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void update();
    }, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [visitPath, refreshKey, onVisit]);
  async function action(path: string, body: unknown, message?: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api(path, "POST", body);
      await load();
      if (message) say(message);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!token && !visit) return null;
  const waiterCalled = visit?.calls.some(
    (call) => call.kind === "WAITER" && call.status === "OPEN",
  );
  const billCalled = visit?.calls.some(
    (call) => call.kind === "BILL" && call.status === "OPEN",
  );
  const hasOrders = visit?.orders.some((order) => order.status !== "CANCELLED");
  const canPrepare =
    visit &&
    hasOrders &&
    !visit.shares.length &&
    !visit.orders.some(
      (order) => order.status !== "CANCELLED" && order.paymentStatus === "PAID",
    );
  return (
    <section className="dine-panel">
      <div className="record-head">
        <h2>
          <Utensils size={23} /> {visit?.tableName || tableName || "За столом"}
        </h2>
        {visit && <span className="badge">Вы за этим столом</span>}
      </div>
      {loading ? (
        <p role="status">Подключаемся к столу…</p>
      ) : !visit ? (
        tableReady ? (
          <>
            <p>
              Меню уже доступно. Чтобы заказывать, вызвать официанта и открыть
              счёт, введите код вашего визита. Регистрация не нужна.
            </p>
            <form
              className="inline-form dine-join"
              onSubmit={(event) => {
                event.preventDefault();
                void action(
                  "/v2/visits/join",
                  { token, code },
                  "Вы подключились к столу.",
                );
              }}
            >
              <label>
                Код визита от официанта
                <input
                  inputMode="numeric"
                  autoComplete="off"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="6 цифр"
                />
              </label>
              <button className="primary" disabled={busy || code.length !== 6}>
                Присоединиться к столу
              </button>
            </form>
            <button className="text-button" onClick={openMenu}>
              Посмотреть меню
            </button>
          </>
        ) : (
          <p>
            Этот QR-код сейчас недоступен. Попросите сотрудника проверить
            карточку стола.
          </p>
        )
      ) : (
        <>
          {visit.reservation && (
            <p>
              Бронь: <strong>{reservationWhen(visit.reservation)}</strong>
            </p>
          )}
          <div className="dine-actions">
            <button
              className="primary"
              disabled={!!visit.shares.length}
              onClick={openMenu}
            >
              <Plus size={20} />{" "}
              {hasOrders ? "Дозаказать блюда" : "Выбрать блюда"}
            </button>
            <button
              className="secondary"
              disabled={busy || waiterCalled}
              onClick={() =>
                void action(
                  `/v2/visits/${visit.id}/call`,
                  { kind: "WAITER" },
                  "Вызов отправлен официанту.",
                )
              }
            >
              <Bell size={20} />{" "}
              {waiterCalled ? "Официант вызван" : "Позвать официанта"}
            </button>
            <button
              className="secondary"
              onClick={() => {
                setBillOpen(true);
                requestAnimationFrame(() =>
                  bill.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  }),
                );
              }}
            >
              <CreditCard size={20} /> Счёт и оплата · {money(visit.total)}
            </button>
          </div>
          {!!visit.shares.length && (
            <p className="form-help">
              Счёт подготовлен. Для дозаказа попросите официанта отменить
              неоплаченное разделение.
            </p>
          )}
          <button
            className="text-button"
            disabled={!!visit.shares.length}
            onClick={openCart}
          >
            Открыть корзину и отправить заказ
          </button>
          <details
            className="visit-bill"
            ref={bill}
            open={billOpen}
            onToggle={(event) => setBillOpen(event.currentTarget.open)}
          >
            <summary>Заказы и общий счёт · {money(visit.total)}</summary>
            {!hasOrders && (
              <p>Заказов за этим столом пока нет. Выберите блюда в меню.</p>
            )}
            {visit.orders.map((order) => (
              <div className="visit-order" key={order.id}>
                <strong>
                  Заказ №{order.number} ·{" "}
                  {order.status === "CANCELLED"
                    ? "Отменён"
                    : order.paymentStatus === "PAID"
                      ? "Оплачен"
                      : "Принят рестораном"}
                </strong>
                {order.items.map((item) => (
                  <p key={item.id}>
                    {item.name} × {item.quantity} · {money(item.lineTotal)}
                  </p>
                ))}
              </div>
            ))}
            {hasOrders && (
              <>
                <p>
                  Блюда: {money(visit.foodTotal)} · Чаевые: {money(visit.tip)} ·
                  Всего: <strong>{money(visit.total)}</strong>
                </p>
                <p>
                  Оплачено {money(visit.paid)} · Осталось{" "}
                  {money(Math.max(0, visit.total - visit.paid))}
                </p>
                <VisitTips visit={visit} onSaved={load} />
                {canPrepare && (
                  <form
                    className="inline-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void action(
                        `/v2/visits/${visit.id}/split`,
                        { count },
                        "Счёт подготовлен.",
                      );
                    }}
                  >
                    <label>
                      Как оплачиваете?
                      <select
                        value={count}
                        onChange={(event) =>
                          setCount(Number(event.target.value))
                        }
                      >
                        {Array.from({ length: 20 }, (_, index) => (
                          <option key={index} value={index + 1}>
                            {index === 0
                              ? "Весь счёт одной оплатой"
                              : `Поровну · ${index + 1} гостей`}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="primary" disabled={busy}>
                      Подготовить счёт к оплате
                    </button>
                    <small>
                      После подготовки счёта новые заказы приостанавливаются.
                    </small>
                  </form>
                )}
                {visit.shares.map((share) => (
                  <div className="record-head visit-share" key={share.id}>
                    <span>
                      {visit.shares.length === 1
                        ? "Весь счёт"
                        : `Часть ${share.position}`}
                    </span>
                    <strong>
                      {money(share.amount)}
                      {!!share.giftPaid && (
                        <small> · сертификатом {money(share.giftPaid)}</small>
                      )}
                    </strong>
                    <span className={share.paid ? "badge" : ""}>
                      {share.paid ? "Оплачено" : "Ожидает оплаты"}
                    </span>
                  </div>
                ))}
                <OnlineBillPayment visit={visit} onChanged={load} />
                <button
                  className="secondary"
                  disabled={busy || billCalled}
                  onClick={() =>
                    void action(
                      `/v2/visits/${visit.id}/call`,
                      { kind: "BILL" },
                      "Просьба принести счёт отправлена.",
                    )
                  }
                >
                  {billCalled ? "Счёт запрошен" : "Попросить счёт у официанта"}
                </button>
              </>
            )}
          </details>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
