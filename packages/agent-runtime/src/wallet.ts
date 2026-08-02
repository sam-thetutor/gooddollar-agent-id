import { privateKeyToAccount } from "viem/accounts";
import type { HexAddress, SkillWallet } from "@goodagent/skill-sdk";

export function createSkillWallet(privateKey: `0x${string}`): SkillWallet {
  const account = privateKeyToAccount(privateKey);
  return {
    address: account.address as HexAddress,
    async signMessage(message) {
      return account.signMessage({
        message: typeof message === "string" ? message : { raw: message },
      });
    },
    async signTypedData(typedData) {
      return account.signTypedData(typedData as Parameters<typeof account.signTypedData>[0]);
    },
  };
}

export function readAgentPrivateKeyFromEnv(): `0x${string}` | null {
  const raw =
    process.env.AGENT_PRIVATE_KEY?.trim() ??
    process.env.PRIVATE_KEY?.trim() ??
    "";
  if (!raw) return null;
  if (!/^0x[a-fA-F0-9]{64}$/.test(raw)) {
    throw new Error("AGENT_PRIVATE_KEY must be a 32-byte hex private key");
  }
  return raw as `0x${string}`;
}
