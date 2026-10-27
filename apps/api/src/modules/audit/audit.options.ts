export const AUDIT_OPTIONS = Symbol('AUDIT_OPTIONS');

export interface AuditModuleOptions {
  /** HMAC key for AuditLog.ipHash. Defaults to process.env.AUDIT_IP_HASH_SECRET; required in production. */
  readonly ipHashSecret?: string;
  /** Overrides NODE_ENV detection (tests). */
  readonly nodeEnv?: string;
}
