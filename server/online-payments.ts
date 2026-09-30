import { z } from "zod";
import type { DB } from "./db";
import { audit, fail, notify } from "./lib";
import type {
  OnlinePaymentConfig,
  OnlinePaymentMethod,
  OnlinePaymentStatus,
  OnlinePaymentView,
} from "../shared/online-payments";

type Environment = Record<string, string | undefined>;
export interface YooKassaSettings {
  shopId: string;
  secretKey: string;
  origin: string;
  testMode?: boolean;
}

export function yooKassaSettings(
  env: Environment = process.env,
): YooKassaSettings | null {
  if (
    env.YOOKASSA_ENABLED !== "true" ||
    env.YOOKASSA_RECEIPT_MODE !== "external"
  )
    return null;
  const shopId = env.YOOKASSA_SHOP_ID?.trim();
  const secretKey = env.YOOKASSA_SECRET_KEY?.trim();
  if (!shopId || !/^\d+$/.test(shopId) || !secretKey || !env.APP_ORIGIN)
    return null;
  try {
    const origin = new URL(env.APP_ORIGIN);
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    )
      return null;
    const testMode = env.YOOKASSA_TEST_MODE === "true";
    // A sandbox payment must never pay a real restaurant bill.
    if (
      testMode &&
      !new URL(env.DATABASE_URL ?? "http://invalid").pathname.endsWith("_test")
    )
      return null;
    return { shopId, secretKey, origin: origin.origin, testMode };
  } catch {
    return null;
  }
}

export function onlinePaymentConfig(
  env: Environment = process.env,
): OnlinePaymentConfig {
  const available = Boolean(yooKassaSettings(env));
  return {
    available,
    provider: "yookassa",
    methods: available ? ["bank_card", "sbp"] : [],
    message: available
      ? yooKassaSettings(env)?.testMode
        ? "Тестовая оплата ЮKassa: деньги не списываются."
        : "Оплата картой или через СБП на защищённой странице ЮKassa."
      : "Онлайн-оплата готовится к подключению. Оплатите счёт официанту.",
  };
}

export function requireYooKassa() {
  const settings = yooKassaSettings();
  if (!settings)
    fail(503, "ONLINE_PAYMENT_DISABLED", onlinePaymentConfig().message);
  return new YooKassaClient(settings);
}

export function rubleAmount(amount: number): string {
  if (!Number.isSafeInteger(amount) || amount <= 0)
    fail(409, "PAYMENT_AMOUNT", "Проверьте сумму счёта с официантом.");
  return `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, "0")}`;
}

export function assertOnlinePaymentAmount(
  amount: number,
  method: OnlinePaymentMethod,
) {
  rubleAmount(amount);
  if (method === "sbp" && (amount < 100 || amount > 70000000))
    fail(
      400,
      "PAYMENT_AMOUNT",
      "Через СБП можно оплатить от 1 до 700 000 ₽. Этот остаток счёта оплатите официанту.",
    );
}

export function confirmationUrl(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > 2048)
    fail(
      502,
      "PAYMENT_PROVIDER_RESPONSE",
      "Не удалось проверить страницу оплаты.",
    );
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    fail(
      502,
      "PAYMENT_PROVIDER_RESPONSE",
      "Не удалось проверить страницу оплаты.",
    );
  }
  // Only the provider's own hosted pages are supported by this integration.
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !["yookassa.ru", "yoomoney.ru"].some(
      (domain) =>
        url.hostname === domain || url.hostname.endsWith(`.${domain}`),
    )
  )
    fail(
      502,
      "PAYMENT_PROVIDER_RESPONSE",
      "Не удалось проверить страницу оплаты.",
    );
  return url.href;
}

export interface PaymentIntent {
  id: string;
  visit_id: string;
  share_id: string;
  bill_share_id: string | null;
  amount: number;
  method: OnlinePaymentMethod;
  status: OnlinePaymentStatus;
  provider_id: string | null;
  provider_key: string;
  provider_shop_id: string;
  provider_test_mode: boolean;
  return_url: string;
  confirmation_url: string | null;
  created_at: Date | string;
  owner: string;
  user_id: string | null;
}

const providerSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9-]{1,100}$/),
  status: z.enum(["pending", "waiting_for_capture", "succeeded", "canceled"]),
  paid: z.boolean(),
  amount: z.object({
    value: z.string().regex(/^\d+\.\d{2}$/),
    currency: z.literal("RUB"),
  }),
  metadata: z.object({
    payment_intent_id: z.string(),
    visit_id: z.string(),
    share_id: z.string(),
  }),
  recipient: z.object({ account_id: z.string() }),
  payment_method: z.object({ type: z.enum(["bank_card", "sbp"]) }).optional(),
  confirmation: z
    .object({ type: z.literal("redirect"), confirmation_url: z.string() })
    .optional(),
  test: z.boolean(),
});
export type VerifiedYooPayment = z.infer<typeof providerSchema>;

