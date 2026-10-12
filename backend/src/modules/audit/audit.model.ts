import { Schema, model } from "mongoose";

export const AUDIT_EVENTS = [
  "register", "email_verified", "login_success", "login_failure", "login_locked", "mfa_failure", "mfa_enabled", "mfa_disabled",
  "refresh_reuse", "logout", "logout_all", "password_changed", "password_reset_requested", "password_reset_completed", "user_status_changed", "admin_ip_blocked",
  "account_blocked", "account_unblocked",
] as const;

export type AuditEventName = (typeof AUDIT_EVENTS)[number];

export interface IAuditEvent {
  event: AuditEventName;
  scope?: "user" | "admin";
  userId?: string;
  identifierHash?: string;
  ip?: string;
  userAgent?: string;
  meta?: Record<string, unknown>;
  createdAt: Date;
}

const AUDIT_RETENTION_SEC = 365 * 24 * 60 * 60;

const auditSchema = new Schema<IAuditEvent>({
  event: { type: String, enum: AUDIT_EVENTS, required: true },
  scope: { type: String, enum: ["user", "admin"] },
  userId: { type: String },
  identifierHash: { type: String },
  ip: { type: String },
  userAgent: { type: String, maxlength: 256 },
  meta: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: () => new Date(), required: true },
}, { versionKey: false });

auditSchema.index({ createdAt: 1 }, { expireAfterSeconds: AUDIT_RETENTION_SEC });
auditSchema.index({ userId: 1, createdAt: -1 });
auditSchema.index({ event: 1, createdAt: -1 });

export const AuditEvent = model<IAuditEvent>("AuditEvent", auditSchema);
