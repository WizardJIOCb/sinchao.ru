import { useEffect, useRef, useState } from "react";
import { api } from "./api";

async function prepare(
  file: File,
  kind: "dish" | "achievement",
): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw Error("Выберите JPG, PNG или WebP.");
  if (file.size > 10 * 1024 * 1024)
    throw Error("Выберите файл размером до 10 МБ.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw Error("Не удалось прочитать файл. Выберите исправную картинку.");
  }
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("Не удалось обработать картинку.");
    for (const size of kind === "dish" ? [1024, 768, 512] : [512]) {
      const ratio = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
      canvas.width =
        kind === "dish" ? Math.max(1, Math.round(bitmap.width * ratio)) : size;
      canvas.height =
        kind === "dish" ? Math.max(1, Math.round(bitmap.height * ratio)) : size;
      if (kind === "dish")
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      else {
        const side = Math.min(bitmap.width, bitmap.height);
        ctx.drawImage(
          bitmap,
          (bitmap.width - side) / 2,
          (bitmap.height - side) / 2,
          side,
          side,
          0,
          0,
          size,
          size,
        );
      }
      for (const quality of [0.85, 0.7, 0.5]) {
        const data = canvas.toDataURL("image/webp", quality);
        if (data.startsWith("data:image/webp;base64,") && data.length < 120000)
          return data.split(",")[1];
      }
    }
    throw Error(
      "Не удалось уменьшить картинку. Выберите более простое изображение.",
    );
  } finally {
    bitmap.close();
  }
}

export function ImageUpload({
  kind,
  onChange,
  onBusyChange,
}: {
  kind: "dish" | "achievement";
  onChange: (image: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      onBusyChange(false);
    };
  }, []);
  return (
    <div className="image-upload">
      <label>
        Загрузить с устройства
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBusy(true);
            onBusyChange(true);
            setError("");
            try {
              const base64 = await prepare(file, kind);
              if (!active.current) return;
              const result = await api<{ image: string }>(
                "/admin/images",
                "POST",
                { base64, kind },
              );
              if (active.current) onChange(result.image);
            } catch (err) {
              if (active.current)
                setError(
                  err instanceof Error
                    ? err.message
                    : "Не удалось загрузить картинку.",
                );
            } finally {
              if (active.current) {
                setBusy(false);
                onBusyChange(false);
              }
            }
          }}
        />
      </label>
      <p className="form-help">
        JPG, PNG или WebP до 10 МБ.{" "}
        {kind === "dish"
          ? "Фотография уменьшится автоматически с сохранением пропорций."
          : "В центре будет выбран квадрат, картинка уменьшится автоматически. Предпросмотр показывает круглую область."}
      </p>
      {busy && <p role="status">Загружаем картинку…</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
