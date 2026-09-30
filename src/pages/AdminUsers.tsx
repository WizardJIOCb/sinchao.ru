import { useEffect, useState } from "react";
import type { User } from "../../shared/types";
import { api } from "../api";
const roles: Record<string, string> = {
  CUSTOMER: "Гость",
  STAFF: "Оператор",
  MANAGER: "Управляющий",
  ADMIN: "Администратор",
};
export function AdminUsers({ me }: { me: User }) {
  const [data, setData] = useState<{ users: User[]; hasMore: boolean } | null>(
    null,
  );
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [offset, setOffset] = useState(0);
  const [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<{ user: User; role: string } | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    setError("");
    setData(null);
    api<{ users: User[]; hasMore: boolean }>(
      `/admin/users?q=${encodeURIComponent(query)}&offset=${offset}`,
    )
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [query, offset, attempt]);
  return (
    <div>
      <h2>Пользователи и права</h2>
      <p>
        Сначала сотрудник регистрируется на сайте, затем найдите его по имени
        или email и назначьте роль.
      </p>
      <ul>
        <li>
          <b>Оператор:</b> заказы, оплата, брони, обслуживание столов и гостей.
        </li>
        <li>
          <b>Управляющий:</b> также меню, настройки, схема зала, акции и ачивки.
        </li>
        <li>
          <b>Администратор:</b> все возможности, включая назначение ролей.
        </li>
      </ul>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(search.trim());
          setOffset(0);
          setAttempt(attempt + 1);
          setPending(null);
        }}
      >
        <label>
          Поиск пользователя
          <input
            value={search}
            maxLength={100}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Имя или email"
          />
        </label>
        <button className="secondary">Найти</button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {pending && (
        <div className="admin-confirm" role="alert">
          <p>
            Изменить роль{" "}
            <b>
              {pending.user.name} ({pending.user.email})
            </b>
            : {roles[pending.user.role]} → <b>{roles[pending.role]}</b>?
          </p>
          <div className="button-row">
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                setMessage("");
                try {
                  await api(`/admin/users/${pending.user.id}/role`, "PATCH", {
                    role: pending.role,
                    expectedRole: pending.user.role,
                  });
                  setMessage(
                    "Роль изменена. Новые права применяются сразу; пользователю достаточно обновить страницу.",
                  );
                  setPending(null);
                  setAttempt(attempt + 1);
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Подтвердить изменение роли
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setPending(null)}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
      {!data ? (
        <p>Загружаем пользователей…</p>
      ) : (
        <>
          {!data.users.length && <p>Пользователь не найден.</p>}
          <div className="records">
            {data.users.map((u) => (
              <article className="record user-role-row" key={u.id}>
                <div>
                  <h3>
                    {u.name}
                    {u.id === me.id ? " · это вы" : ""}
                  </h3>
                  <p>{u.email}</p>
                  <small>{roles[u.role]}</small>
                </div>
                <label>
                  Роль для {u.name}
                  <select
                    value={u.role}
                    disabled={busy || u.id === me.id}
                    onChange={(e) => {
                      setPending({ user: u, role: e.target.value });
                      setMessage("");
                    }}
                  >
                    {Object.entries(roles).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </article>
            ))}
          </div>
          <div className="button-row">
            <button
              className="secondary"
              disabled={!offset}
              onClick={() => {
                setOffset(offset - 50);
                setPending(null);
              }}
            >
              Назад
            </button>
            <button
              className="secondary"
              disabled={!data.hasMore}
              onClick={() => {
                setOffset(offset + 50);
                setPending(null);
              }}
            >
              Далее
            </button>
          </div>
        </>
      )}
    </div>
  );
}
