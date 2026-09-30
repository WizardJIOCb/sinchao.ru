import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";
import { menuPages } from "./menu-pages";
import "./source-menu.css";

function PageImage({
  page,
  index,
}: {
  page: (typeof menuPages)[number];
  index: number;
}) {
  return (
    <span
      className="source-page-window"
      style={{ aspectRatio: `${page.cropWidth} / ${page.cropHeight}` }}
    >
      <img
        src={page.src}
        alt={`Страница меню ${index + 1}`}
        loading="lazy"
        style={{
          width: `${(page.width / page.cropWidth) * 100}%`,
          height: `${(page.height / page.cropHeight) * 100}%`,
          left: `${(-page.x / page.cropWidth) * 100}%`,
          top: `${(-page.y / page.cropHeight) * 100}%`,
        }}
      />
    </span>
  );
}
export function SourceMenuPromo({ open }: { open: () => void }) {
  return (
    <button className="source-menu-promo" onClick={open}>
      <span className="source-menu-previews" aria-hidden="true">
        {menuPages.slice(0, 2).map((page, i) => (
          <PageImage key={page.src} page={page} index={i} />
        ))}
      </span>
      <span className="source-menu-promo-copy">
        <span className="eyebrow">
          <BookOpen size={16} /> КАК ЗА СТОЛИКОМ
        </span>
        <strong>Меню на фотографиях</strong>
        <span>Полистайте {menuPages.length} страниц ресторанного меню</span>
      </span>
      <span className="source-menu-promo-action">
        Открыть меню <ArrowRight size={19} />
      </span>
    </button>
  );
}
export function SourceMenuGallery() {
  const [selected, setSelected] = useState<number | null>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    backButton.current?.focus();
  }, [selected]);
  return selected === null ? (
    <div className="source-menu-gallery">
      {menuPages.map((page, i) => (
        <button
          key={page.src}
          type="button"
          aria-label={`Увеличить страницу ${i + 1}`}
          onClick={() => setSelected(i)}
        >
          <PageImage page={page} index={i} />
        </button>
      ))}
    </div>
  ) : (
    <div className="source-menu-full">
      <div className="button-row">
        <button
          ref={backButton}
          className="secondary"
          onClick={() => setSelected(null)}
        >
          <ArrowLeft size={16} /> Все страницы
        </button>
        <a href={menuPages[selected].src} target="_blank" rel="noreferrer">
          Открыть оригинал
        </a>
      </div>
      <PageImage page={menuPages[selected]} index={selected} />
      <div className="button-row source-page-navigation">
        <button
          className="secondary"
          disabled={selected === 0}
          onClick={() => setSelected(selected - 1)}
        >
          ← Назад
        </button>
        <span>
          {selected + 1} / {menuPages.length}
        </span>
        <button
          className="secondary"
          disabled={selected === menuPages.length - 1}
          onClick={() => setSelected(selected + 1)}
        >
          Далее →
        </button>
      </div>
    </div>
  );
}
