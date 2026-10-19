import { AdminV2 } from "./AdminV2";
import { AdminMarketing } from "./AdminMarketing";
import { AdminUsers } from "./AdminUsers";
import { OperatorPanel } from "./OperatorPanel";
import { OrderTiming } from "../OrderTiming";
import { Modal } from "../Modal";
import { DishEditor, CategoriesEditor } from "./MenuEditor";
import { useEffect, useState } from "react";
import { api, money } from "../api";
import {
  reservationWhen,
  restaurantClock,
} from "../../shared/reservation-time";
import {
  orderLabels,
  type Category,
  type Config,
  type Dish,
  type Order,
  type Reservation,
  type User,
} from "../../shared/types";
type Dashboard = {
  orders: Order[];
  reservations: Reservation[];
  audit: {
    id: string;
    action: string;
    entity_id: string;
    created_at: string;
  }[];
  tables: { token: string; name: string }[];
};
export function Admin({
  user,
  menu,
  login,
  refresh,
  say,
}: {
  user: User | null;
  menu: { config: Config; dishes: Dish[]; categories: Category[] };
  login: () => void;
  refresh: () => Promise<void>;
  say: (s: string) => void;
}) {
  const [tab, setTab] = useState("operator"),
    [data, setData] = useState<Dashboard | null>(null),
    [editing, setEditing] = useState<string | null>(null),
    [menuSearch, setMenuSearch] = useState(""),
    [menuCategory, setMenuCategory] = useState(""),
    [editorError, setEditorError] = useState(""),
    [busy, setBusy] = useState(false);
  const manager = user && ["ADMIN", "MANAGER"].includes(user.role);
  const searchTerms = menuSearch
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const visibleDishes = menu.dishes.filter((d) => {
    const haystack = [
      d.name,
      d.localizedName,
      d.description,
      ...d.ingredients,
      menu.categories.find((c) => c.id === d.categoryId)?.name ?? "",
    ]
      .join(" ")
      .toLocaleLowerCase("ru")
      .replaceAll("ё", "е");
    return (
      (!menuCategory || d.categoryId === menuCategory) &&
      searchTerms.every((term) => haystack.includes(term))
    );
  });
  useEffect(() => setEditorError(""), [editing]);
  async function load() {
    try {
      setData(await api<Dashboard>("/admin/dashboard"));
    } catch (e: any) {
      say(e.message);
    }
  }
  useEffect(() => {
    if (user && user.role !== "CUSTOMER") {
      void load();
      const t = setInterval(load, 15000);
      return () => clearInterval(t);
    }
  }, [user?.id]);
  async function mutate(path: string, method: string, body: unknown) {
    if (busy) return;
    setBusy(true);
    try {
      await api("/admin" + path, method, body);
      await load();
      await refresh();
      say("Изменения сохранены.");
      return true;
    } catch (e: any) {
      say(e.message);
      if (tab === "menu" && editing) setEditorError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (!user || user.role === "CUSTOMER")
    return (
      <section className="page-section">
        <h1>Панель ресторана</h1>
        <div className="empty">
          <h2>Вход для сотрудников</h2>
          <p>
            Зарегистрируйтесь на сайте. Администратор назначит вам роль в
            разделе «Пользователи и права».
          </p>
          <button className="primary" onClick={login}>
            Войти
          </button>
        </div>
      </section>
    );
  return (
    <section className="page-section admin-page">
      <div className="eyebrow">СИН ЧАО · РЕСТОРАН</div>
      <h1>Всё под рукой</h1>
      <div className="categories admin-tabs">
        {[
          ["operator", "Панель оператора"],
          ["orders", "Заказы"],
          ["reservations", "Брони"],
          ["menu", "Меню"],
          ["settings", "Настройки"],
          ["v2", "V2 · Зал и гости"],
          ...(manager ? [["marketing", "Промокоды и ачивки"]] : []),
          ...(user.role === "ADMIN" ? [["users", "Пользователи и права"]] : []),
          ["audit", "Журнал"],
        ].map(([id, name]) => (
          <button
            key={id}
            className={tab === id ? "selected" : ""}
            onClick={() => {
              setTab(id);
              setEditing(null);
            }}
          >
            {name}
          </button>
        ))}
      </div>
      {!data ? (
        <p>Загружаем…</p>
      ) : (
        <>
          {tab === "operator" && <OperatorPanel go={setTab} />}
          {tab === "users" && user.role === "ADMIN" && <AdminUsers me={user} />}
          {tab === "v2" && <AdminV2 user={user} say={say} refresh={refresh} />}
          {tab === "marketing" && manager && (
            <AdminMarketing menu={menu.dishes} />
          )}
          {tab === "orders" && (
            <div className="records">
              <p>{restaurantClock(menu.config.timezone, new Date().toISOString().slice(0, 10))}</p>
              {data.orders.length === 0 && <p>Заказов пока нет.</p>}
              {data.orders.map((o) => {
                const next: Record<string, string[]> = {
                  CREATED: ["CONFIRMED", "CANCELLED"],
                  CONFIRMED: ["PREPARING", "CANCELLED"],
                  PREPARING: ["READY"],
                  READY:
                    o.fulfillment === "DELIVERY"
                      ? ["OUT_FOR_DELIVERY"]
                      : ["COMPLETED"],
                  OUT_FOR_DELIVERY: ["DELIVERED"],
                  DELIVERED: ["COMPLETED"],
                };
                return (
                  <article className="record" key={o.id}>
                    <div className="record-head">
                      <h3>
                        №{o.number} · {o.contact.name}
                      </h3>
                      <span className="badge">{orderLabels[o.status]}</span>
                    </div>
                    <p>
                      {o.fulfillment === "DELIVERY"
                        ? "Доставка"
                        : o.fulfillment === "DINE_IN"
                          ? o.tableName || "За столом"
                          : "Самовывоз"}{" "}
                      ·{" "}
                      <a href={"tel:" + o.contact.phone}>{o.contact.phone}</a>
                    </p>
                    <OrderTiming order={o} timezone={menu.config.timezone} />
                    <p>{o.contact.address}</p>
                    <small>ID заказа: {o.id}</small>
                    {!!o.giftPaid && (
                      <p>
                        Сертификатом: {money(o.giftPaid)} · осталось{" "}
                        {money(o.total - o.giftPaid)}
                      </p>
                    )}
                    {o.items.map((i) => (
                      <p key={i.id}>
                        {i.name} × {i.quantity} {i.modifierNames.join(", ")}{" "}
                        {i.notes && " — " + i.notes}
                      </p>
                    ))}
                    {o.contact.notes && (
                      <p>
                        <b>Комментарий:</b> {o.contact.notes}
                      </p>
                    )}
                    <div className="record-head">
                      <b>{money(o.total)}</b>
                      {!!o.tip && (
                        <small>В том числе чаевые: {money(o.tip)}</small>
                      )}
                      <span>
                        {o.paymentStatus === "PAID"
                          ? "Оплачено"
                          : "Оплата при получении"}
                      </span>
                    </div>
                    <div className="button-row">
                      {(next[o.status] ?? []).map((s) => (
                        <button
                          disabled={busy}
                          className="secondary"
                          key={s}
                          onClick={() =>
                            mutate("/orders/" + o.id + "/status", "PATCH", {
                              status: s,
                            })
                          }
                        >
                          {orderLabels[s]}
                        </button>
                      ))}
                      {o.paymentStatus !== "PAID" &&
                        o.status !== "CANCELLED" &&
                        !o.visitId && (
                          <button
                            disabled={busy}
                            className="primary"
                            onClick={() => {
                              setEditing("payment:" + o.id);
                            }}
                          >
                            Подтвердить оплату
                          </button>
                        )}
                    </div>
                    {editing === "payment:" + o.id && (
                      <div className="confirm-box">
                        <p>
                          Подтвердить фактическое получение{" "}
                          {money(o.total - (o.giftPaid ?? 0))} по заказу №
                          {o.number}?
                        </p>
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() => {
                            void mutate(
                              "/orders/" + o.id + "/payment",
                              "POST",
                              {},
                            );
                            setEditing(null);
                          }}
                        >
                          Да, оплата получена
                        </button>
                        <button
                          className="text-button"
                          onClick={() => setEditing(null)}
                        >
                          Назад
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
          {tab === "reservations" && (
            <div className="records">
              {!data.reservations.length && <p>Бронирований пока нет.</p>}
              {data.reservations.map((r) => (
                <article key={r.id} className="record">
                  <div className="record-head">
                    <h3>
                      {reservationWhen(r)} · {r.partySize} гостей
                    </h3>
                    <span className="badge">
                      {
                        (
                          {
                            CONFIRMED: "Подтверждено",
                            SEATED: "За столом",
                            COMPLETED: "Завершено",
                            CANCELLED: "Отменено",
                            NO_SHOW: "Не пришли",
                          } as Record<string, string>
                        )[r.status]
                      }
                    </span>
                  </div>
                  <p>
                    {r.name} · <a href={"tel:" + r.phone}>{r.phone}</a>
                  </p>
                  <p>
                    {r.tableName || r.seating} · {r.notes}
                  </p>
                  <p className="muted">{restaurantClock(r.timezone, r.date)}</p>
                  {r.preorder && (
                    <p>
                      Предзаказ:{" "}
                      {r.preorder.items
                        .map((i) => `${i.name} × ${i.quantity}`)
                        .join(", ")}{" "}
                      · {money(r.preorder.total)}
                    </p>
                  )}
                  {r.tableId && r.status === "CONFIRMED" && (
                    <p>
                      Для посадки откройте посещение с этой бронью во вкладке
                      «V2 · Зал и гости».
                    </p>
                  )}
                  <div className="button-row">
                    {(r.status === "CONFIRMED"
                      ? [
                          ...(!r.tableId ? [["SEATED", "Гости пришли"]] : []),
                          ["CANCELLED", "Отменить"],
                          ["NO_SHOW", "Не пришли"],
                        ]
                      : r.status === "SEATED"
                        ? [["COMPLETED", "Завершить"]]
                        : []
                    ).map(([status, label]) => (
                      <button
                        disabled={busy}
                        key={status}
                        className="secondary"
                        onClick={() =>
                          mutate("/reservations/" + r.id, "PATCH", { status })
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
          {tab === "menu" && (
            <>
              <p className="muted">
                Цены указаны в рублях. Изменения сохраняются в журнале.
              </p>
              {manager && (
                <div className="button-row">
                  <button className="primary" onClick={() => setEditing("new")}>
                    Добавить блюдо
                  </button>
                  <button
                    className="secondary"
                    onClick={() => setEditing("categories")}
                  >
                    Категории
                  </button>
                </div>
              )}
              <div className="menu-toolbar">
                <label>
                  Поиск по меню
                  <input
                    type="search"
                    placeholder="Название, описание или ингредиент"
                    value={menuSearch}
                    onChange={(e) => setMenuSearch(e.target.value)}
                  />
                </label>
                <label>
                  Категория меню
                  <select
                    value={menuCategory}
                    onChange={(e) => setMenuCategory(e.target.value)}
                  >
                    <option value="">Все категории</option>
                    {menu.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <span role="status">
                  Найдено: {visibleDishes.length} из {menu.dishes.length}
                </span>
                {(menuSearch || menuCategory) && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setMenuSearch("");
                      setMenuCategory("");
                    }}
                  >
                    Сбросить поиск
                  </button>
                )}
              </div>
              <div className="admin-menu-table-wrap">
                <table className="admin-menu-table">
                  <caption className="sr-only">Позиции меню ресторана</caption>
                  <thead>
                    <tr>
                      <th scope="col">Блюдо</th>
                      <th scope="col">Категория</th>
                      <th scope="col">Цена</th>
                      <th scope="col">Статус</th>
                      {manager && <th scope="col">Действия</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleDishes.map((d) => (
                      <tr key={d.id}>
                        <td data-label="Блюдо">
                          <b>{d.name}</b>
                          <small>{d.localizedName}</small>
                        </td>
                        <td data-label="Категория">
                          {menu.categories.find((c) => c.id === d.categoryId)
                            ?.name ?? "—"}
                        </td>
                        <td data-label="Цена" className="menu-price">
                          {money(d.price)}
                        </td>
                        <td data-label="Статус">
                          <span
                            className={`menu-availability ${d.available ? "available" : "stopped"}`}
                          >
                            {d.available ? "Доступно" : "Стоп-лист"}
                          </span>
                          {d.orderable === false && (
                            <small>Только в ресторане</small>
                          )}
                        </td>
                        {manager && (
                          <td data-label="Действия">
                            <div className="menu-row-actions">
                              <button
                                type="button"
                                disabled={busy}
                                className="secondary"
                                onClick={() =>
                                  mutate("/dishes/" + d.id, "PUT", {
                                    ...d,
                                    available: !d.available,
                                  })
                                }
                              >
                                {d.available ? "В стоп-лист" : "Вернуть"}
                              </button>
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => setEditing(d.id)}
                              >
                                Редактировать
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!visibleDishes.length && (
                  <p className="empty">
                    Ничего не найдено. Попробуйте другое название или сбросьте
                    фильтры.
                  </p>
                )}
              </div>
              {manager && editing && (
                <Modal
                  title={
                    editing === "categories"
                      ? "Категории меню"
                      : editing === "new"
                        ? "Добавить блюдо"
                        : `Редактировать: ${menu.dishes.find((d) => d.id === editing)?.name ?? "блюдо"}`
                  }
                  onClose={() => setEditing(null)}
                  wide
                >
                  {editing === "categories" ? (
                    <CategoriesEditor
                      initial={menu.categories}
                      dishes={menu.dishes}
                      busy={busy}
                      error={editorError}
                      close={() => setEditing(null)}
                      save={async (rows) => {
                        setEditorError("");
                        if (await mutate("/categories", "PUT", rows))
                          setEditing(null);
                      }}
                    />
                  ) : (
                    <DishEditor
                      key={editing}
                      initial={
                        editing === "new"
                          ? undefined
                          : menu.dishes.find((d) => d.id === editing)
                      }
                      categories={menu.categories}
                      dishes={menu.dishes}
                      busy={busy}
                      error={editorError}
                      close={() => setEditing(null)}
                      save={async (dish) => {
                        setEditorError("");
                        if (await mutate("/dishes/" + dish.id, "PUT", dish))
                          setEditing(null);
                      }}
                    />
                  )}
                </Modal>
              )}
            </>
          )}
          {tab === "settings" &&
            (manager ? (
              <>
                <p>
                  Здесь задаются название, контакты, часы работы, зоны доставки,
                  вместимость, правила бонусов и промокод.{" "}
                  <b>
                    Перед выходом из деморежима проверьте настоящее меню и все
                    условия ресторана.
                  </b>
                </p>
                <form
                  className="record"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    try {
                      await mutate(
                        "/settings",
                        "PUT",
                        JSON.parse(String(f.get("settings"))),
                      );
                    } catch {
                      say("Проверьте формат JSON.");
                    }
                  }}
                >
                  <label>
                    Настройки ресторана
                    <textarea
                      className="json-editor"
                      name="settings"
                      key={JSON.stringify(menu.config)}
                      defaultValue={JSON.stringify(menu.config, null, 2)}
                      spellCheck={false}
                    />
                  </label>
                  <button className="primary" disabled={busy}>
                    Сохранить настройки
                  </button>
                </form>
              </>
            ) : (
              <p>Настройки доступны управляющему.</p>
            ))}
          {tab === "audit" && (
            <div className="records">
              {data.audit.map((a) => (
                <div className="record-head" key={a.id}>
                  <b>{a.action}</b>
                  <span>{a.entity_id}</span>
                  <small>
                    {new Date(a.created_at).toLocaleString("ru-RU")}
                  </small>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
