import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import type { Discovery, DishAchievement } from "../shared/v2";
import { api } from "./api";
import { DishPicture } from "./DishPicture";

export function DishAchievementCollection({
  entries,
}: {
  entries: DishAchievement[];
}) {
  const [expanded, setExpanded] = useState(false);
  const earned = entries.filter((a) => a.level > 0).length;
  return (
    <section className="dish-achievements" aria-label="Ачивки по блюдам">
      <div className="v2-heading">
        <Trophy aria-hidden="true" />
        <div>
          <div className="eyebrow">ВАША КОЛЛЕКЦИЯ ВКУСОВ</div>
          <h2>Вкусно. Ещё вкуснее. Легендарно.</h2>
          <p>
            Открыто {earned} из {entries.length} ачивок. У любимого блюда — своя
            история.
          </p>
        </div>
      </div>
      <p className="form-help">
        Уровни растут с оплаченными и завершёнными заказами. Один заказ — один
        шаг по каждому блюду, независимо от числа порций. Прошлые заказы тоже
        учитываются.
      </p>
      <div className="dish-achievement-grid">
        {(expanded ? entries : entries.slice(0, 6)).map((a) => (
          <article
            key={a.dish.id}
            className={`dish-badge ${a.level ? "unlocked" : "locked"}`}
          >
            <div className="dish-badge-top">
              <div className="dish-badge-picture">
                <DishPicture dish={a.dish} />
              </div>
              <span className="dish-badge-level">
                {a.level ? `Уровень ${a.level} / 5` : "Не открыта"}
              </span>
            </div>
            <h3>{a.name}</h3>
            <a
              className="dish-badge-name"
              href={"/menu/" + encodeURIComponent(a.dish.id)}
            >
              {a.dish.name}
            </a>
            <div className="dish-badge-rank">{a.rank}</div>
            <div className="dish-badge-stars" aria-hidden="true">
              {a.milestones.map((target, i) => (
                <span key={target} className={i < a.level ? "lit" : ""}>
                  ★
                </span>
              ))}
            </div>
            <small>Уровни: {a.milestones.join(" · ")} заказов</small>
            <progress
              aria-label={`${a.name}: заказов до следующего уровня`}
              value={Math.min(a.orders, a.nextTarget ?? a.milestones[4])}
              max={a.nextTarget ?? a.milestones[4]}
            />
            <small>
              {a.nextTarget
                ? `${a.orders} / ${a.nextTarget} · До следующего уровня: ${a.nextTarget - a.orders}`
                : `Высший уровень! Заказов с блюдом: ${a.orders}`}
            </small>
          </article>
        ))}
      </div>
      {entries.length > 6 && (
        <button
          className="secondary"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          {expanded
            ? "Свернуть коллекцию"
            : `Вся коллекция · ${entries.length}`}
        </button>
      )}
    </section>
  );
}

export function ProfileAchievements({ userId }: { userId: string }) {
  const [entries, setEntries] = useState<DishAchievement[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setEntries(null);
    setError("");
    api<Discovery>("/v2/discovery")
      .then((data) => {
        if (active) setEntries(data.dishAchievements);
      })
      .catch(() => {
        if (active) setError("Не получилось загрузить ачивки.");
      });
    return () => {
      active = false;
    };
  }, [userId, attempt]);
  if (error)
    return (
      <div className="record" role="alert">
        {error}{" "}
        <button className="text-button" onClick={() => setAttempt(attempt + 1)}>
          Попробовать снова
        </button>
      </div>
    );
  if (!entries) return <p role="status">Собираем вашу коллекцию вкусов…</p>;
  return <DishAchievementCollection entries={entries} />;
}
