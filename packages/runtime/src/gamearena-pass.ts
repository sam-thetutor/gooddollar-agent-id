import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  type LocalAccount,
} from "viem";
import { celo } from "viem/chains";

/** GameArena Pass (GAPASS) — username + challenge-ai scores on Celo. */
export const GAME_PASS_ADDRESS =
  "0xBB044d6780885A4cDb7E6F40FCc92FF7b051DAdE" as const;

/** Challenge-ai leaderboard scores are stored under this gameType on GamePass. */
export const GAMEARENA_CHALLENGE_AI_GAME_TYPE = 3;

export const GAMEARENA_SKILL_ID = "gaming/wagering/gamearena_1v1" as const;

const gamePassAbi = [
  {
    type: "function",
    name: "hasMinted",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "getUsername",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "isUsernameAvailable",
    stateMutability: "view",
    inputs: [{ name: "username", type: "string" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [{ name: "username", type: "string" }],
    outputs: [],
  },
  {
    type: "function",
    name: "changeUsername",
    stateMutability: "nonpayable",
    inputs: [{ name: "newName", type: "string" }],
    outputs: [],
  },
] as const;

export interface GamePassProfile {
  hasMinted: boolean;
  username: string;
}

/** Map deploy display name → GamePass username (3–16 chars, a-z 0-9 _). */
export function sanitizeGamePassUsername(
  displayName: string,
  deployId?: string,
): string {
  let base = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  if (base.length < 3) {
    const suffix = (deployId ?? "agent")
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 10);
    base = base ? `${base}_${suffix}` : `ga_${suffix}`;
  }

  return base.slice(0, 16);
}

function buildUsernameCandidates(
  displayName: string,
  deployId: string,
): string[] {
  const primary = sanitizeGamePassUsername(displayName);
  const withDeploy = sanitizeGamePassUsername(displayName, deployId);
  const candidates = [primary];
  if (withDeploy !== primary) candidates.push(withDeploy);

  const stem = primary.slice(0, 12) || "agent";
  for (let i = 2; i <= 20; i++) {
    candidates.push(`${stem}${i}`.slice(0, 16));
  }

  return [...new Set(candidates.filter((c) => c.length >= 3 && c.length <= 16))];
}

export async function readGamePassProfile(
  wallet: Address,
  rpcUrl: string,
): Promise<GamePassProfile> {
  const client = createPublicClient({
    chain: celo,
    transport: http(rpcUrl, { timeout: 12_000 }),
  });
  const [hasMinted, username] = await Promise.all([
    client.readContract({
      address: GAME_PASS_ADDRESS,
      abi: gamePassAbi,
      functionName: "hasMinted",
      args: [wallet],
    }),
    client.readContract({
      address: GAME_PASS_ADDRESS,
      abi: gamePassAbi,
      functionName: "getUsername",
      args: [wallet],
    }),
  ]);
  return { hasMinted, username };
}

async function pickAvailableUsername(
  displayName: string,
  deployId: string,
  rpcUrl: string,
): Promise<string> {
  const client = createPublicClient({
    chain: celo,
    transport: http(rpcUrl, { timeout: 12_000 }),
  });
  for (const candidate of buildUsernameCandidates(displayName, deployId)) {
    const available = await client.readContract({
      address: GAME_PASS_ADDRESS,
      abi: gamePassAbi,
      functionName: "isUsernameAvailable",
      args: [candidate],
    });
    if (available) return candidate;
  }
  throw new Error(
    `No available GameArena Pass username for "${displayName}" — try a different agent name`,
  );
}

export interface RegisterGamePassResult {
  username: string;
  action: "mint" | "change" | "skip";
  txHash?: Hex;
}

/**
 * Register the agent's GameArena Pass username on-chain from the deploy display name.
 * Requires CELO on the agent wallet for gas (~0.03 CELO).
 */
export async function registerGamePassUsername(opts: {
  rpcUrl: string;
  account: LocalAccount;
  displayName: string;
  deployId: string;
}): Promise<RegisterGamePassResult> {
  const { account, displayName, deployId, rpcUrl } = opts;
  const wallet = account.address;

  const publicClient = createPublicClient({
    chain: celo,
    transport: http(rpcUrl, { timeout: 12_000 }),
  });
  const walletClient = createWalletClient({
    account,
    chain: celo,
    transport: http(rpcUrl, { timeout: 12_000 }),
  });

  const profile = await readGamePassProfile(wallet, rpcUrl);
  const targetUsername = await pickAvailableUsername(
    displayName,
    deployId,
    rpcUrl,
  );

  if (profile.hasMinted) {
    if (profile.username === targetUsername) {
      return { username: profile.username, action: "skip" };
    }
    const hash = await walletClient.writeContract({
      address: GAME_PASS_ADDRESS,
      abi: gamePassAbi,
      functionName: "changeUsername",
      args: [targetUsername],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    return { username: targetUsername, action: "change", txHash: hash };
  }

  const hash = await walletClient.writeContract({
    address: GAME_PASS_ADDRESS,
    abi: gamePassAbi,
    functionName: "mint",
    args: [targetUsername],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return { username: targetUsername, action: "mint", txHash: hash };
}
