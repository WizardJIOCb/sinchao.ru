import type { Dish, Order, Quote } from "./types";
import type { ReservationTime } from "./reservation-time";
import type { TipChoice } from "./tips";
import type { GeneralAchievement } from "./marketing";
export type Table = {
  id: string;
  name: string;
  seats: number;
  x: number;
  y: number;
  zone: string;
  shape: "round" | "square" | "long";
  active: boolean;
  available?: boolean;
  token?: string;
};
export type V2Settings = {
  floorPlanVerified: boolean;
  referralPoints: number;
  referralsEnabled: boolean;
  giftValidityDays: number;
};
export type Floor = { tables: Table[]; verified: boolean };
export type Share = {
  tip: number;
  giftPaid: number;
  id: string;
  position: number;
  amount: number;
  paid: boolean;
};
export type Visit = {
  tip: number;
  tipChoice: TipChoice;
  tipVersion: number;
  foodTotal: number;
  reservation: ReservationTime | null;
  id: string;
  tableName: string;
  tableId: string;
  status: string;
  joinCode?: string;
  orders: Order[];
  shares: Share[];
  total: number;
  paid: number;
  calls: { id: string; kind: string; status: string }[];
};
export type EventInfo = {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  capacity: number;
  active: boolean;
  reserved: number;
  myGuests: number;
};
export type Gift = {
  id: string;
  code?: string;
  amount: number;
  balance: number;
  status: string;
  message: string;
  expires_at: string | null;
};
export type Preferences = {
  favorites: string[];
  maxSpice: number;
  avoidAllergens: string[];
};
export type DishAchievement = {
  dish: Dish;
  name: string;
  orders: number;
  awardedProgress: number;
  level: number;
  rank: string;
  nextTarget: number | null;
  milestones: number[];
};
export type Discovery = {
  generalAchievements: GeneralAchievement[];
  dishAchievements: DishAchievement[];
  preferences: Preferences;
  recommendations: { dish: Dish; reason: string }[];
  journey: {
    region: string;
    dishes: { id: string; name: string; tried: boolean }[];
    tried: number;
  }[];
  achievements: {
    id: string;
    name: string;
    description: string;
    progress: number;
    target: number;
    earned: boolean;
  }[];
  completedOrders: number;
};
export type ReferralInfo = {
  code: string;
  invited: number;
  rewarded: number;
  points: number;
  enabled: boolean;
  applied: boolean;
};
export type Preorder = Quote;
