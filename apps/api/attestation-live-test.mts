/**
 * Live test of the deployed AgentAttestation registry on Celo mainnet
 * (0xe5EFd6755e8a2035c924f9BaCDecD067B3dcf6C2) with REAL transactions:
 *
 *  1. direct attest()        — deployer attests for its own address
 *  2. relayed attestFor()    — throwaway agent key signs, deployer pays gas
 *  3. replayed signature     — must revert (nonce consumed)
 *  4. forged signature       — must revert (wrong signer)
 */
import { createPublicClient, createWalletClient, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";

const PK = process.env.PRIVATE_KEY as `0x${string}`;
if (!PK) throw new Error("PRIVATE_KEY missing");

const ATTESTATION = "0xe5EFd6755e8a2035c924f9BaCDecD067B3dcf6C2" as const;
const relayer = privateKeyToAccount(PK);

const pub = createPublicClient({ chain: celo, transport: http("https://forno.celo.org") });
const wallet = createWalletClient({ account: relayer, chain: celo, transport: http("https://forno.celo.org") });

const abi = [
  { type: "function", name: "attest", stateMutability: "nonpayable", inputs: [], outputs: [] },
  {
    type: "function",
    name: "attestFor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  { type: "function", name: "provenAt", stateMutability: "view", inputs: [{ name: "agent", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "isProven", stateMutability: "view", inputs: [{ name: "agent", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "nonces", stateMutability: "view", inputs: [{ name: "agent", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

function step(name: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!ok) process.exitCode = 1;
}

// Forno load-balances across nodes; a fresh read may lag the tx we just mined.
async function readStable<T>(fn: () => Promise<T>, expected: T, tries = 10): Promise<T> {
  for (let i = 0; i < tries; i++) {
    const v = await fn();
    if (v === expected) return v;
    await new Promise((s) => setTimeout(s, 3000));
  }
  return fn();
}

function signAttest(account: ReturnType<typeof privateKeyToAccount>, agent: `0x${string}`, nonce: bigint, deadline: bigint) {
  return account.signTypedData({
    domain: {
      name: "GoodDollar Agent Attestation",
      version: "1",
      chainId: celo.id,
      verifyingContract: ATTESTATION,
    },
    types: {
      AttestAgent: [
        { name: "agent", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "AttestAgent",
    message: { agent, nonce, deadline },
  });
}

// --- 1. direct attest() from the deployer's own account ---------------------
{
  const already = await pub.readContract({ address: ATTESTATION, abi, functionName: "isProven", args: [relayer.address] });
  if (!already) {
    const tx = await wallet.writeContract({ address: ATTESTATION, abi, functionName: "attest" });
    await pub.waitForTransactionReceipt({ hash: tx });
    console.log(`   attest() tx: ${tx}`);
  } else {
    console.log("   (deployer already attested — skipping tx)");
  }
  const proven = await readStable(
    () => pub.readContract({ address: ATTESTATION, abi, functionName: "isProven", args: [relayer.address] }),
    true,
  );
  const at = await pub.readContract({ address: ATTESTATION, abi, functionName: "provenAt", args: [relayer.address] });
  step("direct attest(): msg.sender is proven", proven === true, `provenAt=${at}`);
}

// --- 2. relayed attestFor() for a gasless throwaway agent -------------------
const throwaway = privateKeyToAccount(generatePrivateKey());
console.log(`   throwaway agent (0 gas): ${throwaway.address}`);
const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
let usedSig: `0x${string}`;
{
  const nonce = await pub.readContract({ address: ATTESTATION, abi, functionName: "nonces", args: [throwaway.address] });
  usedSig = await signAttest(throwaway, throwaway.address, nonce, deadline);
  const tx = await wallet.writeContract({
    address: ATTESTATION,
    abi,
    functionName: "attestFor",
    args: [throwaway.address, deadline, usedSig],
  });
  await pub.waitForTransactionReceipt({ hash: tx });
  console.log(`   attestFor() tx: ${tx}`);
  const proven = await readStable(
    () => pub.readContract({ address: ATTESTATION, abi, functionName: "isProven", args: [throwaway.address] }),
    true,
  );
  const nonceAfter = await pub.readContract({ address: ATTESTATION, abi, functionName: "nonces", args: [throwaway.address] });
  step("relayed attestFor(): agent proven without holding gas", proven === true, `nonce ${nonce} -> ${nonceAfter}`);
}

// --- 3. replaying the consumed signature must revert -------------------------
{
  let reverted = false;
  let reason = "";
  try {
    await pub.simulateContract({
      account: relayer,
      address: ATTESTATION,
      abi,
      functionName: "attestFor",
      args: [throwaway.address, deadline, usedSig],
    });
  } catch (err) {
    reverted = true;
    reason = (err as Error).message.split("\n")[0];
  }
  step("replayed signature reverts (single-use nonce)", reverted, reason);
}

// --- 4. forged signature (wrong key claims another agent) --------------------
{
  const victim = privateKeyToAccount(generatePrivateKey());
  const attacker = privateKeyToAccount(generatePrivateKey());
  const nonce = await pub.readContract({ address: ATTESTATION, abi, functionName: "nonces", args: [victim.address] });
  const forged = await signAttest(attacker, victim.address, nonce, deadline);
  let reverted = false;
  let reason = "";
  try {
    await pub.simulateContract({
      account: relayer,
      address: ATTESTATION,
      abi,
      functionName: "attestFor",
      args: [victim.address, deadline, forged],
    });
  } catch (err) {
    reverted = true;
    reason = (err as Error).message.split("\n")[0];
  }
  step("forged signature for another agent reverts", reverted, reason);
}

console.log("\ndone.");
