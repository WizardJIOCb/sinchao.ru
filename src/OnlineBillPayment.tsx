import { useEffect, useState } from "react";
import { CreditCard, RefreshCw } from "lucide-react";
import { api, money } from "./api";
import type { Visit } from "../shared/v2";
import {
  activeOnlinePayment,
  type OnlinePaymentView as Payment,
  type OnlinePaymentConfig as PaymentConfig,
} from "../shared/online-payments";
const pending = (payment: Payment) => activeOnlinePayment(payment.status);

export function OnlineBillPayment({
  visit,
  onChanged,
}: {
  visit: Visit;
  onChanged: () => Promise<void>;
}) {
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<PaymentConfig>("/payments/config")
      .then((value) => active && setConfig(value))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!config?.available || !visit.shares.length) return;
    let active = true;
    let polling = false;
    async function update() {
      if (polling || document.visibilityState !== "visible") return;
      polling = true;
      try {
        let values = await api<Payment[]>(
          `/payments/visits/${visit.id}/payments`,
        );
        const outstanding = values.filter(pending);
        if (outstanding.length) {
          await Promise.all(
            outstanding.map((p) =>
              api(
                `/payments/visits/${visit.id}/payments/${p.id}/sync`,
                "POST",
                {},
              ),
            ),
          );
          values = await api<Payment[]>(
            `/payments/visits/${visit.id}/payments`,
          );
          if (active) await onChanged();
        }
        if (active) {
          setPayments(values);
          setError("");
        }
      } catch (e: any) {
        if (active) setError(e.message);
      } finally {
        polling = false;
      }
    }
    void update();
    const timer = setInterval(() => {
      void update();
    }, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [config?.available, visit.id, visit.shares.length]);

  async function pay(shareId: string, method: "bank_card" | "sbp") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const payment = await api<Payment>(
        `/payments/visits/${visit.id}/shares/${shareId}`,
        "POST",
        { method },
      );
      if (payment.status === "SUCCEEDED") {
        await onChanged();
      } else if (payment.status === "CANCELED") {
        setPayments((old) => [
          payment,
          ...old.filter((p) => p.id !== payment.id),
        ]);
        setError("Платёж отменён. Можно попробовать оплатить ещё раз.");
      } else if (payment.status === "WAITING_FOR_CAPTURE") {
        setPayments((old) => [
          payment,
          ...old.filter((p) => p.id !== payment.id),
        ]);
        setError(
          "ЮKassa проверяет подтверждение платежа. Проверьте статус или обратитесь к официанту.",
        );
      } else if (payment.confirmationUrl) {
        window.location.assign(payment.confirmationUrl);
      } else {
        setPayments((old) => [
          payment,
          ...old.filter((p) => p.id !== payment.id),
        ]);
        setError(
          "Платёж готовится. Попробуйте продолжить оплату через несколько секунд.",
        );
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="online-bill-payment" aria-label="Онлайн-оплата счёта">
      <h3>
        <CreditCard size={20} /> Оплата картой или СБП
      </h3>
      {!config ? (
        <p>Проверяем способы оплаты…</p>
      ) : !config.available ? (
        <p>
          {config.message ||
            "Онлайн-оплата скоро появится. Пока оплатите счёт официанту."}
        </p>
      ) : !visit.shares.length ? (
        <p>
          Подготовьте общий счёт или разделите его на части, затем выберите
          способ оплаты.
        </p>
      ) : visit.shares.every((share) => share.paid) ? (
        <p className="payment-success">Счёт полностью оплачен. Спасибо!</p>
      ) : (
        <>
          <p>
            Оплата откроется на защищённой странице ЮKassa. Статус обновится
            после проверки платежа.
          </p>
          {visit.shares
            .filter((share) => !share.paid)
            .map((share) => {
              const active = payments.find(
                (p) => p.shareId === share.id && pending(p),
              );
              return (
                <div className="online-share" key={share.id}>
                  <strong>
                    {visit.shares.length === 1
                      ? "Весь счёт"
                      : `Часть ${share.position}`}{" "}
                    · {money(share.amount - share.giftPaid)}
                  </strong>
                  {active ? (
                    <>
                      <p>
                        Ожидаем оплату{" "}
                        {active.method === "sbp" ? "через СБП" : "картой"}.
                        Другие гости видят этот же статус.
                      </p>
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() => void pay(share.id, active.method)}
                      >
                        {active.status === "WAITING_FOR_CAPTURE"
                          ? "Проверить подтверждение"
                          : "Продолжить оплату"}
                      </button>
                    </>
                  ) : (
                    <div className="button-row">
                      {config.methods.includes("bank_card") && (
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() => void pay(share.id, "bank_card")}
                        >
                          Оплатить картой
                        </button>
                      )}
                      {config.methods.includes("sbp") && (
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() => void pay(share.id, "sbp")}
                        >
                          Оплатить через СБП
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!!payments.length && (
        <button
          className="text-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await Promise.all(
                payments
                  .filter(pending)
                  .map((p) =>
                    api(
                      `/payments/visits/${visit.id}/payments/${p.id}/sync`,
                      "POST",
                      {},
                    ),
                  ),
              );
              setPayments(
                await api<Payment[]>(`/payments/visits/${visit.id}/payments`),
              );
              await onChanged();
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <RefreshCw size={16} /> Проверить оплату
        </button>
      )}
    </section>
  );
}
