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
export type AchievementRule = {
  dishId: string;
  name: string;
  enabled: boolean;
  milestones: number[];
};
