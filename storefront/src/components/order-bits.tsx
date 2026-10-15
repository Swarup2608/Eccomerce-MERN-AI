import { formatDateTime } from "@/lib/money";
import { ORDER_STATUS_LABELS, type Order, type OrderStatus } from "@/lib/shop-api";

const TAGS: Record<OrderStatus, string> = {
  pending_payment: "tag tag-accent",
  confirmed: "tag tag-outline",
  processing: "tag tag-outline",
  shipped: "tag tag-outline",
  delivered: "tag bg-foreground text-background",
  cancelled: "tag bg-surface text-foreground/70",
  returned: "tag bg-surface text-foreground/70",
};

export function OrderStatusTag({ status }: { status: OrderStatus }) {
  return <span className={TAGS[status]}>{ORDER_STATUS_LABELS[status]}</span>;
}

const FLOW: OrderStatus[] = ["confirmed", "processing", "shipped", "delivered"];

// Vertical timeline from the design's Orders screen. A normal order shows the full flow with reached steps filled;
// a cancelled or returned order shows only what actually happened.
export function OrderTimeline({ order }: { order: Order }) {
  const reachedAt = new Map(order.statusHistory.map((entry) => [entry.status, entry.at]));
  const offFlow = !FLOW.includes(order.status) && order.status !== "pending_payment";
  const steps = offFlow ? order.statusHistory.map((entry) => ({ status: entry.status, at: entry.at as string | undefined })) : FLOW.map((status) => ({ status, at: reachedAt.get(status) }));
  const current = steps.findLastIndex((step) => step.at);

  return (
    <ol className="flex flex-col">
      {steps.map((step, index) => {
        const done = index <= current;
        const last = index === steps.length - 1;
        return (
          <li key={`${step.status}-${index}`} className="flex gap-3.5">
            <div className="flex flex-col items-center">
              <span className={`size-3.5 flex-none border-2 border-accent ${done ? "bg-accent" : "bg-background"}`} />
              {!last ? <span className={`min-h-[30px] w-0.5 flex-1 ${index < current ? "bg-accent" : "bg-divider"}`} /> : null}
            </div>
            <span className={`flex flex-col pb-5 text-sm leading-[14px] ${done ? "font-semibold" : "text-foreground/50"}`}>
              {ORDER_STATUS_LABELS[step.status]}
              {step.at ? <span className="mt-1.5 text-xs font-normal text-foreground/55">{formatDateTime(step.at)}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function Thumb({ src, size = 56 }: { src: string | null | undefined; size?: number }) {
  return (
    <span className="relative block flex-none overflow-hidden bg-surface" style={{ width: size, height: size }}>
      {src ? <span role="img" aria-label="" className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${src})` }} /> : null}
    </span>
  );
}
