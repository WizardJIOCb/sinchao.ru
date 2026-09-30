import { useEffect, useState } from "react";
import type { GrantedPromotion } from "../shared/marketing";
import { api, money } from "./api";

export function MyPromotions({
  onChoose,
  disabled = false,
  userId,
}: {
  onChoose?: (code: string) => void;
  disabled?: boolean;
  userId?: string;
}) {
  const [items, setItems] = useState<GrantedPromotion[]>([]);
  const [message, setMessage] = useState("");
  const [copyLink, setCopyLink] = useState("");
  useEffect(() => {
    let active = true;
    setItems([]);
    setMessage("");
    setCopyLink("");
    api<GrantedPromotion[]>("/me/promotions")
      .then((p) => {
        if (active) setItems(p);
      })
      .catch(() => {
        if (active)
          setMessage("Не удалось загрузить ваши промокоды. Обновите страницу.");
      });
    return () => {
      active = false;
    };
  }, [userId]);
  const visible = onChoose ? items.filter((p) => p.available) : items;
  if (!visible.length && !message) return null;
  return (
    <section className="my-promotions" aria-label="Мои промокоды">
      <h3>{onChoose ? "Ваш подарок" : "Мои промокоды"}</h3>
      {visible.map((p) => (
        <div className="my-promo" key={p.code}>
          <strong>{p.title}</strong>
          <p>
            <b>{p.code}</b> · Скидка{" "}
            {p.kind === "fixed" ? money(p.amount ?? 0) : `${p.percent}%`}
          </p>
          <p className="form-help">
            {p.usedByUser
              ? "Уже использован"
              : !p.available
                ? "Сейчас недоступен"
                : `На один заказ.${p.minSubtotal ? ` От ${money(p.minSubtotal)}.` : ""} На блюда; без доставки и чаевых.`}
          </p>
          {p.available && (
            <button
              type="button"
              className="secondary"
              disabled={disabled}
              onClick={async () => {
                if (onChoose) {
                  onChoose(p.code);
                  return;
                }
                try {
                  await navigator.clipboard.writeText(p.code);
                  setMessage("Промокод скопирован");
                  setCopyLink("");
                } catch {
                  setCopyLink(p.code);
                  setMessage("Скопируйте промокод из поля");
                }
              }}
            >
              {onChoose ? "Применить подарок" : "Скопировать промокод"}
            </button>
          )}
        </div>
      ))}
      <p role="status">{message}</p>
      {copyLink && (
        <input
          readOnly
          aria-label="Ваш промокод"
          value={copyLink}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
    </section>
  );
}
