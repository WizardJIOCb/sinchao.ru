import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  Bell,
  Bike,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Coffee,
  Flame,
  Leaf,
  MapPin,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Soup,
  Sparkles,
  UserRound,
  Utensils,
  X,
  Phone,
  Menu as MenuIcon,
  Settings,
  LogOut,
  Heart,
  CheckCircle2,
} from "lucide-react";
import { api, money, track } from "./api";
import type {
  CartItem,
  Category,
  Config,
  Dish,
  Fulfillment,
  Order,
  Quote,
  Reservation,
  User,
} from "../shared/types";
import { orderLabels } from "../shared/types";
import { Admin } from "./pages/Admin";
import "./style.css";
import "@fontsource/golos-text/400.css";
import "@fontsource/golos-text/500.css";
import "@fontsource/golos-text/600.css";
import "@fontsource/lora/400.css";
import "@fontsource/lora/400-italic.css";
import "@fontsource/lora/500.css";
type Page = "home" | "menu" | "orders" | "reservations" | "profile" | "admin";
type MenuData = { config: Config; categories: Category[]; dishes: Dish[] };
type Notice = {
  id: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};
const reservationLabels: Record<string, string> = {
  CONFIRMED: "Подтверждено",
  PENDING: "Ожидает подтверждения",
  SEATED: "Вы в ресторане",
  COMPLETED: "Завершено",
  CANCELLED: "Отменено",
  NO_SHOW: "Не состоялось",
};
function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Закрыть" onClick={onClose}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function App() {
  const [menu, setMenu] = useState<MenuData | null>(null),
    [user, setUser] = useState<User | null>(null),
    [points, setPoints] = useState(0),
    [cart, setCart] = useState<CartItem[]>([]),
    [orders, setOrders] = useState<Order[]>([]),
    [reservations, setReservations] = useState<Reservation[]>([]),
    [notices, setNotices] = useState<Notice[]>([]);
  const [page, setPage] = useState<Page>(
      location.pathname === "/admin" ? "admin" : "home",
    ),
    [category, setCategory] = useState("all"),
    [query, setQuery] = useState(""),
    [vegetarian, setVegetarian] = useState(false),
    [fulfillment, setFulfillment] = useState<Fulfillment>("DELIVERY"),
    [dish, setDish] = useState<Dish | null>(null),
    [editItem, setEditItem] = useState<CartItem | null>(null),
    [cartOpen, setCartOpen] = useState(false),
    [bookingOpen, setBookingOpen] = useState(false),
    [notificationsOpen, setNotificationsOpen] = useState(false),
    [authOpen, setAuthOpen] = useState(false),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [table, setTable] = useState("");
  const say = useCallback((text: string) => setToast(text), []);
  const refresh = useCallback(async () => {
    const [m, me, c, o, r, n] = await Promise.all([
      api<MenuData>("/menu"),
      api<{ user: User | null; balance: number }>("/me"),
      api<CartItem[]>("/cart"),
      api<Order[]>("/orders"),
      api<Reservation[]>("/reservations"),
      api<Notice[]>("/notifications"),
    ]);
    setMenu(m);
    setUser(me.user);
    setPoints(me.balance);
    setCart(c);
    setOrders(o);
    setReservations(r);
    setNotices(n);
    document.title = `${m.config.name} — вьетнамская кухня`;
  }, []);
  useEffect(() => {
    refresh()
      .then(() => {
        track("app_open");
        const token = location.pathname.match(/^\/dine-in\/([^/]+)$/)?.[1];
        if (token) {
          api<{ table: string }>("/dine-in/" + encodeURIComponent(token))
            .then((v) => {
              setTable(v.table);
              setPage("menu");
              track("qr_opened");
            })
            .catch((e) => setError(e.message));
        }
      })
      .catch((e) => setError(e.message));
  }, [refresh]);
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") refresh().catch(() => {});
    }, 20000);
    return () => clearInterval(t);
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  function go(p: Page) {
    setPage(p);
    history.replaceState(null, "", p === "admin" ? "/admin" : "/");
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (p === "menu") track("menu_view");
  }
  function openDish(d: Dish, item?: CartItem) {
    setEditItem(item ?? null);
    setDish(d);
    track("dish_view");
  }
  const cfg = menu?.config,
    totalCount = cart.reduce((s, i) => s + i.quantity, 0),
    active = orders.find((o) => !["COMPLETED", "CANCELLED"].includes(o.status));
  if (!menu || !cfg)
    return (
      <div className="loading">
        <Soup size={50} />
        <h1>Син Чао</h1>
        <p>{error || "Немного терпения. Накрываем на стол…"}</p>
        {error && (
          <button
            onClick={() =>
              refresh()
                .then(() => setError(""))
                .catch((e) => setError(e.message))
            }
          >
            Попробовать снова
          </button>
        )}
      </div>
    );
  const filtered = menu.dishes.filter(
    (d) =>
      (category === "all" || d.categoryId === category) &&
      (!vegetarian || d.tags.some((t) => /веган|вегетар/i.test(t))) &&
      (!query ||
        `${d.name} ${d.localizedName} ${d.description}`
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  return (
    <>
      <div className="topline">
        <span>Xin chào! Добро пожаловать к нашему столу.</span>
        <a href={"tel:" + cfg.phone}>
          <Phone size={13} />
          {cfg.phone.replace("+7", "+7 ")}
        </a>
      </div>
      <header>
        <div className="header-inner">
          <button
            className="wordmark"
            onClick={() => go("home")}
            aria-label="Син Чао — главная"
          >
            син чао<span>ВЬЕТНАМСКАЯ КУХНЯ</span>
          </button>
          <nav aria-label="Главная навигация">
            {(
              [
                ["home", "Главная"],
                ["menu", "Меню"],
                ["orders", "Мои заказы"],
                ["reservations", "Бронирования"],
              ] as [Page, string][]
            ).map(([p, label]) => (
              <button
                key={p}
                className={page === p ? "nav-active" : ""}
                onClick={() => go(p)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="header-actions">
            <button
              className="icon-button notification-button"
              aria-label="Уведомления"
              onClick={() => {
                setNotificationsOpen(true);
                api("/notifications/read", "POST", {})
                  .then(refresh)
                  .catch((e) => say(e.message));
              }}
            >
              <Bell size={20} />
              {notices.some((n) => !n.read_at) && <i />}
            </button>
            <button
              className="icon-button profile-button"
              aria-label="Личный кабинет"
              onClick={() => go("profile")}
            >
              <UserRound size={21} />
            </button>
            <button className="cart-button" onClick={() => setCartOpen(true)}>
              <ShoppingBag size={18} />
              <span>Корзина</span>
              <b>{totalCount}</b>
            </button>
          </div>
        </div>
      </header>
      <main>
        {cfg.demo && (
          <div className="demo-note">
            <Sparkles size={15} />
            <span>
              Знакомимся с новым сайтом. Меню и цены пока демонстрационные,
              заказы и брони — тестовые.
            </span>
          </div>
        )}
        {table && (
          <div className="table-note">
            <Utensils size={20} />
            <div>
              <b>
                {table} · {cfg.name}
              </b>
              <p>
                Выбирайте блюда в меню. Для заказа за столом пригласите
                официанта.
              </p>
            </div>
          </div>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={() => setError("")}>Закрыть</button>
          </div>
        )}
        {page === "home" && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow">
                  <span />
                  ИЗ ВЬЕТНАМА. С ЛЮБОВЬЮ.
                </div>
                <h1>
                  Тепло в каждой
                  <br />
                  <em>тарелке.</em>
                </h1>
                <p>
                  Наваристый фо, свежая зелень и немного
                  <br className="desktop" /> вьетнамского солнца. Совсем рядом с
                  вами.
                </p>
                <div className="hero-actions">
                  <button className="primary" onClick={() => go("menu")}>
                    Открыть меню <ArrowRight size={18} />
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setBookingOpen(true)}
                  >
                    Забронировать стол <ChevronRight size={16} />
                  </button>
                </div>
                <div className="hero-location">
                  <MapPin size={17} />
                  <span>{cfg.address}</span>
                </div>
              </div>
              <div className="hero-art">
                <span className="vertical-type">
                  NGON MIỆNG · ПРИЯТНОГО АППЕТИТА
                </span>
                <div className="hero-orbit" />
                <img
                  src={cfg.heroImage}
                  alt="Иллюстрация вьетнамского супа фо"
                />
                <div className="hero-stamp">
                  xin
                  <br />
                  <i>chào!</i>
                  <small>ВКУС ВЬЕТНАМА</small>
                </div>
                <span className="art-caption">
                  Иллюстрация · настоящее меню скоро
                </span>
              </div>
            </section>
            <section className="service-options" aria-label="Способ заказа">
              <button
                onClick={() => {
                  setFulfillment("DELIVERY");
                  go("menu");
                }}
              >
                <span className="service-icon">
                  <Bike />
                </span>
                <span>
                  <strong>Доставка к вам</strong>
                  <small>Любимые блюда, где бы вы ни были</small>
                </span>
                <ArrowRight size={20} />
              </button>
              <button
                onClick={() => {
                  setFulfillment("PICKUP");
                  go("menu");
                }}
              >
                <span className="service-icon">
                  <ShoppingBag />
                </span>
                <span>
                  <strong>Забрать по пути</strong>
                  <small>Закажите заранее — заберите сами</small>
                </span>
                <ArrowRight size={20} />
              </button>
              <button onClick={() => setBookingOpen(true)}>
                <span className="service-icon">
                  <Utensils />
                </span>
                <span>
                  <strong>Встретимся за столом</strong>
                  <small>Забронируйте место для своих</small>
                </span>
                <ArrowRight size={20} />
              </button>
            </section>
            {active && (
              <button className="active-order" onClick={() => go("orders")}>
                <span>
                  <Clock3 size={18} />
                  Заказ №{active.number} · {orderLabels[active.status]}
                </span>
                <span>
                  Посмотреть <ArrowRight size={16} />
                </span>
              </button>
            )}
            <section className="menu-section">
              <div className="section-title">
                <div>
                  <div className="eyebrow">С ЧЕГО НАЧАТЬ</div>
                  <h2>Маленькое знакомство с Вьетнамом</h2>
                </div>
                <button className="text-button" onClick={() => go("menu")}>
                  Всё меню <ArrowRight size={17} />
                </button>
              </div>
              <div className="dish-grid">
                {menu.dishes
                  .filter((d) => d.featured)
                  .map((d) => (
                    <DishCard key={d.id} dish={d} onClick={() => openDish(d)} />
                  ))}
              </div>
            </section>
            <section className="loyalty-banner">
              <div className="loyalty-symbol">
                <Heart size={38} />
              </div>
              <div>
                <div className="eyebrow">РАДЫ ВАМ СНОВА</div>
                <h2>Хороший вкус возвращается.</h2>
                <p>
                  Получайте {cfg.loyaltyPercent}% бонусами за завершённые
                  заказы.
                  <br />
                  Один бонус — один рубль для следующей встречи.
                </p>
              </div>
              <button className="primary light" onClick={() => go("profile")}>
                {user ? `Ваши бонусы: ${points}` : "Познакомиться ближе"}
                <ArrowRight size={18} />
              </button>
            </section>
          </>
        )}
        {page === "menu" && (
          <section className="menu-section full-menu">
            <div className="section-title">
              <div>
                <div className="eyebrow">СВЕЖЕЕ. АРОМАТНОЕ. ВАШЕ.</div>
                <h1>Наше меню</h1>
              </div>
              <div className="segmented">
                <button
                  className={fulfillment === "DELIVERY" ? "selected" : ""}
                  onClick={() => setFulfillment("DELIVERY")}
                >
                  <Bike size={17} />
                  Доставка
                </button>
                <button
                  className={fulfillment === "PICKUP" ? "selected" : ""}
                  onClick={() => setFulfillment("PICKUP")}
                >
                  <ShoppingBag size={17} />
                  Самовывоз
                </button>
              </div>
            </div>
            <div className="menu-tools">
              <div className="categories">
                {[{ id: "all", name: "Всё меню" }, ...menu.categories].map(
                  (c) => (
                    <button
                      key={c.id}
                      className={category === c.id ? "selected" : ""}
                      onClick={() => {
                        setCategory(c.id);
                        track("category_view");
                      }}
                    >
                      {c.name}
                    </button>
                  ),
                )}
              </div>
              <label className="search">
                <Search size={17} />
                <input
                  aria-label="Найти блюдо"
                  placeholder="Найти любимое блюдо"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
            </div>
            <div className="filter-line">
              <label>
                <input
                  type="checkbox"
                  checked={vegetarian}
                  onChange={(e) => setVegetarian(e.target.checked)}
                />
                <Leaf size={16} /> Без мяса
              </label>
              <span>{filtered.length} блюд · готовим для вас</span>
            </div>
            <div className="dish-grid">
              {filtered.map((d) => (
                <DishCard key={d.id} dish={d} onClick={() => openDish(d)} />
              ))}
            </div>
            {!filtered.length && (
              <Empty
                icon={<Search />}
                title="Ничего не нашлось"
                text="Попробуйте другое название или уберите фильтр."
              />
            )}
          </section>
        )}
        {page === "orders" && (
          <section className="page-section">
            <div className="eyebrow">ОТ НАШЕЙ КУХНИ К ВАМ</div>
            <h1>Мои заказы</h1>
            {!user && (
              <p className="muted">
                Гостевые заказы доступны в этом браузере. Войдите, чтобы
                сохранить их в аккаунте.
              </p>
            )}
            {!orders.length ? (
              <Empty
                icon={<ShoppingBag />}
                title="Здесь начнётся вкусная история"
                text="Первый фо, любимые роллы или что-нибудь новое?"
                action={
                  <button className="primary" onClick={() => go("menu")}>
                    Выбрать блюда <ArrowRight size={17} />
                  </button>
                }
              />
            ) : (
              <div className="records">
                {orders.map((o) => (
                  <article className="record" key={o.id}>
                    <div className="record-head">
                      <h3>Заказ №{o.number}</h3>
                      <span className="badge">{orderLabels[o.status]}</span>
                    </div>
                    <p className="muted">
                      {new Date(o.createdAt).toLocaleString("ru-RU")} ·{" "}
                      {o.fulfillment === "DELIVERY" ? "Доставка" : "Самовывоз"}
                    </p>
                    <div className="order-progress">
                      {[
                        "CREATED",
                        "CONFIRMED",
                        "PREPARING",
                        ...(o.fulfillment === "DELIVERY"
                          ? ["OUT_FOR_DELIVERY"]
                          : ["READY"]),
                        "COMPLETED",
                      ].map((s, i) => (
                        <span
                          key={s}
                          className={s === o.status ? "current" : ""}
                        >
                          <i>{s === o.status ? <Check size={12} /> : i + 1}</i>
                          {orderLabels[s]}
                        </span>
                      ))}
                    </div>
                    {o.items.map((i) => (
                      <div className="line-item" key={i.id}>
                        <span>
                          {i.name} × {i.quantity}
                          <small>{i.modifierNames.join(", ")}</small>
                        </span>
                        <b>{money(i.lineTotal)}</b>
                      </div>
                    ))}
                    <p>
                      {o.contact.address} ·{" "}
                      {o.contact.time === "ASAP"
                        ? "Как можно скорее"
                        : o.contact.time}
                    </p>
                    <div className="record-head">
                      <b>Итого {money(o.total)}</b>
                      <span>
                        {o.paymentStatus === "PAID"
                          ? "Оплата получена"
                          : "Оплата при получении"}
                      </span>
                    </div>
                    <div className="button-row">
                      <button
                        className="secondary"
                        onClick={async () => {
                          try {
                            track("reorder_clicked");
                            const r = await api<{
                              warnings: string[];
                              fulfillment: Fulfillment;
                            }>("/orders/" + o.id + "/reorder", "POST", {});
                            setFulfillment(r.fulfillment);
                            await refresh();
                            setCartOpen(true);
                            say(
                              r.warnings.length
                                ? r.warnings.join(" ")
                                : "Корзина восстановлена по текущим ценам.",
                            );
                          } catch (e: any) {
                            say(e.message);
                          }
                        }}
                      >
                        Повторить заказ
                      </button>
                      {["CREATED", "CONFIRMED"].includes(o.status) &&
                        o.paymentStatus !== "PAID" && (
                          <button
                            className="text-button danger"
                            onClick={async () => {
                              try {
                                await api(
                                  "/orders/" + o.id + "/cancel",
                                  "POST",
                                  {},
                                );
                                await refresh();
                                say("Заказ отменён.");
                              } catch (e: any) {
                                say(e.message);
                              }
                            }}
                          >
                            Отменить
                          </button>
                        )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
        {page === "reservations" && (
          <section className="page-section">
            <div className="section-title">
              <div>
                <div className="eyebrow">МЕСТО ДЛЯ ХОРОШИХ ВСТРЕЧ</div>
                <h1>Ваш столик ждёт</h1>
              </div>
              <button className="primary" onClick={() => setBookingOpen(true)}>
                <Plus size={18} />
                Забронировать
              </button>
            </div>
            <p className="muted">
              Выберите время и компанию. Предпочтения по размещению учтём по
              возможности.
            </p>
            {!reservations.length ? (
              <Empty
                icon={<CalendarDays />}
                title="Повод встретиться найдётся"
                text="Тихий обед вдвоём или ужин всей семьёй — будем рады."
                action={
                  <button
                    className="primary"
                    onClick={() => setBookingOpen(true)}
                  >
                    Выбрать время
                  </button>
                }
              />
            ) : (
              <div className="records">
                {reservations.map((r) => (
                  <article className="record" key={r.id}>
                    <div className="record-head">
                      <h3>
                        {r.date.split("-").reverse().join(".")} · {r.time}
                      </h3>
                      <span className="badge">
                        {reservationLabels[r.status]}
                      </span>
                    </div>
                    <p>
                      {r.partySize} гостей · {r.seating}
                    </p>
                    <p className="muted">{r.notes || cfg.address}</p>
                    {["PENDING", "CONFIRMED"].includes(r.status) && (
                      <button
                        className="text-button danger"
                        onClick={async () => {
                          try {
                            await api(
                              "/reservations/" + r.id + "/cancel",
                              "POST",
                              {},
                            );
                            track("reservation_cancelled");
                            await refresh();
                            say("Бронирование отменено.");
                          } catch (e: any) {
                            say(e.message);
                          }
                        }}
                      >
                        Отменить бронирование
                      </button>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
        {page === "profile" && (
          <Profile
            user={user}
            points={points}
            cfg={cfg}
            login={() => setAuthOpen(true)}
            refresh={refresh}
            say={say}
            admin={() => go("admin")}
          />
        )}
        {page === "admin" && (
          <Admin
            user={user}
            menu={menu}
            login={() => setAuthOpen(true)}
            refresh={refresh}
            say={say}
          />
        )}
      </main>
      <footer>
        <div className="footer-top">
          <div>
            <div className="wordmark">
              син чао<span>ДО ВСТРЕЧИ ЗА СТОЛОМ</span>
            </div>
            <p>
              Немного Вьетнама.
              <br />
              Много душевного тепла.
            </p>
          </div>
          <div>
            <h4>Приходите в гости</h4>
            <p>{cfg.address}</p>
            <a href={"tel:" + cfg.phone}>{cfg.phone}</a>
          </div>
          <div>
            <h4>Остаёмся на связи</h4>
            <a
              href="https://vk.ru/club240374933"
              target="_blank"
              rel="noreferrer"
            >
              Наше сообщество ВКонтакте ↗
            </a>
            <button
              className="footer-link"
              onClick={() => setBookingOpen(true)}
            >
              Забронировать столик
            </button>
            <button className="footer-link" onClick={() => go("admin")}>
              Для сотрудников
            </button>
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} {cfg.name}
          </span>
          <span>Сделано с аппетитом · Xin chào!</span>
        </div>
      </footer>
      <div className="mobile-nav">
        {(
          [
            { p: "home", label: "Главная", icon: <Soup /> },
            { p: "menu", label: "Меню", icon: <MenuIcon /> },
            { p: "orders", label: "Заказы", icon: <ShoppingBag /> },
            { p: "reservations", label: "Столик", icon: <CalendarDays /> },
            { p: "profile", label: "Профиль", icon: <UserRound /> },
          ] as { p: Page; label: string; icon: React.ReactNode }[]
        ).map((n) => (
          <button
            key={n.p}
            className={page === n.p ? "selected" : ""}
            onClick={() => go(n.p)}
          >
            {n.icon}
            <span>{n.label}</span>
          </button>
        ))}
      </div>
      {dish && (
        <DishModal
          dish={dish}
          item={editItem}
          close={() => setDish(null)}
          done={async () => {
            await refresh();
            setDish(null);
            say(
              editItem
                ? "Блюдо обновлено"
                : "Блюдо в корзине. Приятного аппетита!",
            );
          }}
        />
      )}
      {cartOpen && (
        <CartModal
          menu={menu}
          user={user}
          points={points}
          cart={cart}
          fulfillment={fulfillment}
          setFulfillment={setFulfillment}
          close={() => setCartOpen(false)}
          refresh={refresh}
          edit={(i) => {
            const d = menu.dishes.find((d) => d.id === i.dishId);
            if (d) {
              setCartOpen(false);
              openDish(d, i);
            }
          }}
          done={() => {
            setCartOpen(false);
            go("orders");
            say("Заказ получен. Статус появится здесь.");
          }}
        />
      )}
      {bookingOpen && (
        <BookingModal
          cfg={cfg}
          user={user}
          close={() => setBookingOpen(false)}
          done={async () => {
            await refresh();
            setBookingOpen(false);
            go("reservations");
            say("Бронирование подтверждено. Будем рады встрече!");
          }}
        />
      )}
      {authOpen && (
        <AuthModal
          close={() => setAuthOpen(false)}
          done={async () => {
            await refresh();
            setAuthOpen(false);
            say("Добро пожаловать!");
          }}
        />
      )}
      {notificationsOpen && (
        <Modal title="Уведомления" onClose={() => setNotificationsOpen(false)}>
          {notices.length ? (
            notices.map((n) => (
              <article className="notice" key={n.id}>
                <CheckCircle2 size={22} />
                <div>
                  <h3>{n.title}</h3>
                  <p>{n.body}</p>
                  <small>
                    {new Date(n.created_at).toLocaleString("ru-RU")}
                  </small>
                </div>
              </article>
            ))
          ) : (
            <Empty
              icon={<Bell />}
              title="Пока всё тихо"
              text="Здесь появятся новости о ваших заказах и бронированиях."
            />
          )}
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={20} />
          {toast}
          <button aria-label="Закрыть уведомление" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}
function DishCard({ dish: d, onClick }: { dish: Dish; onClick: () => void }) {
  return (
    <article className={"dish-card " + (!d.available ? "unavailable" : "")}>
      <button
        className="dish-image"
        onClick={onClick}
        aria-label={"Подробнее: " + d.localizedName}
      >
        <img
          src={d.image}
          alt={d.localizedName + " — иллюстрация"}
          loading="lazy"
        />
        {d.spice > 0 ? (
          <span className="dish-tag spicy">
            <Flame size={12} />
            Острое
          </span>
        ) : (
          d.tags[0] && <span className="dish-tag">{d.tags[0]}</span>
        )}
        <span className="portion">{d.portion}</span>
      </button>
      <div className="dish-info">
        <button className="dish-title" onClick={onClick}>
          <h3>{d.name}</h3>
          <span>{d.localizedName}</span>
        </button>
        <p>{d.description}</p>
        <div className="dish-bottom">
          <strong>{money(d.price)}</strong>
          <button
            disabled={!d.available}
            aria-label={"Добавить " + d.localizedName}
            onClick={onClick}
          >
            {d.available ? <Plus size={19} /> : <span>Нет в наличии</span>}
          </button>
        </div>
      </div>
    </article>
  );
}
function Empty({
  icon,
  title,
  text,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div>{icon}</div>
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}
function DishModal({
  dish,
  item,
  close,
  done,
}: {
  dish: Dish;
  item: CartItem | null;
  close: () => void;
  done: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>(
      item?.modifiers ??
        dish.modifiers.flatMap((g) =>
          g.min === 1 && g.max === 1
            ? g.options
                .filter((o) => o.available)
                .slice(0, 1)
                .map((o) => o.id)
            : [],
        ),
    ),
    [qty, setQty] = useState(item?.quantity ?? 1),
    [notes, setNotes] = useState(item?.notes ?? ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const total =
    (dish.price +
      dish.modifiers
        .flatMap((g) => g.options)
        .filter((m) => selected.includes(m.id))
        .reduce((s, m) => s + m.price, 0)) *
    qty;
  return (
    <Modal title={dish.name} onClose={close}>
      <img
        className="modal-dish-image"
        src={dish.image}
        alt={dish.localizedName}
      />
      <div className="modal-dish-body">
        <div className="record-head">
          <h3>{dish.localizedName}</h3>
          <span className="muted">{dish.portion}</span>
        </div>
        <p>{dish.description}</p>
        <div className="tags">
          {dish.tags.map((t) => (
            <span key={t}>{t}</span>
          ))}
          <span>{dish.region}</span>
        </div>
        <details>
          <summary>Состав и аллергены</summary>
          <p>{dish.ingredients.join(", ")}</p>
          <p>
            <b>Аллергены:</b>{" "}
            {dish.allergens.join(", ") || "Уточняются у ресторана"}
          </p>
          <small>
            На кухне возможен контакт с другими аллергенами. Сообщите сотруднику
            об аллергии.
          </small>
        </details>
        {dish.modifiers.map((g) => (
          <fieldset key={g.id}>
            <legend>
              {g.name}{" "}
              <small>
                {g.min ? `выберите ${g.min}` : "по желанию"}, до {g.max}
              </small>
            </legend>
            {g.options.map((m) => (
              <label className="modifier" key={m.id}>
                <input
                  type={g.max === 1 ? "radio" : "checkbox"}
                  name={g.id}
                  checked={selected.includes(m.id)}
                  disabled={!m.available}
                  onChange={(e) =>
                    setSelected(
                      g.max === 1
                        ? [
                            ...selected.filter(
                              (s) => !g.options.some((o) => o.id === s),
                            ),
                            m.id,
                          ]
                        : e.target.checked
                          ? [...selected, m.id]
                          : selected.filter((s) => s !== m.id),
                    )
                  }
                />
                <span>{m.name}</span>
                <b>{m.price ? "+" + money(m.price) : "Бесплатно"}</b>
              </label>
            ))}
          </fieldset>
        ))}
        <label>
          Пожелания к блюду
          <textarea
            value={notes}
            maxLength={300}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Например, чили отдельно"
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dish-modal-actions">
          <div className="quantity">
            <button
              disabled={qty <= 1}
              aria-label="Уменьшить количество"
              onClick={() => setQty(qty - 1)}
            >
              <Minus size={16} />
            </button>
            <b>{qty}</b>
            <button
              disabled={qty >= 20}
              aria-label="Увеличить количество"
              onClick={() => setQty(qty + 1)}
            >
              <Plus size={16} />
            </button>
          </div>
          <button
            className="primary"
            disabled={busy || !dish.available}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await api(
                  "/cart/items" + (item ? "/" + item.id : ""),
                  item ? "PATCH" : "POST",
                  {
                    dishId: dish.id,
                    quantity: qty,
                    modifiers: selected,
                    notes,
                  },
                );
                track("add_to_cart");
                await done();
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Добавляем…" : item ? "Сохранить" : "В корзину"} ·{" "}
            {money(total)}
          </button>
        </div>
      </div>
    </Modal>
  );
}
function CartModal({
  menu,
  user,
  points,
  cart,
  fulfillment,
  setFulfillment,
  close,
  refresh,
  edit,
  done,
}: {
  menu: MenuData;
  user: User | null;
  points: number;
  cart: CartItem[];
  fulfillment: Fulfillment;
  setFulfillment: (f: Fulfillment) => void;
  close: () => void;
  refresh: () => Promise<void>;
  edit: (i: CartItem) => void;
  done: () => void;
}) {
  const cfg = menu.config;
  const [zoneId, setZoneId] = useState(cfg.zones[0]?.id ?? ""),
    [promo, setPromo] = useState(""),
    [redeem, setRedeem] = useState(0),
    [quote, setQuote] = useState<Quote | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [quoteLoading, setQuoteLoading] = useState(false),
    [slots, setSlots] = useState<{ asap: boolean; times: string[] }>({
      asap: false,
      times: [],
    });
  const key = useRef(crypto.randomUUID());
  useEffect(() => {
    api<typeof slots>("/cart/times")
      .then(setSlots)
      .catch((e) => setError(e.message));
    track("checkout_started");
  }, []);
  useEffect(() => {
    let cancelled = false;
    setQuote(null);
    setError("");
    if (!cart.length) return;
    setQuoteLoading(true);
    api<Quote>("/cart/quote", "POST", {
      fulfillment,
      zoneId,
      promo,
      points: redeem,
    })
      .then((q) => {
        if (!cancelled) setQuote(q);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setQuoteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cart, fulfillment, zoneId, promo, redeem]);
  return (
    <Modal title="Ваша корзина" onClose={close} wide>
      {!cart.length ? (
        <Empty
          icon={<ShoppingBag />}
          title="Добавим что-нибудь вкусное?"
          text="Выберите блюда в меню — они появятся здесь."
          action={
            <button className="primary" onClick={close}>
              Продолжить выбор
            </button>
          }
        />
      ) : (
        <form
          className="checkout-layout"
          onChange={() => {
            key.current = crypto.randomUUID();
          }}
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy || !quote) return;
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              await api(
                "/orders",
                "POST",
                {
                  fulfillment,
                  zoneId,
                  promo,
                  points: redeem,
                  name: f.get("name"),
                  phone: f.get("phone"),
                  address: f.get("address") ?? "",
                  time: f.get("time"),
                  notes: f.get("notes") ?? "",
                },
                key.current,
              );
              track("order_created");
              await refresh();
              done();
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div>
            <div className="cart-items">
              {cart.map((i) => {
                const d = menu.dishes.find((d) => d.id === i.dishId);
                return (
                  <div className="cart-item" key={i.id}>
                    <img src={d?.image} alt="" />
                    <div>
                      <b>{d?.name ?? "Блюдо недоступно"}</b>
                      <small>
                        {i.quantity} шт. ·{" "}
                        {i.modifiers
                          .map(
                            (m) =>
                              d?.modifiers
                                .flatMap((g) => g.options)
                                .find((x) => x.id === m)?.name,
                          )
                          .filter(Boolean)
                          .join(", ")}
                      </small>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => edit(i)}
                      >
                        Изменить
                      </button>
                    </div>
                    <button
                      className="icon-button"
                      aria-label={"Удалить " + d?.name}
                      type="button"
                      onClick={async () => {
                        try {
                          await api("/cart/items/" + i.id, "DELETE", {});
                          track("remove_from_cart");
                          await refresh();
                        } catch (e: any) {
                          setError(e.message);
                        }
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
            <h3>Как передать заказ?</h3>
            <div className="segmented">
              <button
                type="button"
                className={fulfillment === "DELIVERY" ? "selected" : ""}
                onClick={() => setFulfillment("DELIVERY")}
              >
                <Bike size={17} />
                Доставка
              </button>
              <button
                type="button"
                className={fulfillment === "PICKUP" ? "selected" : ""}
                onClick={() => setFulfillment("PICKUP")}
              >
                <ShoppingBag size={17} />
                Самовывоз
              </button>
            </div>
            {fulfillment === "DELIVERY" ? (
              <>
                <label>
                  Район доставки
                  <select
                    value={zoneId}
                    onChange={(e) => setZoneId(e.target.value)}
                  >
                    {cfg.zones.map((z) => (
                      <option value={z.id} key={z.id}>
                        {z.name} · {money(z.fee)}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="form-help">
                  Улицы зоны:{" "}
                  {cfg.zones.find((z) => z.id === zoneId)?.streets.join(", ")}.
                  От{" "}
                  {money(cfg.zones.find((z) => z.id === zoneId)?.minimum ?? 0)}.
                </p>
                <label>
                  Адрес доставки
                  <input
                    name="address"
                    required
                    minLength={8}
                    maxLength={300}
                    placeholder="Улица, дом, квартира, подъезд"
                    autoComplete="street-address"
                  />
                </label>
              </>
            ) : (
              <p className="pickup-address">
                <MapPin size={18} />
                {cfg.address}
              </p>
            )}
            <div className="form-grid">
              <label>
                Ваше имя
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={100}
                  defaultValue={user?.name}
                  autoComplete="name"
                />
              </label>
              <label>
                Телефон
                <input
                  name="phone"
                  type="tel"
                  required
                  pattern="\+?[0-9 ()\-]{10,20}"
                  defaultValue={user?.phone}
                  placeholder="+7 900 000-00-00"
                  autoComplete="tel"
                />
              </label>
            </div>
            <label>
              Когда приготовить
              <select name="time" required>
                {slots.asap && (
                  <option value="ASAP">
                    Как можно скорее ·{" "}
                    {fulfillment === "DELIVERY"
                      ? cfg.deliveryEta
                      : cfg.pickupEta}
                  </option>
                )}
                {slots.times.map((t) => (
                  <option key={t} value={t}>
                    Сегодня к {t}
                  </option>
                ))}
                {!slots.asap && !slots.times.length && (
                  <option value="">Сегодня уже закрыто</option>
                )}
              </select>
            </label>
            <label>
              Комментарий к заказу
              <textarea
                name="notes"
                maxLength={500}
                placeholder="Что нам стоит знать?"
              />
            </label>
          </div>
          <aside className="checkout-summary">
            <h3>Ваш заказ</h3>
            <label>
              Промокод
              <input
                value={promo}
                maxLength={30}
                onChange={(e) => setPromo(e.target.value.toUpperCase())}
                placeholder="Если есть"
              />
            </label>
            {user && (
              <label>
                Списать бонусы · доступно {points}
                <input
                  type="number"
                  min={0}
                  max={points}
                  value={redeem}
                  onChange={(e) => setRedeem(Number(e.target.value))}
                />
                <small>До {cfg.redemptionPercent}% стоимости блюд.</small>
              </label>
            )}
            {quote ? (
              <div className="totals">
                <div>
                  <span>Блюда</span>
                  <b>{money(quote.subtotal)}</b>
                </div>
                {quote.discount > 0 && (
                  <div>
                    <span>Скидка</span>
                    <b>−{money(quote.discount)}</b>
                  </div>
                )}
                {quote.loyaltyDiscount > 0 && (
                  <div>
                    <span>Бонусы</span>
                    <b>−{money(quote.loyaltyDiscount)}</b>
                  </div>
                )}
                <div>
                  <span>
                    {fulfillment === "DELIVERY" ? "Доставка" : "Самовывоз"}
                  </span>
                  <b>
                    {quote.deliveryFee ? money(quote.deliveryFee) : "Бесплатно"}
                  </b>
                </div>
                <div className="grand-total">
                  <span>Итого</span>
                  <b>{money(quote.total)}</b>
                </div>
                <small>Сервисный сбор: 0 ₽. Доплат после оформления нет.</small>
              </div>
            ) : quoteLoading ? (
              <p>Рассчитываем стоимость…</p>
            ) : null}
            <div className="payment-info">
              <CheckCircle2 size={19} />
              <span>
                <b>Оплата при получении</b>
                <small>
                  Способ оплаты уточнит ресторан. Онлайн-оплата пока не
                  подключена.
                </small>
              </span>
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {cfg.demo && (
              <p className="form-help">
                Демонстрационный режим: заказ не поступит на кухню настоящего
                ресторана.
              </p>
            )}
            <button
              className="primary full"
              disabled={
                busy ||
                !quote ||
                !cfg.orderingEnabled ||
                (!slots.asap && !slots.times.length)
              }
            >
              {busy
                ? "Оформляем…"
                : cfg.demo
                  ? "Создать тестовый заказ"
                  : "Оформить заказ"}
              <ArrowRight size={17} />
            </button>
            <small className="privacy-note">
              Контакты используются для обработки заказа. История гостя доступна
              только в этом браузере.
            </small>
          </aside>
        </form>
      )}
    </Modal>
  );
}
function BookingModal({
  cfg,
  user,
  close,
  done,
}: {
  cfg: Config;
  user: User | null;
  close: () => void;
  done: () => Promise<void>;
}) {
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: cfg.timezone,
  }).format(new Date());
  const [date, setDate] = useState(today),
    [guests, setGuests] = useState(2),
    [time, setTime] = useState(""),
    [slots, setSlots] = useState<{ time: string; available: boolean }[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const key = useRef(crypto.randomUUID());
  useEffect(() => {
    track("reservation_started");
  }, []);
  useEffect(() => {
    let valid = true;
    setLoading(true);
    setTime("");
    setError("");
    api<typeof slots>(
      "/reservations/availability?date=" + date + "&partySize=" + guests,
    )
      .then((s) => {
        if (valid) setSlots(s);
      })
      .catch((e) => {
        if (valid) {
          setSlots([]);
          setError(e.message);
        }
      })
      .finally(() => {
        if (valid) setLoading(false);
      });
    return () => {
      valid = false;
    };
  }, [date, guests]);
  return (
    <Modal title="Встретимся за столом" onClose={close}>
      <form
        className="standard-form"
        onChange={() => {
          key.current = crypto.randomUUID();
        }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || !time) return;
          setBusy(true);
          setError("");
          const f = new FormData(e.currentTarget);
          try {
            await api(
              "/reservations",
              "POST",
              {
                date,
                time,
                partySize: guests,
                seating: f.get("seating"),
                name: f.get("name"),
                phone: f.get("phone"),
                notes: f.get("notes"),
              },
              key.current,
            );
            track("reservation_created");
            await done();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="muted">{cfg.address}</p>
        <div className="form-grid">
          <label>
            Дата
            <input
              type="date"
              min={today}
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            Гостей
            <select
              value={guests}
              onChange={(e) => setGuests(Number(e.target.value))}
            >
              {Array.from({ length: cfg.maxGuests }, (_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Время <small>Местное время ресторана</small>
        </label>
        {loading ? (
          <p>Проверяем свободные места…</p>
        ) : (
          <div className="time-slots">
            {slots.map((s) => (
              <button
                type="button"
                disabled={!s.available}
                aria-pressed={s.time === time}
                className={s.time === time ? "selected" : ""}
                key={s.time}
                onClick={() => {
                  setTime(s.time);
                  key.current = crypto.randomUUID();
                }}
              >
                {s.time}
              </button>
            ))}
          </div>
        )}
        {!loading && !slots.some((s) => s.available) && (
          <p className="error">
            На эту дату нет доступного времени. Попробуйте следующий день.
          </p>
        )}
        <label>
          Где вам уютнее?
          <select name="seating">
            {cfg.seating.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <small>
          Это пожелание, а не гарантия конкретного стола. Бронь на{" "}
          {cfg.reservationMinutes} минут, отмена бесплатная до посадки.
        </small>
        <div className="form-grid">
          <label>
            Ваше имя
            <input
              name="name"
              minLength={2}
              maxLength={100}
              required
              defaultValue={user?.name}
            />
          </label>
          <label>
            Телефон
            <input
              name="phone"
              type="tel"
              required
              pattern="\+?[0-9 ()\-]{10,20}"
              placeholder="+7 900 000-00-00"
              defaultValue={user?.phone}
            />
          </label>
        </div>
        <label>
          Особые пожелания
          <textarea
            name="notes"
            maxLength={500}
            placeholder="Детский стул, особый повод…"
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {cfg.demo && (
          <p className="form-help">
            Тестовое бронирование. Для настоящей брони позвоните {cfg.phone}.
          </p>
        )}
        <button className="primary full" disabled={busy || !time || loading}>
          {busy
            ? "Бронируем…"
            : cfg.demo
              ? "Создать тестовую бронь"
              : "Забронировать"}
          <ArrowRight size={17} />
        </button>
      </form>
    </Modal>
  );
}
function AuthModal({
  close,
  done,
}: {
  close: () => void;
  done: () => Promise<void>;
}) {
  const [register, setRegister] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={register ? "Давайте знакомиться" : "Рады видеть вас снова"}
      onClose={close}
    >
      <form
        className="standard-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const f = new FormData(e.currentTarget);
          try {
            await api(
              "/auth/" + (register ? "register" : "login"),
              "POST",
              Object.fromEntries(f),
            );
            await done();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="muted">
          Один аккаунт для заказов, встреч и приятных бонусов.
        </p>
        {register && (
          <label>
            Ваше имя
            <input
              name="name"
              minLength={2}
              maxLength={100}
              required
              autoComplete="name"
            />
          </label>
        )}
        <label>
          Email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Пароль
          <input
            name="password"
            type="password"
            minLength={10}
            maxLength={200}
            required
            autoComplete={register ? "new-password" : "current-password"}
          />
          <small>Не менее 10 символов</small>
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary full" disabled={busy}>
          {busy ? "Подождите…" : register ? "Создать аккаунт" : "Войти"}
          <ArrowRight size={17} />
        </button>
        <button
          type="button"
          className="text-button centered"
          onClick={() => {
            setRegister(!register);
            setError("");
          }}
        >
          {register
            ? "Уже есть аккаунт? Войти"
            : "Первый раз? Зарегистрироваться"}
        </button>
      </form>
    </Modal>
  );
}
function Profile({
  user,
  points,
  cfg,
  login,
  refresh,
  say,
  admin,
}: {
  user: User | null;
  points: number;
  cfg: Config;
  login: () => void;
  refresh: () => Promise<void>;
  say: (s: string) => void;
  admin: () => void;
}) {
  const [transactions, setTransactions] = useState<
    { id: string; points: number; description: string; created_at: string }[]
  >([]);
  useEffect(() => {
    if (user)
      api<{ transactions: typeof transactions }>("/loyalty")
        .then((r) => setTransactions(r.transactions))
        .catch((e) => say(e.message));
  }, [user?.id, points, say]);
  return (
    <section className="page-section">
      <div className="eyebrow">ВЫ У НАС КАК ДОМА</div>
      <h1>{user ? `Син чао, ${user.name}!` : "Будем знакомы?"}</h1>
      {!user ? (
        <Empty
          icon={<UserRound />}
          title="Ваш маленький уголок Вьетнама"
          text="Сохраняйте заказы, повторяйте любимое и получайте бонусы."
          action={
            <button className="primary" onClick={login}>
              Войти или зарегистрироваться
              <ArrowRight size={17} />
            </button>
          }
        />
      ) : (
        <div className="profile-grid">
          <div>
            <div className="points-card">
              <span>
                <Sparkles size={20} /> ВАШИ БОНУСЫ
              </span>
              <strong>
                {points}
                <small>баллов</small>
              </strong>
              <p>
                {cfg.loyaltyPercent}% с каждого завершённого заказа.
                <br />1 балл = 1 ₽. Оплачивайте до {cfg.redemptionPercent}%
                блюд.
              </p>
            </div>
            <h3>История бонусов</h3>
            {transactions.length ? (
              transactions.map((t) => (
                <div className="line-item" key={t.id}>
                  <span>
                    {t.description}
                    <small>
                      {new Date(t.created_at).toLocaleDateString("ru-RU")}
                    </small>
                  </span>
                  <b>
                    {t.points > 0 ? "+" : ""}
                    {t.points}
                  </b>
                </div>
              ))
            ) : (
              <p className="muted">
                Бонусы появятся после первого завершённого и оплаченного заказа.
              </p>
            )}
          </div>
          <form
            className="record standard-form"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api(
                  "/me",
                  "PATCH",
                  Object.fromEntries(new FormData(e.currentTarget)),
                );
                await refresh();
                say("Профиль сохранён.");
              } catch (e: any) {
                say(e.message);
              }
            }}
          >
            <h3>Ваши данные</h3>
            <label>
              Имя
              <input
                name="name"
                required
                minLength={2}
                maxLength={100}
                defaultValue={user.name}
              />
            </label>
            <label>
              Телефон
              <input
                name="phone"
                type="tel"
                maxLength={30}
                defaultValue={user.phone}
              />
            </label>
            <label>
              Email
              <input disabled value={user.email} />
            </label>
            <button className="primary">Сохранить</button>
            {user.role !== "CUSTOMER" && (
              <button type="button" className="secondary" onClick={admin}>
                <Settings size={18} />
                Панель ресторана
              </button>
            )}
            <button
              className="text-button"
              type="button"
              onClick={async () => {
                try {
                  await api("/auth/logout", "POST", {});
                  await refresh();
                  say("Вы вышли из аккаунта.");
                } catch (e: any) {
                  say(e.message);
                }
              }}
            >
              <LogOut size={16} />
              Выйти
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
