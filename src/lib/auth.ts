import crypto from "crypto";

/**
 * Web UI auth: one shared team password (AGENTBOARD_PASSWORD) exchanged for a
 * signed session cookie. Runner auth (per-agent bearer tokens) lives in
 * runner-auth.ts because it needs the database; this file must stay DB-free
 * so the proxy can import it.
 */

export const SESSION_COOKIE = "agentboard_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type AuthMode = "password" | "open" | "misconfigured";

export function getAuthMode(): AuthMode {
  if (process.env.AGENTBOARD_PASSWORD) return "password";
  // Refuse to run a public instance without a password: anyone who can create
  // tasks can run commands on every connected runner.
  return process.env.NODE_ENV === "production" ? "misconfigured" : "open";
}

function sessionKey(): Buffer {
  // Derived from the password, so changing it signs everyone out.
  return crypto
    .createHash("sha256")
    .update(`agentboard-session:${process.env.AGENTBOARD_PASSWORD ?? ""}`)
    .digest();
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", sessionKey()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function createSessionToken(): string {
  const expires = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const payload = `v1.${expires}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const lastDot = token.lastIndexOf(".");
  if (lastDot < 0) return false;
  const payload = token.slice(0, lastDot);
  const [version, expires] = payload.split(".");
  if (version !== "v1" || !expires) return false;
  if (Number(expires) < Date.now() / 1000) return false;
  return safeEqual(token.slice(lastDot + 1), sign(payload));
}

export function checkPassword(input: string): boolean {
  const expected = process.env.AGENTBOARD_PASSWORD;
  if (!expected) return false;
  return safeEqual(input, expected);
}

// ── Runner tokens ──────────────────────────────────────────────────

export function generateRunnerToken(): string {
  return `abr_${crypto.randomBytes(24).toString("base64url")}`;
}

export function hashRunnerToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
