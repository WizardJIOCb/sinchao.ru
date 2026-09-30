import { useEffect, useRef, useState } from "react";
import { Heart, Map, Gift as GiftIcon, Users, Check } from "lucide-react";
import { api, money } from "./api";
import type { CartItem, Dish, User } from "../shared/types";
import type {
  Discovery,
  EventInfo,
  Floor,
  Gift,
  Preferences,
  ReferralInfo,
  Visit,
} from "../shared/v2";
import { DishPicture } from "./DishPicture";
import { PromoCodeField } from "./PromoCodeField";
import { DishFeatures } from "./DishFeatures";
import {
  DishAchievementCollection,
  GeneralAchievementCollection,
  JourneyAchievementCollection,
} from "./DishAchievements";
import { VisitTips } from "./Tips";
import "./v2.css";

export function FloorPlan({
  floor,
  selected,
  onSelect,
}: {
  floor: Floor;
  selected?: string;
  onSelect?: (id: string) => void;
}) {
  return (
    <div className="floor-wrap">
      {!floor.verified && (
        <p className="form-help">
          Пример схемы зала. Расстановку и номера столов ещё должен подтвердить
          ресторан.
        </p>
      )}
      <div
        className="floor-plan"
        aria-label="Схема зала"
        style={{
          minHeight: Math.max(340, Math.ceil(floor.tables.length / 3) * 90),
        }}
      >
        <span className="floor-window">Окна</span>
        <span className="floor-entry">Вход</span>
        {floor.tables.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`floor-table ${t.shape} ${selected === t.id ? "selected" : ""}`}
            style={{
              left: t.x + "%",
              top: t.y + "%",
              width: `min(${t.shape === "long" ? "28%, 150px" : "20%, 94px"}, ${100 - t.x}%)`,
            }}
            aria-pressed={selected === t.id}
            disabled={t.available === false || !onSelect}
            onClick={() => onSelect?.(t.id)}
            aria-label={`${t.name}, ${t.seats} мест, ${t.available === false ? "занят или мал для компании" : "доступен"}`}
          >
            <b>{t.name}</b>
            <small>{t.seats} мест</small>
            {t.available === false && <small>Недоступен</small>}
          </button>
        ))}
      </div>
      <div className="floor-list">
        {floor.tables.map((t) => (
          <span key={t.id}>
            {t.name} · {t.zone} · {t.seats} мест
          </span>
        ))}
      </div>
    </div>
  );
}
export function TablePicker({
  date,
  time,
  guests,
  value,
  onChange,
}: {
  date: string;
  time: string;
  guests: number;
  value: string;
  onChange: (id: string) => void;
}) {
  const [floor, setFloor] = useState<Floor | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let valid = true;
    setFloor(null);
    setError("");
    onChange("");
    if (time)
      api<Floor>(`/v2/floor?date=${date}&time=${time}&partySize=${guests}`)
        .then((v) => {
          if (valid) setFloor(v);
        })
        .catch((e) => {
          if (valid) setError(e.message);
        });
    return () => {
      valid = false;
    };
  }, [date, time, guests]);
  if (!time) return null;
  return (
    <section className="table-picker">
      <h3>Выберите стол</h3>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {floor ? (
        floor.tables.length ? (
          <>
            <FloorPlan floor={floor} selected={value} onSelect={onChange} />
            {!value && (
              <small>Выберите стол или оставьте подбор ресторану.</small>
            )}
            {!floor.tables.some((t) => t.available) && (
              <p className="error">
                Подходящих столов нет. Выберите другое время.
              </p>
            )}
          </>
        ) : (
          <p>Стол подберёт ресторан. Схема пока не опубликована.</p>
        )
      ) : (
        <p>Проверяем столы…</p>
      )}
    </section>
  );
}
export function FavoriteButton({ dishId }: { dishId: string }) {
  const [prefs, setPrefs] = useState<Preferences | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Discovery>("/v2/discovery")
      .then((d) => setPrefs(d.preferences))
      .catch(() => {});
  }, [dishId]);
  const favorite = prefs?.favorites.includes(dishId);
  return (
    <div className="favorite-control">
      <button
        type="button"
        disabled={!prefs || busy}
        aria-pressed={!!favorite}
        onClick={async () => {
          if (!prefs) return;
          setBusy(true);
          setError("");
          try {
            const next = {
              ...prefs,
              favorites: favorite
                ? prefs.favorites.filter((id) => id !== dishId)
                : [...prefs.favorites, dishId],
            };
            await api("/v2/preferences", "PUT", next);
            setPrefs(next);
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Heart size={16} fill={favorite ? "currentColor" : "none"} />
        {favorite ? "В избранном" : "В избранное"}
      </button>
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
export { DinePanel } from "./DinePanel";
export function DineCart({
  userId,
  visit,
  cart,
  menu,
  edit,
  refresh,
  done,
}: {
  userId?: string;
  visit: Visit;
  cart: CartItem[];
  menu: Dish[];
  edit: (i: CartItem) => void;
  refresh: () => Promise<void>;
  done: () => void;
}) {
  const [quote, setQuote] = useState<{
      total: number;
      discount: number;
    } | null>(null),
    [promo, setPromo] = useState(""),
    [promoAttempt, setPromoAttempt] = useState(0),
    [quoteLoading, setQuoteLoading] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());
  useEffect(() => {
    let active = true;
    setQuote(null);
    setError("");
    key.current = crypto.randomUUID();
    setQuoteLoading(!!cart.length);
    if (cart.length)
      api<{ total: number; discount: number }>("/cart/quote", "POST", {
        fulfillment: "PICKUP",
        zoneId: "",
        promo,
        points: 0,
      })
        .then((q) => {
          if (active) setQuote(q);
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setQuoteLoading(false);
        });
    return () => {
      active = false;
    };
  }, [cart, promo, promoAttempt]);
  return (
    <div className="standard-form">
      <h3>{visit.tableName} · заказ за столом</h3>
      {cart.length ? (
        cart.map((i) => (
          <div className="record-head" key={i.id}>
            <span>
              {menu.find((d) => d.id === i.dishId)?.name} × {i.quantity}
            </span>
            <button className="text-button" onClick={() => edit(i)}>
              Изменить
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={async () => {
                try {
                  await api("/cart/items/" + i.id, "DELETE", {});
                  await refresh();
                } catch (e: any) {
                  setError(e.message);
                }
              }}
            >
              Убрать
            </button>
          </div>
        ))
      ) : (
        <p>Выберите блюда в меню.</p>
      )}
      <PromoCodeField
        userId={userId}
        code={promo}
        pending={quoteLoading}
        disabled={busy || !cart.length}
        valid={!!quote}
        discount={quote?.discount ?? 0}
        error={!quote ? error : ""}
        onApply={(code) => {
          setQuote(null);
          setQuoteLoading(true);
          setError("");
          setPromo(code);
          setPromoAttempt((n) => n + 1);
          key.current = crypto.randomUUID();
        }}
      />
      {!!visit.shares.length && (
        <p className="form-help">
          Счёт уже разделён. Попросите официанта отменить разделение, чтобы
          добавить блюда.
        </p>
      )}
      {error && (!promo || quote) && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        className="primary"
        disabled={busy || !quote || !!visit.shares.length}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await api(
              `/v2/visits/${visit.id}/orders`,
              "POST",
              { promo },
              key.current,
            );
            await refresh();
            done();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy
          ? "Передаём заказ…"
          : `Заказать за столом${quote ? " · " + money(quote.total) : ""}`}
      </button>
      <small className="dine-payment-note">
        Оплата по общему или разделённому счёту — в разделе «Счёт и оплата».
      </small>
      <VisitTips visit={visit} />
    </div>
  );
}

export function DiscoveryHub({
  user,
  login,
  say,
}: {
  user: User | null;
  login: () => void;
  say: (s: string) => void;
}) {
  const [data, setData] = useState<Discovery | null>(null),
    [events, setEvents] = useState<EventInfo[]>([]),
    [gifts, setGifts] = useState<Gift[]>([]),
    [referral, setReferral] = useState<ReferralInfo | null>(null),
    [tab, setTab] = useState(() =>
      new URLSearchParams(location.search).has("ref") ? "referrals" : "journey",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const giftKey = useRef(crypto.randomUUID());
  async function load() {
    const [d, e, g, r] = await Promise.all([
      api<Discovery>("/v2/discovery"),
      api<EventInfo[]>("/v2/events"),
      user ? api<Gift[]>("/v2/gifts") : Promise.resolve([]),
      user ? api<ReferralInfo>("/v2/referrals") : Promise.resolve(null),
    ]);
    setData(d);
    setEvents(e);
    setGifts(g);
    setReferral(r);
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [user?.id]);
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
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <section className="page-section">
        <h1>Открываем Вьетнам</h1>
        <p>{error || "Собираем ваши открытия…"}</p>
      </section>
    );
  const prefs = data.preferences;
  return (
    <section className="page-section discovery-page">
      <div className="eyebrow">СИН ЧАО · НОВЫЕ ВПЕЧАТЛЕНИЯ</div>
      <h1>Вьетнам ближе, чем кажется</h1>
      <p>
        Находите любимые вкусы, собирайте свой маршрут и встречайтесь за нашим
        столом.
      </p>
      <div className="categories">
        {[
          ["journey", "Food Journey"],
          ["favorites", "Для вас"],
          ["events", "События"],
          ["gifts", "Сертификаты"],
          ["referrals", "Пригласить друзей"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "selected" : ""}
            onClick={() => {
              setTab(id);
              setError("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {!user && (
        <div className="v2-signin">
          <p>
            Войдите, чтобы сохранять избранное, достижения и записи на события.
          </p>
          <button className="secondary" onClick={login}>
            Войти
          </button>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {tab === "journey" && (
        <>
          <div className="v2-heading">
            <Map />
            <div>
              <h2>Vietnam Food Journey</h2>
              <p>
                Прогресс появляется после оплаты и завершения заказа рестораном.
              </p>
            </div>
          </div>
          <JourneyAchievementCollection entries={data.achievements} />
          <GeneralAchievementCollection entries={data.generalAchievements} />
          <DishAchievementCollection entries={data.dishAchievements} />
          {data.journey.map((j) => (
            <article className="record journey-route" key={j.region}>
              <div className="record-head">
                <h2>{j.region}</h2>
                <span>
                  {j.tried} / {j.dishes.length}
                </span>
              </div>
              <progress
                aria-label="Прогресс путешествия"
                value={j.tried}
                max={j.dishes.length}
              />
              <div className="journey-stops">
                {j.dishes.map((d) => (
                  <a
                    href={"/menu/" + encodeURIComponent(d.id)}
                    key={d.id}
                    className={d.tried ? "tried" : ""}
                  >
                    {d.tried ? "✓" : "○"} {d.name}
                  </a>
                ))}
              </div>
            </article>
          ))}
        </>
      )}
      {tab === "favorites" && (
        <>
          <h2>Вам может понравиться</h2>
          <p>
            Подборка учитывает избранное, завершённые заказы и ваши
            предпочтения.
          </p>
          <div className="recommendation-grid">
            {data.recommendations.map(({ dish, reason }) => (
              <a
                className="recommendation"
                href={"/menu/" + dish.id}
                key={dish.id}
              >
                <DishPicture dish={dish} />
                <div>
                  <small>{reason}</small>
                  <h3>{dish.name}</h3>
                  <DishFeatures dish={dish} />
                  <b>от {money(dish.price)}</b>
                </div>
              </a>
            ))}
          </div>
          {!data.recommendations.length && (
            <p>
              Нет блюд с достаточными данными для этих предпочтений. Уточните
              состав у ресторана.
            </p>
          )}
          {user && (
            <form
              className="record standard-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void mutate("/v2/preferences", "PUT", {
                  ...prefs,
                  maxSpice: Number(f.get("spice")),
                  avoidAllergens: String(f.get("allergens"))
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                });
              }}
            >
              <h3>Ваши предпочтения</h3>
              <label>
                Острота
                <select name="spice" defaultValue={prefs.maxSpice}>
                  <option value={0}>Без острого</option>
                  <option value={1}>Немного острого</option>
                  <option value={2}>Средняя острота</option>
                  <option value={3}>Любая</option>
                </select>
              </label>
              <label>
                Исключить аллергены (через запятую)
                <input
                  name="allergens"
                  defaultValue={prefs.avoidAllergens.join(", ")}
                  placeholder="Например: арахис, молоко"
                />
              </label>
              <small>
                Подборка использует сведения ресторана. При аллергии обязательно
                уточните состав и возможность перекрёстного контакта у
                сотрудника; блюда без заполненных аллергенов исключаются из
                такой подборки.
              </small>
              <button className="primary" disabled={busy}>
                Сохранить предпочтения
              </button>
            </form>
          )}
          <h2>Избранное</h2>
          <div className="journey-stops">
            {prefs.favorites.map((id) => (
              <a key={id} href={"/menu/" + id}>
                Открыть{" "}
                {data.journey.flatMap((j) => j.dishes).find((d) => d.id === id)
                  ?.name ?? id}
              </a>
            ))}
          </div>
          {!prefs.favorites.length && (
            <p>Нажмите «В избранное» в карточке блюда.</p>
          )}
        </>
      )}
      {tab === "events" && (
        <>
          <h2>Поводы встретиться</h2>
          {!events.length && (
            <div className="empty">
              <h3>Новые встречи впереди</h3>
              <p>Здесь появятся события, опубликованные рестораном.</p>
            </div>
          )}
          {events.map((e) => (
            <article className="record" key={e.id}>
              <div className="eyebrow">
                {new Date(e.starts_at).toLocaleString("ru-RU", {
                  timeZone: "Asia/Yekaterinburg",
                })}{" "}
                · время ресторана
              </div>
              <h2>{e.title}</h2>
              <p>{e.description}</p>
              <p>
                {e.active
                  ? `Свободно ${Math.max(0, e.capacity - e.reserved)} из ${e.capacity} мест`
                  : "Событие отменено или запись закрыта"}
              </p>
              {!!e.myGuests && (
                <p className="badge">Вы записаны · {e.myGuests} гостей</p>
              )}
              {user && e.active && new Date(e.starts_at) > new Date() && (
                <form
                  className="inline-form"
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    void mutate(`/v2/events/${e.id}/signup`, "PUT", {
                      guests: Number(
                        new FormData(ev.currentTarget).get("guests"),
                      ),
                    });
                  }}
                >
                  <label>
                    Гостей
                    <input
                      name="guests"
                      type="number"
                      min={1}
                      max={10}
                      defaultValue={e.myGuests || 1}
                      required
                    />
                  </label>
                  <button className="primary" disabled={busy}>
                    {e.myGuests ? "Изменить запись" : "Записаться"}
                  </button>
                </form>
              )}
              {!!e.myGuests && (
                <button
                  className="text-button danger"
                  disabled={busy}
                  onClick={() =>
                    void mutate(`/v2/events/${e.id}/signup`, "DELETE", {})
                  }
                >
                  Отменить запись
                </button>
              )}
              {!user && (
                <button className="secondary" onClick={login}>
                  Войти и записаться
                </button>
              )}
            </article>
          ))}
        </>
      )}
      {tab === "gifts" && (
        <>
          <div className="v2-heading">
            <GiftIcon />
            <div>
              <h2>Подарите встречу за столом</h2>
              <p>
                Оставьте заявку на сертификат и оплатите его в ресторане. Код
                появится после подтверждения оплаты сотрудником.
              </p>
            </div>
          </div>
          {user && (
            <form
              className="record standard-form"
              onChange={() => {
                giftKey.current = crypto.randomUUID();
              }}
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                if (
                  await mutate(
                    "/v2/gifts",
                    "POST",
                    {
                      amount: Math.round(Number(f.get("amount")) * 100),
                      message: f.get("message"),
                    },
                    giftKey.current,
                  )
                ) {
                  giftKey.current = crypto.randomUUID();
                  say("Заявка на сертификат сохранена. Оплата — в ресторане.");
                }
              }}
            >
              <label>
                Номинал, ₽
                <input
                  name="amount"
                  type="number"
                  min={100}
                  max={100000}
                  step={100}
                  defaultValue={1000}
                  required
                />
              </label>
              <label>
                Пожелание получателю
                <textarea
                  name="message"
                  maxLength={300}
                  placeholder="Для вашего маленького путешествия во Вьетнам"
                />
              </label>
              <button className="primary" disabled={busy}>
                Оставить заявку
              </button>
            </form>
          )}
          {gifts.map((g) => (
            <article className="record gift-card" key={g.id}>
              <small>СИН ЧАО · ПОДАРОЧНЫЙ СЕРТИФИКАТ</small>
              <h2>{money(g.amount)}</h2>
              <p>{g.message}</p>
              <b>
                {g.status === "ACTIVE"
                  ? "Доступно " + money(g.balance)
                  : g.status === "PENDING"
                    ? "Ожидает оплаты в ресторане"
                    : "Отменён"}
              </b>
              {g.code && (
                <>
                  <p>
                    Покажите код сотруднику для оплаты заказа или счёта за
                    столом:
                  </p>
                  <code className="gift-code">{g.code}</code>
                  <p>
                    Действует до{" "}
                    {new Date(g.expires_at!).toLocaleDateString("ru-RU")}
                  </p>
                </>
              )}
            </article>
          ))}
        </>
      )}
      {tab === "referrals" && (
        <>
          <div className="v2-heading">
            <Users />
            <div>
              <h2>Вместе вкуснее</h2>
              <p>Пригласите друга познакомиться с «Син Чао».</p>
            </div>
          </div>
          {referral && (
            <div className="record standard-form">
              <p>
                {referral.enabled
                  ? `Вам обоим по ${referral.points} бонусов после первого оплаченного и завершённого заказа друга.`
                  : "Программа приглашений временно приостановлена."}
              </p>
              <label>
                Ваш код
                <input
                  readOnly
                  value={referral.code}
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <label>
                Ссылка для друга
                <input
                  readOnly
                  value={location.origin + "/discover?ref=" + referral.code}
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <p>
                Приглашено: {referral.invited} · Получили бонус:{" "}
                {referral.rewarded}
              </p>
              {!referral.applied && referral.enabled ? (
                <form
                  className="inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void mutate("/v2/referrals/apply", "POST", {
                      code: new FormData(e.currentTarget).get("code"),
                    });
                  }}
                >
                  <label>
                    Код пригласившего друга
                    <input
                      name="code"
                      defaultValue={
                        new URLSearchParams(location.search).get("ref") ?? ""
                      }
                      required
                      maxLength={12}
                    />
                  </label>
                  <button className="primary" disabled={busy}>
                    Применить до первого заказа
                  </button>
                </form>
              ) : (
                referral.applied && <p>Код приглашения применён.</p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
