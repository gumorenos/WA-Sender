import { afterEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function validEnv() {
  return {
    APP_HOST: "wasender.gumorenos.space",
    APP_URL: "https://wasender.gumorenos.space",
    NEXT_PUBLIC_APP_URL: "https://wasender.gumorenos.space",
    AUTH_URL: "https://wasender.gumorenos.space",
    NEXTAUTH_URL: "https://wasender.gumorenos.space",
    AUTH_SECRET: "strong-auth-secret-value",
    NEXTAUTH_SECRET: "strong-auth-secret-value",
    AUTH_GOOGLE_ID: "client.apps.googleusercontent.com",
    AUTH_GOOGLE_SECRET: "strong-google-secret",
    BETA_ALLOWED_EMAILS: "gumorenos@gmail.com",
    POSTGRES_USER: "wa_sender",
    POSTGRES_PASSWORD: "strong-db-secret",
    POSTGRES_DB: "wa_sender",
    DATABASE_URL: "postgresql://wa_sender:strong-db-secret@postgres-app:5432/wa_sender",
    REDIS_PASSWORD: "strong-redis-secret",
    REDIS_URL: "redis://:strong-redis-secret@redis:6379/0",
    EVOLUTION_API_KEY: "strong-evolution-key",
    EVOLUTION_WEBHOOK_SECRET: "strong-webhook-secret",
    EVOLUTION_POSTGRES_USER: "evolution",
    EVOLUTION_POSTGRES_PASSWORD: "strong-evolution-db-secret",
    EVOLUTION_POSTGRES_DB: "evolution",
    HEALTHCHECK_TOKEN: "strong-health-token",
    DEFAULT_PLAN_CODE: "demo",
    REAL_SENDING_ENABLED: "false",
    AGENT_AUTOREPLY_ENABLED: "false",
    AGENT_REAL_REPLY_ENABLED: "false",
    PRIVACY_RETENTION_ENABLED: "false",
    MOCK_LLM_ENABLED: "true",
    LLM_PROVIDER: "mock",
  };
}

function writeEnv(overrides: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "wa-staging-"));
  dirs.push(dir);
  const path = join(dir, ".env.production");
  const env = { ...validEnv(), ...overrides };
  writeFileSync(path, Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
  chmodSync(path, 0o600);
  return path;
}

describe("staging preflight", () => {
  it("accepts a safe technical staging configuration", () => {
    const path = writeEnv();
    const out = execFileSync(process.execPath, ["scripts/staging-preflight.mjs", path], { encoding: "utf8" });
    expect(out).toContain("PASS");
  });

  it("rejects a real-sending gate", () => {
    const path = writeEnv({ REAL_SENDING_ENABLED: "true" });
    const result = spawnSync(process.execPath, ["scripts/staging-preflight.mjs", path], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("REAL_SENDING_ENABLED");
  });

  it("rejects placeholders", () => {
    const path = writeEnv({ AUTH_GOOGLE_SECRET: "replace-with-google-client-secret" });
    const result = spawnSync(process.execPath, ["scripts/staging-preflight.mjs", path], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("placeholder");
  });

  it("rejects a hostname mismatch", () => {
    const path = writeEnv({ APP_URL: "https://other.gumorenos.space" });
    const result = spawnSync(process.execPath, ["scripts/staging-preflight.mjs", path], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("hostname must match APP_HOST");
  });
});
