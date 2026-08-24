import { describe, expect, it } from "vitest";

import {
  getAgentBudgetDateKey,
  getAgentDailyBudgetLimits,
} from "@/server/agents/daily-budget";

describe("agent daily budget configuration", () => {
  it("uses conservative defaults and allows zero as a full kill switch", () => {
    expect(getAgentDailyBudgetLimits({})).toEqual({
      llmAttempts: 50,
      providerStarts: 50,
    });

    expect(
      getAgentDailyBudgetLimits({
        AGENT_DAILY_LLM_LIMIT: "0",
        AGENT_DAILY_PROVIDER_CALL_LIMIT: "0",
      }),
    ).toEqual({
      llmAttempts: 0,
      providerStarts: 0,
    });
  });

  it("falls back on invalid values and clamps extreme values", () => {
    expect(
      getAgentDailyBudgetLimits({
        AGENT_DAILY_LLM_LIMIT: "-1",
        AGENT_DAILY_PROVIDER_CALL_LIMIT: "not-a-number",
      }),
    ).toEqual({
      llmAttempts: 50,
      providerStarts: 50,
    });

    expect(
      getAgentDailyBudgetLimits({
        AGENT_DAILY_LLM_LIMIT: "999999999",
        AGENT_DAILY_PROVIDER_CALL_LIMIT: "100001",
      }),
    ).toEqual({
      llmAttempts: 100_000,
      providerStarts: 100_000,
    });
  });

  it("uses the workspace local calendar day instead of UTC", () => {
    const instant = new Date("2026-08-24T04:30:00.000Z");

    expect(getAgentBudgetDateKey(instant, "UTC")).toBe("2026-08-24");
    expect(getAgentBudgetDateKey(instant, "America/Lima")).toBe("2026-08-23");
  });

  it("handles a DST timezone through Intl calendar conversion", () => {
    const beforeLocalMidnight = new Date("2026-11-01T03:30:00.000Z");
    const afterLocalMidnight = new Date("2026-11-01T04:30:00.000Z");

    expect(getAgentBudgetDateKey(beforeLocalMidnight, "America/New_York")).toBe(
      "2026-10-31",
    );
    expect(getAgentBudgetDateKey(afterLocalMidnight, "America/New_York")).toBe(
      "2026-11-01",
    );
  });
});
