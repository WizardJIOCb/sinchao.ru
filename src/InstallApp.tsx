import { useEffect, useRef, useState } from "react";
import { Smartphone } from "lucide-react";
import { Modal } from "./Modal";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function inAppMode() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export function InstallApp() {
  const [installed, setInstalled] = useState(inAppMode);
  const [helpOpen, setHelpOpen] = useState(false);
  const [prompting, setPrompting] = useState(false);
  const [message, setMessage] = useState("");
  const pendingPrompt = useRef<InstallPromptEvent | null>(null);
  const promptingRef = useRef(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const fullscreen = window.matchMedia("(display-mode: fullscreen)");
    const onPrompt = (event: Event) => {
      event.preventDefault();
      pendingPrompt.current = event as InstallPromptEvent;
    };
    const onInstalled = () => {
      pendingPrompt.current = null;
      setInstalled(true);
      setHelpOpen(false);
    };
    const onModeChange = () => {
      if (inAppMode()) onInstalled();
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    standalone.addEventListener("change", onModeChange);
    fullscreen.addEventListener("change", onModeChange);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      standalone.removeEventListener("change", onModeChange);
      fullscreen.removeEventListener("change", onModeChange);
    };
  }, []);

  async function install() {
    if (promptingRef.current) return;
    const event = pendingPrompt.current;
    if (!event) {
      setHelpOpen(true);
      return;
    }

    // A browser install prompt may be used only once, even after dismissal.
    pendingPrompt.current = null;
    promptingRef.current = true;
    setPrompting(true);
    setMessage("");
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === "dismissed") {
        setMessage("Установка отменена. Можно вернуться к ней позже через меню браузера.");
      }
    } catch {
      setMessage("Браузер не смог открыть установку. Добавьте приложение через его меню.");
      setHelpOpen(true);
    } finally {
      promptingRef.current = false;
      setPrompting(false);
    }
  }

  if (installed) return null;

  return (
    <>
      <button
        type="button"
        className="install-app-button"
        aria-label="Установить приложение"
        title="Установить приложение"
        aria-busy={prompting}
        disabled={prompting}
        onClick={install}
      >
        <Smartphone size={21} aria-hidden="true" />
        <span>Установить</span>
      </button>
      {helpOpen && (
        <Modal title="Приложение на телефоне" onClose={() => setHelpOpen(false)}>
          <div className="install-app-help">
            <p>
              Добавьте «Син Чао» на главный экран — меню и заказы будут открываться
              по иконке приложения.
            </p>
            {message && <p className="install-app-message" role="status">{message}</p>}
            <section aria-labelledby="install-android">
              <h3 id="install-android">Android · Chrome</h3>
              <p>
                Откройте меню <strong>⋮</strong> и выберите
                {" "}<strong>«Установить приложение»</strong> или
                {" "}<strong>«На главный экран»</strong>. Подтвердите установку.
              </p>
            </section>
            <section aria-labelledby="install-ios">
              <h3 id="install-ios">iPhone · Safari</h3>
              <p>
                Нажмите <strong>«Поделиться»</strong>, затем
                {" "}<strong>«На экран Домой»</strong> и <strong>«Добавить»</strong>.
                Если есть переключатель «Открывать как веб-приложение», включите его.
              </p>
            </section>
            <p className="install-app-note">
              Если вы открыли сайт внутри Telegram или другого приложения,
              перейдите в Chrome или Safari. Для актуального меню и оформления
              заказов нужен интернет.
            </p>
            <button
              type="button"
              className="primary install-app-done"
              data-initial-focus
              onClick={() => setHelpOpen(false)}
            >
              Понятно
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
