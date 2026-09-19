import fs from "node:fs";

const envPath = process.argv[2] || ".env.production";
const expectedHost = process.env.EXPECTED_APP_HOST || "";

function fail(message) {
  console.error(`[staging-preflight] FAIL: ${message}`);
  process.exitCode = 1;
}

if (!fs.existsSync(envPath)) {
  console.error(`[staging-preflight] FAIL: ${envPath} does not exist`);
  process.exit(1);
}

const stat = fs.statSync(envPath);
if ((stat.mode & 0o077) !== 0) fail(`${envPath} must not be readable/writable by group or others (expected chmod 600)`);

const env = {};
for (const raw of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const idx = line.indexOf("=");
  if (idx < 1) continue;
  env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
}

const required = [
  "APP_HOST", "APP_URL", "NEXT_PUBLIC_APP_URL", "AUTH_URL", "NEXTAUTH_URL",
  "AUTH_SECRET", "NEXTAUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET",
  "BETA_ALLOWED_EMAILS", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB",
  "DATABASE_URL", "REDIS_PASSWORD", "REDIS_URL", "EVOLUTION_API_KEY",
  "EVOLUTION_WEBHOOK_SECRET", "EVOLUTION_POSTGRES_USER", "EVOLUTION_POSTGRES_PASSWORD",
  "EVOLUTION_POSTGRES_DB", "HEALTHCHECK_TOKEN", "DEFAULT_PLAN_CODE"
];

for (const key of required) {
  if (!env[key]) fail(`${key} is required`);
}

const unsafePatterns = [/replace-with-/i, /midominio\.com/i, /example\.com/i, /changeme/i, /change-me/i];
for (const [key, value] of Object.entries(env)) {
  if (unsafePatterns.some((pattern) => pattern.test(value))) fail(`${key} still contains an example/placeholder value`);
}

const exactSafety = {
  REAL_SENDING_ENABLED: "false",
  AGENT_AUTOREPLY_ENABLED: "false",
  AGENT_REAL_REPLY_ENABLED: "false",
  PRIVACY_RETENTION_ENABLED: "false",
  MOCK_LLM_ENABLED: "true",
  LLM_PROVIDER: "mock",
};
for (const [key, expected] of Object.entries(exactSafety)) {
  if (env[key] !== expected) fail(`${key} must be exactly ${expected} for technical staging`);
}

if (env.AUTH_SECRET && env.NEXTAUTH_SECRET && env.AUTH_SECRET !== env.NEXTAUTH_SECRET) {
  fail("NEXTAUTH_SECRET must match AUTH_SECRET for this deployment");
}

const urls = ["APP_URL", "NEXT_PUBLIC_APP_URL", "AUTH_URL", "NEXTAUTH_URL"];
for (const key of urls) {
  if (!env[key]) continue;
  try {
    const url = new URL(env[key]);
    if (url.protocol !== "https:") fail(`${key} must use https`);
    if (env.APP_HOST && url.hostname !== env.APP_HOST) fail(`${key} hostname must match APP_HOST`);
  } catch {
    fail(`${key} must be a valid absolute URL`);
  }
}

if (expectedHost && env.APP_HOST !== expectedHost) fail(`APP_HOST must be ${expectedHost}`);

if (env.BETA_ALLOWED_EMAILS) {
  const emails = env.BETA_ALLOWED_EMAILS.split(",").map((v) => v.trim()).filter(Boolean);
  if (!emails.length || emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    fail("BETA_ALLOWED_EMAILS contains an invalid email address");
  }
}

if (env.MOCK_LLM_ENABLED === "true" && env.LLM_PROVIDER !== "mock") fail("mock LLM requires LLM_PROVIDER=mock");

if (process.exitCode) process.exit(process.exitCode);
console.log(`[staging-preflight] PASS: ${envPath} is safe for technical staging`);
