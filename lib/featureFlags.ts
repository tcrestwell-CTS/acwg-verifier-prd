/**
 * Feature flags for Sprint 3 capabilities.
 * All flags default to false unless the env var is explicitly set to "true".
 * This ensures safe no-op behavior in unconfigured environments.
 */

function flag(key: string): boolean {
  return process.env[key] === "true";
}

export const flags = {
  // OTP step-up via SMS
  otpStepUp: flag("FEATURE_OTP_STEP_UP"),

  // 3DS payment step-up
  threeDsStepUp: flag("FEATURE_3DS_STEP_UP"),

  // Document/KYC escalation requests
  documentEscalation: flag("FEATURE_DOCUMENT_ESCALATION"),

  // Redis-backed job queue (falls back to in-memory/Prisma when false)
  redisQueue: flag("FEATURE_REDIS_QUEUE"),

  // Slack alerts for high-risk and aging queue
  slackAlerts: flag("FEATURE_SLACK_ALERTS"),

  // Email alerts
  emailAlerts: flag("FEATURE_EMAIL_ALERTS"),

  // Admin rules editor (always on — protected by admin check)
  rulesEditor: true,

  // Chargeback recording
  chargebacks: true,
};
