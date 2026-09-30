import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import type { Discovery, DishAchievement } from "../shared/v2";
import { api } from "./api";
import { DishPicture } from "./DishPicture";
import { isBeverage } from "../shared/beverages";
import type { GeneralAchievement } from "../shared/marketing";

export function AchievementArt({ id }: { id: string }) {
  return (
    <img
      className="achievement-art"
      src={`/images/achievements/${id === "variety" ? "categories" : id}.webp`}
      alt=""
      width={128}
      height={128}
      loading="lazy"
    />
  );
}

export function JourneyAchievementCollection({
  entries,
}: {
  entries: Discovery["achievements"];
}) {
  return (
    <section
      className="achievement-grid journey-achievements"
      aria-label="Ачивки Food Journey"
    >
      {entries.map((a) => (
        <article
          key={a.id}
          className={`achievement ${a.earned ? "earned" : ""}`}
        >
          <AchievementArt id={a.id} />
          <h3>{a.name}</h3>
          <p>{a.description}</p>
          <progress aria-label={a.name} value={a.progress} max={a.target} />
          <small>
            {a.progress} / {a.target}
            {a.earned ? " · Открыта!" : ""}
          </small>
        </article>
      ))}
    </section>
  );
}

export function GeneralAchievementCollection({
  entries,
}: {
  entries: GeneralAchievement[];
}) {
  if (!entries.length) return null;
  return (
    <section className="dish-achievements" aria-label="Общие ачивки">
      <div className="eyebrow">ВАШИ РЕСТОРАННЫЕ СУПЕРСИЛЫ</div>
      <h2>За вкусные привычки — новые звания</h2>
      <div className="dish-achievement-grid">
        {entries.map((a) => (
          <article
            key={a.id}
            className={`dish-badge general-badge ${a.level ? "unlocked" : "locked"}`}
          >
            <div className="dish-badge-top">
              <AchievementArt id={a.id} />
              <span className="dish-badge-level">
                {a.level ? `Уровень ${a.level} / 5` : "Не открыта"}
              </span>
            </div>
            <h3>{a.name}</h3>
            <p>{a.description}</p>
            <div className="dish-badge-rank">{a.rank}</div>
            <div className="dish-badge-stars" aria-hidden="true">
              {a.milestones.map((n, i) => (
                <span key={n} className={i < a.level ? "lit" : ""}>
                  ★
                </span>
              ))}
            </div>
            <small>Уровни: {a.milestones.join(" · ")}</small>
            <progress
              aria-label={a.name}
              value={Math.min(a.progress, a.nextTarget ?? a.milestones[4])}
              max={a.nextTarget ?? a.milestones[4]}
            />
            <small>
              {a.nextTarget
                ? `${a.progress} / ${a.nextTarget} · До следующего уровня: ${a.nextTarget - a.progress}`
                : `Высший уровень! Всего: ${a.progress}`}
            </small>
          </article>
        ))}
      </div>
    </section>
  );
}

export function DishAchievementCollection({
  entries,
}: {
  entries: DishAchievement[];
}) {
  return (
    <>
      <TasteCollection entries={entries.filter((a) => !isBeverage(a.dish))} />
      <TasteCollection
        entries={entries.filter((a) => isBeverage(a.dish))}
        beverages
      />
    </>
  );
}

function TasteCollection({
  entries,
  beverages = false,
}: {
  entries: DishAchievement[];
  beverages?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const earned = entries.filter((a) => a.level > 0).length;
  return (
    <section
      className="dish-achievements"
      aria-label={beverages ? "Ачивки по напиткам" : "Ачивки по блюдам"}
    >
      <div className="v2-heading">
        <Trophy aria-hidden="true" />
        <div>
          <div className="eyebrow">
            {beverages ? "КОЛЛЕКЦИЯ НАСТРОЕНИЯ" : "ВАША КОЛЛЕКЦИЯ ВКУСОВ"}
          </div>
          <h2>
            {beverages
              ? "Глоток — и своя история."
              : "Вкусно. Ещё вкуснее. Легендарно."}
          </h2>
          <p>
            Открыто {earned} из {entries.length} ачивок. У любимого{" "}
            {beverages ? "напитка" : "блюда"} — своя история.
          </p>
        </div>
      </div>
      <p className="form-help">
        Уровни растут с оплаченными и завершёнными заказами. Один заказ — один
        шаг по каждой позиции, независимо от числа порций. Прошлые заказы тоже
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
            {a.dish.orderable === false && (
              <p className="form-help">
                Только в ресторане. Прогресс появится, когда эта позиция будет
                учтена в оплаченном и завершённом заказе.
              </p>
            )}
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
                : `Высший уровень! Заказов с позицией: ${a.orders}`}
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
            : `${beverages ? "Все напитки" : "Вся коллекция"} · ${entries.length}`}
        </button>
      )}
    </section>
  );
}

export function ProfileAchievements({ userId }: { userId: string }) {
  const [general, setGeneral] = useState<GeneralAchievement[]>([]);
  const [entries, setEntries] = useState<DishAchievement[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setEntries(null);
    setError("");
    api<Discovery>("/v2/discovery")
      .then((data) => {
        if (active) {
          setEntries(data.dishAchievements);
          setGeneral(data.generalAchievements);
        }
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
  return (
    <>
      <GeneralAchievementCollection entries={general} />
      <DishAchievementCollection entries={entries} />
    </>
  );
}
