export type Promotion = {
  code: string;
  title: string;
  percent: number;
  dishIds: string[];
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
  limit: number | null;
  minSubtotal: number;
  used?: number;
};
export type GeneralAchievementRule = {
  id: string;
  name: string;
  enabled: boolean;
  milestones: number[];
};
export type GeneralAchievement = {
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
  dishId: string;
  name: string;
  enabled: boolean;
  milestones: number[];
};
