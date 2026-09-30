export type Promotion = {
  code: string;
  title: string;
  percent: number;
  kind?: "percent" | "fixed";
  amount?: number;
  registrationGift?: boolean;
  requiresGrant?: boolean;
  dishIds: string[];
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
  limit: number | null;
  minSubtotal: number;
  used?: number;
};
export type GrantedPromotion = Promotion & {
  usedByUser: boolean;
  available: boolean;
};
export type GeneralAchievementRule = {
  image?: string | null;
  id: string;
  name: string;
  enabled: boolean;
  milestones: number[];
};
export type GeneralAchievement = {
  image?: string | null;
  id: string;
  name: string;
  icon: string;
  description: string;
  milestones: number[];
  progress: number;
  level: number;
  rank: string;
  nextTarget: number | null;
};
export type AchievementRule = {
  image?: string | null;
  dishId: string;
  name: string;
  enabled: boolean;
  milestones: number[];
};
