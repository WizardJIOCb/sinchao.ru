// Vite dev pages must not be controlled by the production worker.
const production = (import.meta as ImportMeta & { env: { PROD: boolean } }).env.PROD;
if (production && "serviceWorker" in navigator && window.isSecureContext) {
  const register = () => {
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch((error: unknown) => {
      console.warn("Не удалось включить экран без сети.", error);
    });
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