export function verifyYooPayment(
  value: unknown,
  intent: PaymentIntent,
  shopId: string,
  testMode = false,
): VerifiedYooPayment {
  const parsed = providerSchema.safeParse(value);
  if (!parsed.success)
    fail(
      502,
      "PAYMENT_PROVIDER_RESPONSE",
      "Не удалось проверить ответ ЮKassa.",
    );
  const payment = parsed.data;
  if (
    (intent.provider_id && payment.id !== intent.provider_id) ||
    payment.amount.value !== rubleAmount(intent.amount) ||
    intent.provider_shop_id !== shopId ||
    intent.provider_test_mode !== testMode ||
    payment.recipient.account_id !== shopId ||
    payment.metadata.payment_intent_id !== intent.id ||
    payment.metadata.visit_id !== intent.visit_id ||
    payment.metadata.share_id !== intent.share_id ||
    payment.test !== testMode ||
    (payment.payment_method && payment.payment_method.type !== intent.method) ||
    (payment.status === "succeeded" && !payment.paid) ||
    (payment.status === "waiting_for_capture" && !payment.paid) ||
    (payment.status === "pending" && payment.paid) ||
    (payment.status === "canceled" && payment.paid)
  )
    fail(
      502,
      "PAYMENT_PROVIDER_MISMATCH",
      "Ответ ЮKassa не соответствует счёту. Обратитесь к официанту.",
    );
  if (payment.confirmation)
    confirmationUrl(payment.confirmation.confirmation_url);
  return payment;
}

export class YooKassaClient {
  constructor(
    readonly settings: YooKassaSettings,
    private transport: typeof fetch = fetch,
  ) {}

  private assertSettings(intent: PaymentIntent) {
    if (
      intent.provider_shop_id !== this.settings.shopId ||
      intent.provider_test_mode !== (this.settings.testMode ?? false)
    )
      fail(
        409,
        "PAYMENT_PROVIDER_CHANGED",
        "Эта попытка создана с другими настройками ЮKassa. Оператор должен сверить оплату в исходном магазине.",
      );
  }

  private async request(
    path: string,
    init: RequestInit = {},
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await this.transport(`https://api.yookassa.ru/v3${path}`, {
        ...init,
        signal: AbortSignal.timeout(12000),
        redirect: "error",
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.settings.shopId}:${this.settings.secretKey}`).toString("base64")}`,
          "Content-Type": "application/json",
          ...init.headers,
        },
      });
    } catch {
      fail(
        502,
        "PAYMENT_PROVIDER_UNAVAILABLE",
        "ЮKassa пока не отвечает. Повторите проверку: новая оплата не создаётся.",
      );
    }
    // Do not include raw provider errors, bodies or credentials in API errors/logs.
    if (!response.ok)
      fail(
        502,
        "PAYMENT_PROVIDER_UNAVAILABLE",
        "ЮKassa пока не подтвердила оплату. Повторите проверку или обратитесь к официанту.",
      );
    try {
      return await response.json();
    } catch {
      fail(
        502,
        "PAYMENT_PROVIDER_RESPONSE",
        "Не удалось проверить ответ ЮKassa.",
      );
    }
  }

  async create(intent: PaymentIntent): Promise<VerifiedYooPayment> {
    this.assertSettings(intent);
    assertOnlinePaymentAmount(intent.amount, intent.method);
    // YooKassa retains idempotency keys for 24 hours. A lost response must never
    // become a fresh payment after that window: require operator reconciliation.
    if (Date.now() - new Date(intent.created_at).getTime() >= 23 * 3600000)
      fail(
        409,
        "PAYMENT_RECONCILIATION_REQUIRED",
        "Статус старой попытки оплаты должен проверить оператор. Новая оплата заблокирована.",
      );
    const value = await this.request("/payments", {
      method: "POST",
      headers: { "Idempotence-Key": intent.provider_key },
      body: JSON.stringify({
        amount: { value: rubleAmount(intent.amount), currency: "RUB" },
        payment_method_data: { type: intent.method },
        capture: true,
        confirmation: { type: "redirect", return_url: intent.return_url },
        description: "Оплата счёта за столом Син Чао",
        metadata: {
          payment_intent_id: intent.id,
          visit_id: intent.visit_id,
          share_id: intent.share_id,
        },
      }),
    });
    return verifyYooPayment(
      value,
      intent,
      this.settings.shopId,
      this.settings.testMode ?? false,
    );
  }

  async get(intent: PaymentIntent): Promise<VerifiedYooPayment> {
    this.assertSettings(intent);
    if (!intent.provider_id) return this.create(intent);
    const value = await this.request(
      `/payments/${encodeURIComponent(intent.provider_id)}`,
    );
    return verifyYooPayment(
      value,
      intent,
      this.settings.shopId,
      this.settings.testMode ?? false,
    );
  }
}

