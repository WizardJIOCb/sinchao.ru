import type { Order } from "../shared/types";
import { orderTiming } from "../shared/order-time";

export function OrderTiming({
  order,
  timezone,
}: {
  order: Order;
  timezone: string;
}) {
  const timing = orderTiming(order, timezone);
  return (
    <dl className="order-timing">
      <div>
        <dt>Создан</dt>
        <dd>{timing.created}</dd>
      </div>
      <div>
        <dt>{timing.expectedLabel}</dt>
        <dd>{timing.expected}</dd>
      </div>
    </dl>
  );
}
