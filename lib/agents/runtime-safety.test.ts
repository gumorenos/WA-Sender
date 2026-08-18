import { describe, expect, it } from "vitest";

import {
  getAgentReplyBlockReason,
  isAgentAutoReplyGloballyEnabled,
  isAgentRealReplyEnabled,
} from "./runtime-safety";

describe("agent runtime safety env switches", () => {
  it("defaults global auto-reply to disabled", () => {
    expect(isAgentAutoReplyGloballyEnabled({})).toBe(false);
  });

  it("requires an explicit true value", () => {
    expect(isAgentAutoReplyGloballyEnabled({ AGENT_AUTOREPLY_ENABLED: "true" })).toBe(
      true,
    );
    expect(isAgentAutoReplyGloballyEnabled({ AGENT_AUTOREPLY_ENABLED: "false" })).toBe(
      false,
    );
    expect(isAgentRealReplyEnabled({ AGENT_REAL_REPLY_ENABLED: "true" })).toBe(true);
  });
});

describe("getAgentReplyBlockReason", () => {
  it("blocks when the global auto-reply switch is off", () => {
    expect(
      getAgentReplyBlockReason({
        globalAutoReplyEnabled: false,
        agentAutoReplyEnabled: true,
        realSendingEnabled: false,
        realReplyEnabled: false,
      }),
    ).toBe("GLOBAL_AUTOREPLY_DISABLED");
  });

  it("blocks when the agent auto-reply setting is off", () => {
    expect(
      getAgentReplyBlockReason({
        globalAutoReplyEnabled: true,
        agentAutoReplyEnabled: false,
        realSendingEnabled: false,
        realReplyEnabled: false,
      }),
    ).toBe("AGENT_AUTOREPLY_DISABLED");
  });

  it("blocks real replies unless the dedicated real-reply switch is on", () => {
    expect(
      getAgentReplyBlockReason({
        globalAutoReplyEnabled: true,
        agentAutoReplyEnabled: true,
        realSendingEnabled: true,
        realReplyEnabled: false,
      }),
    ).toBe("REAL_REPLY_DISABLED");
  });

  it("allows mock replies without the real-reply switch", () => {
    expect(
      getAgentReplyBlockReason({
        globalAutoReplyEnabled: true,
        agentAutoReplyEnabled: true,
        realSendingEnabled: false,
        realReplyEnabled: false,
      }),
    ).toBeNull();
  });

  it("allows real replies only when every gate is enabled", () => {
    expect(
      getAgentReplyBlockReason({
        globalAutoReplyEnabled: true,
        agentAutoReplyEnabled: true,
        realSendingEnabled: true,
        realReplyEnabled: true,
      }),
    ).toBeNull();
  });
});
