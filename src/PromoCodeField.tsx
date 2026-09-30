import { useId, useState } from "react";
import { Check, Tag } from "lucide-react";
import { money } from "./api";
import "./promo-code.css";
import { MyPromotions } from "./MyPromotions";

export function PromoCodeField({
  code,
  pending,
  disabled,
  valid,
  discount,
  error,
  onApply,
  userId,
}: {
  code: string;
  pending: boolean;
  disabled: boolean;
  valid: boolean;
  discount: number;
  error: string;
  onApply: (code: string) => void;
  userId?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState(code);
  const candidate = draft.trim().toUpperCase();
  const canApply = !!candidate && !disabled && !pending;
  function apply() {
    if (canApply) onApply(candidate);
  }
  return (
    <div className="promo-code">
      <MyPromotions
        userId={userId}
        disabled={disabled || pending}
        onChoose={(value) => {
          setDraft(value);
          onApply(value);
        }}
      />
      <label htmlFor={id}>Промокод</label>
      <div className="promo-code-controls">
        <input
          id={id}
          value={draft}
          maxLength={30}
          disabled={disabled}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-describedby={id + "-status"}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              apply();
            }
          }}
          placeholder="Например, PHO123"
        />
        <button
          type="button"
          className="secondary promo-code-apply"
          disabled={!canApply}
          onClick={apply}
        >
          <Tag size={16} aria-hidden="true" />{" "}
          {pending && code ? "Проверяем…" : "Применить"}
        </button>
      </div>
      <div id={id + "-status"} aria-live="polite">
        {code && valid && !pending && (
          <p className="promo-code-success">
            <Check size={16} aria-hidden="true" />
            <span>
              Промокод {code} применён
              {discount > 0 ? `. Скидка −${money(discount)}` : ""}.
            </span>
          </p>
        )}
        {code && error && !pending && <p className="error">{error}</p>}
        {candidate && candidate !== code && (
          <p className="form-help">
            Нажмите «Применить», чтобы проверить промокод.
          </p>
        )}
      </div>
      {code && (
        <button
          type="button"
          className="text-button promo-code-remove"
          disabled={disabled || pending}
          onClick={() => {
            setDraft("");
            onApply("");
          }}
        >
          Убрать промокод
        </button>
      )}
    </div>
  );
}
