export {
  AGENT_ID_DOMAIN_NAME,
  AGENT_ID_DOMAIN_VERSION,
  AGENT_ID_PRIMARY_TYPE,
  OFFCHAIN_VERIFYING_CONTRACT,
  agentIdDomain,
  agentIdTypes,
} from "./eip712.js";
export type { DomainOptions } from "./eip712.js";

export {
  DEFAULT_TTL_SECONDS,
  buildAgentId,
  hashAgentId,
  signAgentId,
} from "./sign.js";
export type { BuildAgentIdInput } from "./sign.js";

export { verifyAgentId } from "./verify.js";
export type { HumanRootLookup, VerifyOptions } from "./verify.js";

export { liveHumanRootLookup } from "./chain-lookup.js";

export type {
  AgentIdCredential,
  AgentIdFields,
  VerifyFailureReason,
  VerifyResult,
} from "./types.js";
