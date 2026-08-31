import { orderStatusLabel, type OrderStatus } from "@/lib/data/types";

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`status status-${status}`}>{orderStatusLabel[status]}</span>;
}
