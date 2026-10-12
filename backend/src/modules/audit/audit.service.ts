import type { Logger } from "../../lib/logger.js";
import { AuditEvent, type AuditEventName, type IAuditEvent } from "./audit.model.js";

export type AuditEntry = Omit<IAuditEvent, "event" | "createdAt">;

export interface AuditRecorder {
  record(event: AuditEventName, entry?: AuditEntry): void;
}

// Events worth an alert: they are also written to the log at warn level so a log-based alert can match "security":true.
const ALERT_EVENTS = new Set<AuditEventName>(["login_locked", "mfa_failure", "refresh_reuse", "admin_ip_blocked", "account_blocked", "mfa_disabled", "payment_amount_mismatch", "webhook_signature_invalid"]);

// Fire-and-forget: a failing audit write must never block or fail the user's request, but it is logged loudly.
export function createAuditRecorder(logger: Logger): AuditRecorder {
  const log = logger.child({ component: "audit" });
  return {
    record: (event, entry = {}) => {
      if (ALERT_EVENTS.has(event) || entry.scope === "admin") log.warn("Security event", { security: true, event, scope: entry.scope, userId: entry.userId, ip: entry.ip });
      AuditEvent.create({ event, ...entry }).catch((error: unknown) => log.error("Failed to persist audit event", { event, error }));
    },
  };
}
