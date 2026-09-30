import { useEffect, useState } from "react";
import { calculateTip, noTip, type TipChoice } from "../shared/tips";
import type { Visit } from "../shared/v2";
import { api, money } from "./api";

export function TipSelector({
  base,
  choice,
  onChange,
  disabled = false,
}: {
  base: number;
  choice: TipChoice;
  onChange: (choice: TipChoice) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="tip-selector" disabled={disabled}>
      <legend>Поблагодарить команду</legend>
      <p>
        Чаевые — по желанию. Процент от блюд после скидок и бонусов, без
        доставки.
      </p>
      <div className="tip-options">
        <button
          type="button"
          aria-pressed={choice.kind === "none"}
          onClick={() => onChange(noTip)}
        >
          Без чаевых
        </button>
        {[5, 10, 15, 20].map((percent) => (
          <button
            type="button"
            key={percent}
            aria-pressed={choice.kind === "percent" && choice.value === percent}
            onClick={() => onChange({ kind: "percent", value: percent })}
          >
            <b>{percent}%</b>
            <small>
              {money(calculateTip(base, { kind: "percent", value: percent }))}
            </small>
          </button>
        ))}
        <button
          type="button"
          aria-pressed={choice.kind === "amount"}
          onClick={() => onChange({ kind: "amount", value: 0 })}
        >
          Своя сумма
        </button>
      </div>
      {choice.kind === "amount" && (
        <label>
          Чаевые, ₽
          <input
            type="number"
            min={0}
            max={5000}
            step="0.01"
            inputMode="decimal"
            value={choice.value ? choice.value / 100 : ""}
            placeholder="Например, 100"
            onChange={(e) =>
              onChange({
                kind: "amount",
                value: Math.round(Number(e.target.value) * 100),
              })
            }
          />
        </label>
      )}
      <p className="tip-selected">
        Чаевые: <b>{money(calculateTip(base, choice))}</b>
      </p>
    </fieldset>
  );
}

export function VisitTips({
  visit,
  onSaved,
}: {
  visit: Visit;
  onSaved?: () => Promise<void>;
}) {
  const [current, setCurrent] = useState(visit),
    [choice, setChoice] = useState(visit.tipChoice ?? noTip);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    setCurrent(visit);
  }, [visit]);
  useEffect(() => {
    setChoice(visit.tipChoice ?? noTip);
    setMessage("");
  }, [visit.id, visit.tipVersion]);
  const locked =
    current.shares.length > 0 ||
    current.orders.some(
      (o) => o.status !== "CANCELLED" && o.paymentStatus === "PAID",
    );
  const dirty =
    choice.kind !== current.tipChoice?.kind ||
    choice.value !== current.tipChoice?.value;
  if (locked)
    return (
      <div className="tip-summary">
        <p>
          Чаевые в общем счёте: <b>{money(current.tip)}</b>.
        </p>
        <small>
          После подготовки счёта сумма зафиксирована. До оплаты официант может
          отменить разделение для изменения чаевых.
        </small>
      </div>
    );
  return (
    <div className="visit-tips">
      <TipSelector
        base={current.foodTotal}
        choice={choice}
        onChange={(value) => {
          setChoice(value);
          setMessage("");
        }}
        disabled={busy}
      />
      <p className="form-help">
        Это чаевые для всего стола, один раз к общему счёту. Процент
        пересчитается при добавлении блюд. Оплата официанту вместе со счётом;
        сертификат на чаевые не расходуется.
      </p>
      <button
        type="button"
        className="secondary"
        disabled={busy || !dirty}
        onClick={async () => {
          setBusy(true);
          setError("");
          setMessage("");
          try {
            const v = await api<Visit>(`/v2/visits/${current.id}/tip`, "PUT", {
              choice,
              expectedVersion: current.tipVersion,
            });
            setCurrent(v);
            setChoice(v.tipChoice);
            setMessage("Чаевые сохранены в общем счёте.");
            await onSaved?.();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Сохраняем…" : "Сохранить чаевые к счёту"}
      </button>
      {dirty && (
        <small className="tip-unsaved">Новый вариант ещё не сохранён.</small>
      )}
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="error" role="alert">
          {error}{" "}
          <button
            type="button"
            className="text-button"
            onClick={async () => {
              try {
                const v = await api<Visit>(`/v2/visits/${current.id}`);
                setCurrent(v);
                setChoice(v.tipChoice);
                setError("");
              } catch (e: any) {
                setError(e.message);
              }
            }}
          >
            Обновить счёт
          </button>
        </p>
      )}
    </div>
  );
}
