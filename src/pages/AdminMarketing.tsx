import { useEffect, useState } from "react";
import type { Dish } from "../../shared/types";
import type {
  AchievementRule,
  GeneralAchievementRule,
  Promotion,
} from "../../shared/marketing";
import { api } from "../api";

const emptyPromo: Promotion = {
  code: "",
  title: "",
  percent: 0,
  dishIds: [],
  enabled: false,
  startsAt: null,
  endsAt: null,
  limit: null,
  minSubtotal: 0,
};
const localDate = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
export function AdminMarketing({ menu }: { menu: Dish[] }) {
  const [data, setData] = useState<{
    promotions: Promotion[];
    rules: AchievementRule[];
    generalRules: GeneralAchievementRule[];
  } | null>(null);
  const [tab, setTab] = useState("promos");
  const [promo, setPromo] = useState<Promotion | null>(null);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [rule, setRule] = useState<AchievementRule | null>(null);
  const [general, setGeneral] = useState<GeneralAchievementRule | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function load() {
    setData(await api("/admin/marketing"));
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  async function save(path: string, body: unknown) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api("/admin/marketing/" + path, "PUT", body);
      await load();
      if (path.startsWith("promotions/"))
        setEditingCode((body as Promotion).code);
      setMessage("Сохранено. Изменения уже действуют на сайте.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="marketing-admin">
      <h2>Промокоды и ачивки</h2>
      <div className="categories">
        <button
          className={tab === "promos" ? "selected" : ""}
          onClick={() => {
            setTab("promos");
            setMessage("");
          }}
        >
          Промокоды
        </button>
        <button
          className={tab === "badges" ? "selected" : ""}
          onClick={() => {
            setTab("badges");
            setMessage("");
          }}
        >
          Ачивки по блюдам
        </button>
        <button
          className={tab === "general" ? "selected" : ""}
          onClick={() => {
            setTab("general");
            setMessage("");
          }}
        >
          Общие ачивки
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {!data && <p>Загружаем настройки…</p>}
      {data && tab === "general" && (
        <>
          <p>
            Оплаченные завершённые заказы и закрытые счета учитываются
            автоматически. Чаевые за столом получает в прогресс тот
            зарегистрированный гость, который сохранил итоговый выбор. Пять
            порогов задаются по возрастанию.
          </p>
          <label>
            Выберите общее достижение
            <select
              value={general?.id ?? ""}
              onChange={(e) => {
                setGeneral(
                  data.generalRules.find((r) => r.id === e.target.value) ??
                    null,
                );
                setMessage("");
              }}
            >
              <option value="">Выберите…</option>
              {data.generalRules.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.enabled ? "" : " · скрыта"}
                </option>
              ))}
            </select>
          </label>
          {general && (
            <form
              className="record standard-form"
              onSubmit={(e) => {
                e.preventDefault();
                void save("general-achievements/" + general.id, general);
              }}
            >
              <label>
                Название общего достижения
                <input
                  required
                  maxLength={100}
                  value={general.name}
                  onChange={(e) =>
                    setGeneral({ ...general, name: e.target.value })
                  }
                />
              </label>
              <div className="marketing-levels">
                {general.milestones.map((n, i) => (
                  <label key={i}>
                    Уровень {i + 1}: действий
                    <input
                      required
                      type="number"
                      min={1}
                      max={10000}
                      value={n}
                      onChange={(e) =>
                        setGeneral({
                          ...general,
                          milestones: general.milestones.map((v, j) =>
                            i === j ? Number(e.target.value) : v,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={general.enabled}
                  onChange={(e) =>
                    setGeneral({ ...general, enabled: e.target.checked })
                  }
                />
                Показывать достижение
              </label>
              <button className="primary" disabled={busy}>
                Сохранить общее достижение
              </button>
            </form>
          )}
        </>
      )}
      {data && tab === "promos" && (
        <>
          <p>
            Скидка действует на выбранные блюда, включая добавки; без выбора —
            на всю корзину. Доставка не участвует. Бонусы списываются после
            скидки.
          </p>
          <p className="form-help">
            Лимит расходуется при создании заказа, в том числе если его позже
            отменили. Повторная отправка того же заказа лимит не расходует.
            Общий промокод из «Настроек» продолжает работать отдельно; при
            совпадении кода действуют правила этого раздела.
          </p>
          <label>
            Выберите промокод
            <select
              value={promo?.code ?? ""}
              onChange={(e) => {
                setEditingCode(e.target.value || null);
                setPromo(
                  data.promotions.find((p) => p.code === e.target.value) ??
                    null,
                );
                setMessage("");
              }}
            >
              <option value="">Выберите…</option>
              {data.promotions.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code} · {p.enabled ? `${p.percent}%` : "выключен"} ·
                  использован {p.used ?? 0}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary"
            onClick={() => {
              setPromo({ ...emptyPromo });
              setEditingCode(null);
              setMessage("");
            }}
          >
            Новый промокод
          </button>
          {promo && (
            <form
              className="record standard-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  !editingCode &&
                  data.promotions.some((p) => p.code === promo.code)
                ) {
                  setError(
                    "Этот код уже существует. Выберите его в списке для редактирования.",
                  );
                  return;
                }
                void save(
                  "promotions/" + encodeURIComponent(promo.code),
                  promo,
                );
              }}
            >
              <div className="form-two">
                <label>
                  Код
                  <input
                    required
                    maxLength={30}
                    pattern="[A-ZА-ЯЁ0-9_\-]{2,30}"
                    value={promo.code}
                    disabled={busy || !!editingCode}
                    onChange={(e) =>
                      setPromo({
                        ...promo,
                        code: e.target.value.toUpperCase().trim(),
                      })
                    }
                    placeholder="480"
                  />
                </label>
                <label>
                  Название акции
                  <input
                    required
                    maxLength={100}
                    value={promo.title}
                    onChange={(e) =>
                      setPromo({ ...promo, title: e.target.value })
                    }
                    placeholder="Фо Бо: 4 = фо, 80 = BO"
                  />
                </label>
              </div>
              <div className="form-two">
                <label>
                  Скидка, %
                  <input
                    type="number"
                    min={0}
                    max={100}
                    required
                    value={promo.percent}
                    onChange={(e) =>
                      setPromo({ ...promo, percent: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Минимальная корзина, ₽
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={promo.minSubtotal / 100}
                    onChange={(e) =>
                      setPromo({
                        ...promo,
                        minSubtotal: Math.round(Number(e.target.value) * 100),
                      })
                    }
                  />
                </label>
              </div>
              <label>
                Лимит использований (пусто — без лимита)
                <input
                  type="number"
                  min={1}
                  max={1000000}
                  value={promo.limit ?? ""}
                  onChange={(e) =>
                    setPromo({
                      ...promo,
                      limit: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </label>
              <div className="form-two">
                {(["startsAt", "endsAt"] as const).map((key) => (
                  <label key={key}>
                    {key === "startsAt" ? "Начало" : "Окончание"} (время вашего
                    устройства)
                    <input
                      type="datetime-local"
                      value={localDate(promo[key])}
                      onChange={(e) =>
                        setPromo({
                          ...promo,
                          [key]: e.target.value
                            ? new Date(e.target.value).toISOString()
                            : null,
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <fieldset className="marketing-dishes">
                <legend>
                  Блюда акции · выбрано {promo.dishIds.length || "всё меню"}
                </legend>
                {menu
                  .filter((d) => d.orderable !== false)
                  .map((d) => (
                    <label className="check-label" key={d.id}>
                      <input
                        type="checkbox"
                        checked={promo.dishIds.includes(d.id)}
                        onChange={(e) =>
                          setPromo({
                            ...promo,
                            dishIds: e.target.checked
                              ? [...promo.dishIds, d.id]
                              : promo.dishIds.filter((id) => id !== d.id),
                          })
                        }
                      />
                      {d.name}
                    </label>
                  ))}
              </fieldset>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={promo.enabled}
                  onChange={(e) =>
                    setPromo({ ...promo, enabled: e.target.checked })
                  }
                />
                Промокод включён
              </label>
              <button className="primary" disabled={busy}>
                Сохранить промокод
              </button>
            </form>
          )}
        </>
      )}
      {data && tab === "badges" && (
        <>
          <p>
            Настройте имя и пять уровней для каждого блюда. Прогресс считается
            по оплаченным завершённым заказам. Изменение порогов пересчитывает
            уровни по всей истории; выключенная ачивка скрывается, заказы
            сохраняются.
          </p>
          <label>
            Выберите ачивку
            <select
              value={rule?.dishId ?? ""}
              onChange={(e) => {
                setRule(
                  data.rules.find((r) => r.dishId === e.target.value) ?? null,
                );
                setMessage("");
              }}
            >
              <option value="">Выберите блюдо…</option>
              {data.rules.map((r) => (
                <option key={r.dishId} value={r.dishId}>
                  {menu.find((d) => d.id === r.dishId)?.name} · {r.name}
                  {r.enabled ? "" : " · скрыта"}
                </option>
              ))}
            </select>
          </label>
          {rule && (
            <form
              className="record standard-form"
              onSubmit={(e) => {
                e.preventDefault();
                void save(
                  "achievements/" + encodeURIComponent(rule.dishId),
                  rule,
                );
              }}
            >
              <label>
                Название ачивки
                <input
                  required
                  maxLength={100}
                  value={rule.name}
                  onChange={(e) => setRule({ ...rule, name: e.target.value })}
                />
              </label>
              <div className="marketing-levels">
                {rule.milestones.map((n, i) => (
                  <label key={i}>
                    Уровень {i + 1}: заказов
                    <input
                      required
                      type="number"
                      min={1}
                      max={10000}
                      value={n}
                      onChange={(e) =>
                        setRule({
                          ...rule,
                          milestones: rule.milestones.map((v, j) =>
                            i === j ? Number(e.target.value) : v,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(e) =>
                    setRule({ ...rule, enabled: e.target.checked })
                  }
                />
                Показывать ачивку
              </label>
              <button className="primary" disabled={busy}>
                Сохранить ачивку
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