export function paymentView(row: PaymentIntent): OnlinePaymentView {
  return {
    id: row.id,
    visitId: row.visit_id,
    shareId: row.share_id,
    amount: row.amount,
    method: row.method,
    status: row.status,
    confirmationUrl: row.status === "PENDING" ? row.confirmation_url : null,
  };
}

// All callers first lock the visit row, matching settlement lock order.
export async function assertNoActiveTablePayment(
  db: DB,
  visitId: string,
  shareId?: string,
) {
  if (
    (
      await db.query(
        "SELECT id FROM table_payments WHERE visit_id=$1 AND ($2::uuid IS NULL OR share_id=$2) AND status IN ('CREATING','PENDING','WAITING_FOR_CAPTURE') LIMIT 1",
        [visitId, shareId ?? null],
      )
    ).rowCount
  )
    fail(
      409,
      "ONLINE_PAYMENT_PENDING",
      "Онлайн-оплата ещё проверяется. Сначала проверьте её статус, чтобы не списать деньги дважды.",
    );
}

export async function settleVerifiedTablePayment(
  db: DB,
  intent: PaymentIntent,
  payment: VerifiedYooPayment,
) {
  const status = payment.status.toUpperCase() as OnlinePaymentStatus;
  if (intent.status === "SUCCEEDED" || intent.status === "CANCELED") {
    // A GET started before another request's settlement may finish afterwards.
    // Keep the final state rather than interpreting that older result as failure.
    if (status === "PENDING" || status === "WAITING_FOR_CAPTURE") return intent;
    if (intent.status !== status)
      fail(
        502,
        "PAYMENT_PROVIDER_MISMATCH",
        "ЮKassa вернула противоречивый статус оплаты.",
      );
    return intent;
  }
  if (intent.status === "WAITING_FOR_CAPTURE" && status === "PENDING")
    return intent;
  const share = (
    await db.query(
      "SELECT * FROM bill_shares WHERE id=$1 AND visit_id=$2 FOR UPDATE",
      [intent.share_id, intent.visit_id],
    )
  ).rows[0];
  if (!share || share.paid || share.amount - share.gift_paid !== intent.amount)
    fail(
      409,
      "PAYMENT_BILL_CHANGED",
      "Счёт изменён. Оператор должен сверить оплату.",
    );
  if (status === "SUCCEEDED") {
    await db.query(
      "UPDATE bill_shares SET paid=true,paid_at=now() WHERE id=$1",
      [intent.share_id],
    );
    if (
      !(
        await db.query(
          "SELECT id FROM bill_shares WHERE visit_id=$1 AND NOT paid",
          [intent.visit_id],
        )
      ).rowCount
    )
      await db.query(
        "UPDATE orders SET payment_status='PAID' WHERE visit_id=$1 AND status<>'CANCELLED'",
        [intent.visit_id],
      );
    await audit(
      db,
      intent.user_id,
      "BILL_SHARE_PAID_ONLINE",
      intent.share_id,
      null,
      {
        amount: intent.amount,
        tip: share.tip,
        visitId: intent.visit_id,
        paymentId: intent.id,
        provider: "yookassa",
        test: payment.test,
      },
    );
    await notify(
      db,
      intent.owner,
      intent.user_id,
      "Счёт оплачен",
      "ЮKassa подтвердила оплату вашей части счёта.",
      intent.visit_id,
    );
  }
  return (
    await db.query(
      "UPDATE table_payments SET provider_id=$2,status=$3,confirmation_url=$4,test=$5,updated_at=now(),settled_at=CASE WHEN $3='SUCCEEDED' THEN now() ELSE settled_at END WHERE id=$1 RETURNING *",
      [
        intent.id,
        payment.id,
        status,
        status === "PENDING"
          ? (confirmationUrl(payment.confirmation?.confirmation_url) ??
            intent.confirmation_url)
          : null,
        payment.test,
      ],
    )
  ).rows[0] as PaymentIntent;
}
