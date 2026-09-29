export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  key?: string,
): Promise<T> {
  const res = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: {
      ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let payload;
  try {
    payload = await res.json();
  } catch {
    throw new Error("Сервис временно недоступен. Попробуйте ещё раз.");
  }
  if (!res.ok || payload.error)
    throw new Error(payload.error?.message ?? "Не удалось выполнить запрос.");
  return payload.data;
}
export const money = (n: number) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(n / 100);
export const track = (event: string) => {
  void api("/analytics", "POST", { event }).catch(() => {});
};
