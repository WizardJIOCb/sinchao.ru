import { useState, type ReactNode } from "react";
import { ImageUpload } from "../ImageUpload";
import "./achievement-image-editor.css";

export function AchievementImageEditor({
  image,
  fallback,
  onChange,
  onBusyChange,
}: {
  image?: string | null;
  fallback: ReactNode;
  onChange: (image: string | null) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <fieldset className="achievement-image-editor">
      <legend>Картинка ачивки</legend>
      <div className="achievement-image-layout">
        <div className="achievement-image-preview">
          {image ? (
            <img src={image} alt="Предпросмотр картинки ачивки" />
          ) : (
            fallback
          )}
        </div>
        <div>
          <ImageUpload
            kind="achievement"
            onChange={onChange}
            onBusyChange={(value) => {
              setBusy(value);
              onBusyChange(value);
            }}
          />
          {image && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => onChange(null)}
            >
              Вернуть стандартную картинку
            </button>
          )}
          <p className="form-help">
            Чтобы применить картинку, сохраните ачивку кнопкой ниже.
          </p>
        </div>
      </div>
    </fieldset>
  );
}
