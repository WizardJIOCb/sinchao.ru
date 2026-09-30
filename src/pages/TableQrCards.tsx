import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import type { Table } from "../../shared/v2";
import "./table-qr-cards.css";

function tableUrl(table: Table) {
  return `${location.origin}/dine-in/${encodeURIComponent(table.token ?? "")}`;
}

function qrImage(url: string) {
  return QRCode.toDataURL(url, {
    width: 1200,
    margin: 4,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
}

export function TableQrActions({
  table,
  onPrint,
}: {
  table: Table;
  onPrint: () => void;
}) {
  const url = tableUrl(table);
  const [src, setSrc] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [copyStatus, setCopyStatus] = useState("");
  const [showLink, setShowLink] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc("");
    setError("");
    setCopyStatus("");
    setShowLink(false);
    void qrImage(url)
      .then((image) => {
        if (!cancelled) setSrc(image);
      })
      .catch(() => {
        if (!cancelled) setError("Не удалось создать QR-код.");
      });
    return () => {
      cancelled = true;
    };
  }, [url, attempt]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus("Ссылка скопирована");
    } catch {
      setShowLink(true);
      setCopyStatus("Выделите и скопируйте ссылку ниже.");
    }
  }

  return (
    <div className="table-qr-actions">
      {src ? (
        <img className="qr-image" src={src} alt={`QR-код: ${table.name}`} />
      ) : error ? (
        <div role="alert">
          <p className="error">{error}</p>
          <button
            type="button"
            className="secondary"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Попробовать снова
          </button>
        </div>
      ) : (
        <p role="status" className="muted">
          Создаём QR-код…
        </p>
      )}
      <div className="button-row">
        <button
          type="button"
          className="primary"
          disabled={!src || !table.active}
          onClick={onPrint}
        >
          Печатать карточку
        </button>
        {src && (
          <a
            className="table-qr-download"
            href={src}
            download={`${table.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")}-QR.png`}
          >
            Скачать PNG
          </a>
        )}
      </div>
      <div className="button-row">
        <button
          type="button"
          className="secondary"
          onClick={() => void copyLink()}
        >
          Копировать ссылку
        </button>
        <a href={url} target="_blank" rel="noreferrer">
          Открыть меню
        </a>
      </div>
      {copyStatus && (
        <p role="status" className="muted">
          {copyStatus}
        </p>
      )}
      {showLink && (
        <input
          className="table-qr-link"
          aria-label={`Ссылка на меню: ${table.name}`}
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
      {!table.active && (
        <p className="muted">
          Включите стол перед печатью и размещением карточки.
        </p>
      )}
    </div>
  );
}

type PrintCard = { table: Table; image: string };

export function TableQrPrintDialog({
  tables,
  onClose,
}: {
  tables: Table[];
  onClose: () => void;
}) {
  const [cards, setCards] = useState<PrintCard[]>([]);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [printing, setPrinting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeAction = useRef(onClose);

  useEffect(() => {
    closeAction.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.classList.add("printing-table-qr");
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeAction.current();
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href], input:not([disabled])",
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("printing-table-qr");
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setCards([]);
    setError("");
    void Promise.all(
      tables.map(async (table) => ({
        table,
        image: await qrImage(tableUrl(table)),
      })),
    )
      .then((generated) => {
        if (!cancelled) setCards(generated);
      })
      .catch(() => {
        if (!cancelled)
          setError("Не удалось подготовить карточки. Попробуйте ещё раз.");
      });
    return () => {
      cancelled = true;
    };
  }, [tables, attempt]);

  async function printCards() {
    setPrinting(true);
    setError("");
    const previousTitle = document.title;
    try {
      await document.fonts.ready;
      await Promise.all(
        Array.from(dialogRef.current?.querySelectorAll("img") ?? []).map(
          (image) => image.decode(),
        ),
      );
      document.title = `Син Чао — QR для ${tables.length === 1 ? tables[0].name : "столов"}`;
      window.print();
    } catch {
      setError("Не удалось открыть печать. Повторите попытку.");
    } finally {
      document.title = previousTitle;
      setPrinting(false);
    }
  }

  const sheets: PrintCard[][] = [];
  for (let index = 0; index < cards.length; index += 4) {
    sheets.push(cards.slice(index, index + 4));
  }

  return createPortal(
    <div
      className="table-qr-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="table-qr-print-title"
      ref={dialogRef}
    >
      <div className="table-qr-print-controls">
        <div>
          <h2 id="table-qr-print-title">Карточки «Син Чао»</h2>
          <p>
            A4 · 4 карточки на листе · масштаб 100%. Отключите колонтитулы
            браузера. Можно выбрать «Сохранить как PDF».
          </p>
          <small>
            Ссылки ведут на {location.host}. Проверьте адрес перед печатью.
          </small>
        </div>
        <div className="button-row">
          <button
            type="button"
            className="primary"
            disabled={
              cards.length !== tables.length || !cards.length || printing
            }
            onClick={() => void printCards()}
          >
            {printing ? "Готовим печать…" : "Печатать / сохранить PDF"}
          </button>
          <button
            type="button"
            className="secondary"
            ref={closeRef}
            onClick={onClose}
          >
            Закрыть
          </button>
        </div>
        {error ? (
          <div role="alert">
            <p className="error">{error}</p>
            {!cards.length && (
              <button
                type="button"
                className="secondary"
                onClick={() => setAttempt((value) => value + 1)}
              >
                Попробовать снова
              </button>
            )}
          </div>
        ) : !cards.length ? (
          <p role="status">Готовим QR-коды для {tables.length} столов…</p>
        ) : null}
      </div>
      <div className="table-qr-print-pages">
        {sheets.map((sheet, index) => (
          <div className="table-qr-print-sheet" key={index}>
            {sheet.map(({ table, image }) => (
              <article className="table-qr-print-card" key={table.id}>
                <div className="table-qr-card-brand">Син Чао</div>
                <p className="table-qr-card-caption">Вьетнамская кухня</p>
                <h3
                  className={`table-qr-card-table${table.name.length > 24 ? " long-name" : ""}`}
                >
                  {table.name}
                </h3>
                <img src={image} alt={`QR-код: ${table.name}`} />
                <p className="table-qr-card-scan">Наведите камеру телефона</p>
                <div className="table-qr-card-features">
                  <span>Меню и дозаказ</span>
                  <span>Позвать официанта</span>
                  <span>Счёт и оплата</span>
                </div>
                <p className="table-qr-card-note">
                  Для заказа и обслуживания попросите код посещения у официанта.
                </p>
                <p className="table-qr-card-host">{location.host}</p>
              </article>
            ))}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
