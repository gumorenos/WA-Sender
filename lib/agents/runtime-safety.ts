type EnvLike = Record<string, string | undefined>;

export type AgentReplyGateInput = {
  globalAutoReplyEnabled: boolean;
  agentAutoReplyEnabled: boolean;
  realSendingEnabled: boolean;
  realReplyEnabled: boolean;
};

export type AgentReplyBlockReason =
  | "GLOBAL_AUTOREPLY_DISABLED"
  | "AGENT_AUTOREPLY_DISABLED"
  | "REAL_REPLY_DISABLED";

export function isAgentAutoReplyGloballyEnabled(
  env: EnvLike = process.env,
) {
  return env.AGENT_AUTOREPLY_ENABLED === "true";
}

export function isAgentRealReplyEnabled(env: EnvLike = process.env) {
  return env.AGENT_REAL_REPLY_ENABLED === "true";
}

export function isRealSendingEnabled(env: EnvLike = process.env) {
  return env.REAL_SENDING_ENABLED === "true";
}

export function getAgentReplyBlockReason({
  agentAutoReplyEnabled,
  globalAutoReplyEnabled,
  realReplyEnabled,
  realSendingEnabled,
}: AgentReplyGateInput): AgentReplyBlockReason | null {
  if (!globalAutoReplyEnabled) {
    return "GLOBAL_AUTOREPLY_DISABLED";
  }

  if (!agentAutoReplyEnabled) {
    return "AGENT_AUTOREPLY_DISABLED";
  }

  if (realSendingEnabled && !realReplyEnabled) {
    return "REAL_REPLY_DISABLED";
  }

  return null;
}
