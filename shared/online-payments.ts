export type OnlinePaymentMethod = "bank_card" | "sbp";
export type OnlinePaymentStatus =
  "CREATING" | "PENDING" | "WAITING_FOR_CAPTURE" | "SUCCEEDED" | "CANCELED";

export interface OnlinePaymentConfig {
  available: boolean;
  provider: "yookassa";
  methods: OnlinePaymentMethod[];
  message: string;
}

export interface OnlinePaymentView {
  id: string;
  visitId: string;
  shareId: string;
  amount: number;
  method: OnlinePaymentMethod;
  status: OnlinePaymentStatus;
  confirmationUrl: string | null;
}

export const activeOnlinePayment = (status: OnlinePaymentStatus) =>
  status === "CREATING" ||
  status === "PENDING" ||
  status === "WAITING_FOR_CAPTURE";
