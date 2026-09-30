import type {
  CartItem,
  Config,
  Dish,
  Fulfillment,
  Quote,
} from "../../shared/types";
import { fail, localNow } from "../lib";
import type { Promotion } from "../../shared/marketing";
import { calculateTip, type TipChoice } from "../../shared/tips";
export function priceCart(
  cart: CartItem[],
  menu: Dish[],
  cfg: Config,
  options: {
    fulfillment: Fulfillment;
    zoneId: string;
    promo: string;
    points: number;
    tip?: TipChoice;
  },
  loyaltyBalance: number,
  enforceMinimum = true,
  promotion?: Promotion,
): Quote {
  if (!cart.length) fail(400, "EMPTY_CART", "Добавьте блюда в корзину.");
  const items = cart.map((item) => {
    const dish = menu.find((d) => d.id === item.dishId);
    if (!dish?.available || dish.orderable === false)
      fail(
        409,
        "DISH_UNAVAILABLE",
        "Блюдо больше не доступно. Обновите корзину.",
      );
    if (
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 20
    )
      fail(400, "INVALID_QUANTITY", "Проверьте количество блюда.");
    if (new Set(item.modifiers).size !== item.modifiers.length)
      fail(400, "INVALID_MODIFIERS", "Добавка выбрана дважды.");
    const all = dish.modifiers.flatMap((g) => g.options);
    const selected = item.modifiers.map((id) => {
      const m = all.find((m) => m.id === id);
      if (!m?.available)
        fail(409, "MODIFIER_UNAVAILABLE", "Выбранная добавка недоступна.");
      return m;
    });
    for (const group of dish.modifiers) {
      const count = selected.filter((m) =>
        group.options.some((o) => o.id === m.id),
      ).length;
      if (count < group.min || count > group.max)
        fail(400, "MODIFIER_COUNT", `Проверьте выбор: ${group.name}.`);
    }
    const unitPrice = dish.price + selected.reduce((s, m) => s + m.price, 0);
    return {
      ...item,
      name: dish.name,
      image: dish.image,
      unitPrice,
      lineTotal: unitPrice * item.quantity,
      modifierNames: selected.map((m) => m.name),
    };
  });
  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  let discount = 0;
  if (options.promo) {
    if (promotion) {
      if (subtotal < promotion.minSubtotal)
        fail(
          400,
          "PROMO_MINIMUM",
          `Промокод действует от ${promotion.minSubtotal / 100} ₽.`,
        );
      const eligible = items
        .filter(
          (i) =>
            !promotion.dishIds.length || promotion.dishIds.includes(i.dishId),
        )
        .reduce((sum, i) => sum + i.lineTotal, 0);
      if (!eligible)
        fail(
          400,
          "PROMO_DISH",
          "Добавьте в корзину блюдо, на которое действует промокод.",
        );
      discount = Math.floor((eligible * promotion.percent) / 100);
    } else {
      if (
        !cfg.promo.enabled ||
        options.promo.trim().toUpperCase() !== cfg.promo.code.toUpperCase()
      )
        fail(
          400,
          "INVALID_PROMO",
          "Промокод не найден или больше не действует.",
        );
      discount = Math.floor((subtotal * cfg.promo.percent) / 100);
    }
  }
  if (options.points > loyaltyBalance)
    fail(400, "INSUFFICIENT_POINTS", "Недостаточно бонусов.");
  const loyaltyDiscount = options.points * 100;
  if (
    loyaltyDiscount >
    Math.floor(((subtotal - discount) * cfg.redemptionPercent) / 100)
  )
    fail(
      400,
      "POINTS_LIMIT",
      `Бонусами можно оплатить до ${cfg.redemptionPercent}% стоимости блюд.`,
    );
  let deliveryFee = 0;
  if (options.fulfillment === "DELIVERY") {
    const zone = cfg.zones.find((z) => z.id === options.zoneId);
    if (!zone) fail(400, "DELIVERY_ZONE", "Выберите район доставки.");
    if (enforceMinimum && subtotal < zone.minimum)
      fail(
        400,
        "MINIMUM_ORDER",
        `Минимальная сумма доставки: ${zone.minimum / 100} ₽.`,
      );
    deliveryFee = zone.fee;
  }
  const tip = calculateTip(subtotal - discount - loyaltyDiscount, options.tip);
  return {
    items,
    subtotal,
    discount,
    tip,
    ...(options.promo.trim()
      ? { promoCode: options.promo.trim().toUpperCase() }
      : {}),
    loyaltyDiscount,
    deliveryFee,
    serviceFee: 0,
    tax: 0,
    total: subtotal - discount - loyaltyDiscount + deliveryFee + tip,
  };
}
export function fulfillmentTimes(cfg: Config) {
  const now = localNow(cfg);
  const times: string[] = [];
  for (
    let m = cfg.openHour * 60;
    m <= cfg.closeHour * 60 - cfg.leadMinutes;
    m += 30
  )
    if (m >= now.minutes + cfg.leadMinutes)
      times.push(
        `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
      );
  return {
    date: now.date,
    times,
    asap:
      now.minutes >= cfg.openHour * 60 &&
      now.minutes + cfg.leadMinutes <= cfg.closeHour * 60,
  };
}
export function validateFulfillment(
  cfg: Config,
  input: {
    fulfillment: Fulfillment;
    zoneId: string;
    address: string;
    time: string;
  },
) {
  const slots = fulfillmentTimes(cfg);
  if (input.time === "ASAP" ? !slots.asap : !slots.times.includes(input.time))
    fail(
      400,
      "TIME_UNAVAILABLE",
      "Выберите доступное время в часы работы ресторана.",
    );
  if (input.fulfillment === "DELIVERY") {
    const zone = cfg.zones.find((z) => z.id === input.zoneId);
    if (!zone || input.address.trim().length < 8)
      fail(400, "ADDRESS_REQUIRED", "Укажите улицу, дом и квартиру.");
    if (
      !zone.streets.some((s) =>
        input.address
          .toLocaleLowerCase("ru")
          .includes(s.toLocaleLowerCase("ru")),
      )
    )
      fail(
        400,
        "OUTSIDE_ZONE",
        "Адрес не входит в выбранную зону доставки. Выберите самовывоз или уточните адрес.",
      );
  }
}
