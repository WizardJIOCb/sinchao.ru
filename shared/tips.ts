export type TipChoice = { kind: "none" | "percent" | "amount"; value: number };
export const noTip: TipChoice = { kind: "none", value: 0 };
// Money is always integer kopecks. Delivery and gratuity are not part of base.
export function calculateTip(base: number, choice: TipChoice = noTip) {
  if (base <= 0 || choice.kind === "none") return 0;
  return choice.kind === "percent"
    ? Math.round((base * choice.value) / 100)
    : choice.value;
}
export function splitTip(amount: number, count: number) {
  return Array.from(
    { length: count },
    (_, i) => Math.floor(amount / count) + (i < amount % count ? 1 : 0),
  );
}
