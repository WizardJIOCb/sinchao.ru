import { useEffect, useState } from "react";
import { Share2, Check } from "lucide-react";
import { menuResultsPath, type MenuFilters } from "../shared/menu-search";

export function ShareMenuSearch({ query, category }: MenuFilters) {
  const url = new URL(menuResultsPath({ query, category }), location.origin)
    .href;
  const [copiedUrl, setCopiedUrl] = useState("");
  const [fallback, setFallback] = useState(false);
  const copied = copiedUrl === url;
  useEffect(() => {
    if (!copiedUrl) return;
    const timer = setTimeout(() => setCopiedUrl(""), 4000);
    return () => clearTimeout(timer);
  }, [copiedUrl]);
  return (
    <div className="menu-search-share">
      <button
        type="button"
        className="secondary"
        aria-label="Поделиться результатами"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopiedUrl(url);
            setFallback(false);
          } catch {
            setFallback(true);
          }
        }}
      >
        {copied ? <Check size={18} /> : <Share2 size={18} />}
        {copied ? "Ссылка скопирована" : "Поделиться результатами"}
      </button>
      <span className="sr-only" role="status">
        {copied ? "Ссылка на результаты поиска скопирована" : ""}
      </span>
      {fallback && (
        <label>
          Скопируйте ссылку из поля
          <input
            aria-label="Ссылка на результаты поиска"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
      )}
    </div>
  );
}
