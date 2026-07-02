export {
  AGENT_ID_DOMAIN_NAME,
  AGENT_ID_DOMAIN_VERSION,
  AGENT_ID_PRIMARY_TYPE,
  CELO_CHAIN_ID,
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
export type { HumanRootLookup, StakeLookup, VerifyOptions } from "./verify.js";

export {
  AGENT_VAULT_CELO,
  GOODDOLLAR_IDENTITY_CELO,
  createHumanRootLookup,
  createStakeLookup,
  liveHumanRootLookup,
  liveStakeLookup,
} from "./chain-lookup.js";
export type {
  HumanRootLookupOptions,
  StakeLookupOptions,
} from "./chain-lookup.js";

export {
  ERC8004_IDENTITY_REGISTRY_CELO,
  ERC8004_REGISTRATION_TYPE,
  GOODDOLLAR_PROOF_KEY,
  GOODDOLLAR_PROOF_VERSION,
  buildErc8004Registration,
  caip10AgentRegistry,
  decodeMetadataValue,
  encodeMetadataValue,
  extractGoodDollarProof,
  fromDataUri,
  toDataUri,
  verifyErc8004Registration,
} from "./erc8004.js";
export type {
  BuildRegistrationInput,
  Erc8004Registration,
  Erc8004RegistrationRef,
  Erc8004Service,
  Erc8004VerifyResult,
  GoodDollarProof,
} from "./erc8004.js";

export {
  GOODDOLLAR_HUMAN_PROOF_PROVIDER_CELO,
  GOODDOLLAR_PROVIDER_NAME,
  GOODDOLLAR_VERIFICATION_STRENGTH,
  HUMAN_PROOF_PRIMARY_TYPE,
  encodeHumanProofData,
  humanProofDigest,
  humanProofDomain,
  humanProofTypedData,
  humanProofTypes,
} from "./humanProof.js";
export type { HumanProofDomainOptions } from "./humanProof.js";

export {
  credentialFromWire,
  credentialToWire,
  fieldsFromWire,
  fieldsToWire,
  verifyResultToWire,
} from "./serialize.js";
export type {
  AgentIdCredentialWire,
  AgentIdFieldsWire,
  VerifyResultWire,
} from "./serialize.js";

export type {
  AgentIdCredential,
  AgentIdFields,
  VerifyFailureReason,
  VerifyResult,
} from "./types.js";
