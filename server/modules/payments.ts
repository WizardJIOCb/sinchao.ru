// No card data is collected. A real acquiring adapter must independently verify callbacks.
export interface PaymentProvider {
  createPayment(
    amount: number,
  ): Promise<{ status: "PENDING"; provider: string; amount: number }>;
  confirmPayment(amount: number): Promise<{ status: "PAID"; amount: number }>;
  refundPayment(amount: number): Promise<never>;
  getPaymentStatus(status: string): Promise<string>;
}
export const payOnReceipt: PaymentProvider = {
  async createPayment(amount) {
    return { status: "PENDING", provider: "PAY_ON_RECEIPT", amount };
  },
  async confirmPayment(amount) {
    return { status: "PAID", amount };
  },
  async refundPayment() {
    throw new Error("Cash refunds require staff handling.");
  },
  async getPaymentStatus(status) {
    return status;
  },
};
