export type Fulfillment = "DELIVERY" | "PICKUP" | "DINE_IN";
export type Modifier = {
  id: string;
  name: string;
  price: number;
  available: boolean;
};
export type ModifierGroup = {
  id: string;
  name: string;
  min: number;
  max: number;
  options: Modifier[];
};
export type Dish = {
  id: string;
  categoryId: string;
  name: string;
  localizedName: string;
  description: string;
  ingredients: string[];
  price: number;
  portion: string;
  image: string;
  imageCrop?: {
    x: number;
    y: number;
    width: number;
    height: number;
    sourceWidth: number;
    sourceHeight: number;
  };
  orderable?: boolean;
  allergens: string[];
  tags: string[];
  spice: number;
  available: boolean;
  featured: boolean;
  region: string;
  modifiers: ModifierGroup[];
};
export type Category = { id: string; name: string; subtitle: string };
export type Config = {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  timezone: string;
  currency: string;
  demo: boolean;
  orderingEnabled: boolean;
  openHour: number;
  closeHour: number;
  leadMinutes: number;
  deliveryEta: string;
  pickupEta: string;
  zones: {
    id: string;
    name: string;
    fee: number;
    minimum: number;
    streets: string[];
  }[];
  seating: string[];
  capacity: number;
  reservationMinutes: number;
  bookingDays: number;
  maxGuests: number;
  loyaltyPercent: number;
  redemptionPercent: number;
  promo: { code: string; percent: number; enabled: boolean };
  heroImage: string;
  menuVerified?: boolean;
  logoImage?: string;
  contactImage?: string;
  mapUrl?: string;
  promoImage?: string;
};
export type CartItem = {
  id: string;
  dishId: string;
  quantity: number;
  modifiers: string[];
  notes: string;
};
export type PricedItem = CartItem & {
  name: string;
  image: string;
  unitPrice: number;
  lineTotal: number;
  modifierNames: string[];
};
export type Quote = {
  tip?: number;
  promoCode?: string;
  items: PricedItem[];
  subtotal: number;
  discount: number;
  loyaltyDiscount: number;
  deliveryFee: number;
  serviceFee: number;
  tax: number;
  total: number;
};
export type User = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
};
export type Order = Quote & {
  visitId?: string | null;
  giftPaid?: number;
  tableName?: string;
  id: string;
  number: number;
  status: string;
  fulfillment: Fulfillment;
  paymentStatus: string;
  contact: {
    name: string;
    phone: string;
    address: string;
    zoneId: string;
    time: string;
    notes: string;
  };
  createdAt: string;
};
export type Reservation = {
  endTime: string;
  timezone: string;
  tableId?: string | null;
  tableName?: string;
  preorder?: Quote | null;
  id: string;
  date: string;
  time: string;
  partySize: number;
  seating: string;
  notes: string;
  name: string;
  phone: string;
  status: string;
  createdAt: string;
};
export const orderLabels: Record<string, string> = {
  CREATED: "Заказ получен",
  PAYMENT_PENDING: "Ожидает оплаты",
  PAID: "Оплачен",
  CONFIRMED: "Подтверждён",
  PREPARING: "Готовим",
  READY: "Готов к выдаче",
  OUT_FOR_DELIVERY: "У курьера",
  DELIVERED: "Доставлен",
  COMPLETED: "Завершён",
  CANCELLED: "Отменён",
};
