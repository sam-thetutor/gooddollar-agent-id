import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatUnits, getAddress, isAddress, maxUint256, parseUnits } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useSignTypedData,
  useWriteContract,
} from "wagmi";
import { Nav, ConnectButton } from "../components/Nav.js";
import { Footer } from "../components/Footer.js";
import {
  AGENT_ATTESTATION_ADDRESS,
  agentAttestationAbi,
  AGENT_REVOCATION_ADDRESS,
  agentRevocationAbi,
  agentVaultAbi,
  erc20Abi,
  G_DOLLAR_ADDRESS,
  G_DOLLAR_DECIMALS,
  isVaultConfigured,
  VAULT_ADDRESS,
} from "../lib/vault.js";
import { Link } from "react-router-dom";
import { agentIdDomain, buildRevokeMessage, revokeTypes } from "../lib/agentId.js";
import { revokeAgent } from "../lib/api.js";

type AgentSnapshot = readonly [
  `0x${string}`, // operator
  bigint, // stake
  bigint, // unstake unlock timestamp (0 = none)
];

function fmt(v: bigint): string {
  return formatUnits(v, G_DOLLAR_DECIMALS);
}

export function ManageAgent() {
  const [params] = useSearchParams();
  const agentParam = params.get("agent") ?? "";
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();

  const [amount, setAmount] = useState("250");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const agentValid = isAddress(agentParam);
  const agent = agentValid ? (getAddress(agentParam) as `0x${string}`) : null;

  const snapshot = useReadContract({
    address: VAULT_ADDRESS ?? undefined,
    abi: agentVaultAbi,
    functionName: "getAgent",
    args: agent ? [agent] : undefined,
    query: { enabled: Boolean(VAULT_ADDRESS && agent) },
  });

  const allowance = useReadContract({
    address: G_DOLLAR_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && VAULT_ADDRESS ? [address, VAULT_ADDRESS] : undefined,
    query: { enabled: Boolean(address && VAULT_ADDRESS) },
  });

  // "Approved" once the standing allowance comfortably exceeds the typed amount.
  const approved = useMemo(() => {
    const a = allowance.data as bigint | undefined;
    if (a === undefined) return false;
    try {
      return a >= parseUnits(amount || "0", G_DOLLAR_DECIMALS) && a > 0n;
    } catch {
      return a > 0n;
    }
  }, [allowance.data, amount]);

  const data = snapshot.data as AgentSnapshot | undefined;
  const isOperator = useMemo(() => {
    if (!data || !address) return false;
    const op = data[0];
    if (/^0x0+$/.test(op)) return true; // unclaimed → first staker becomes operator
    return getAddress(op) === getAddress(address);
  }, [data, address]);

  const unlockAt = data ? Number(data[2]) : 0;
  const now = Math.floor(Date.now() / 1000);
  const unstakeRequested = unlockAt > 0;
  const cooldownOver = unstakeRequested && now >= unlockAt;

  async function run(label: string, fn: () => Promise<`0x${string}`>) {
    setError(null);
    setNotice(null);
    setBusy(label);
    try {
      const hash = await fn();
      await publicClient?.waitForTransactionReceipt({ hash });
      setNotice(`${label} confirmed.`);
      await Promise.all([snapshot.refetch(), allowance.refetch()]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function wei(): bigint {
    return parseUnits(amount || "0", G_DOLLAR_DECIMALS);
  }

  // Approve an unlimited allowance once so future stakes need no re-approval.
  const approve = () =>
    run("Approve", () =>
      writeContractAsync({
        address: G_DOLLAR_ADDRESS,
        abi: erc20Abi,
        functionName: "approve",
        args: [VAULT_ADDRESS!, maxUint256],
      }),
    );

  const stake = () =>
    run("Stake", () =>
      writeContractAsync({
        address: VAULT_ADDRESS!,
        abi: agentVaultAbi,
        functionName: "stake",
        args: [agent!, wei()],
      }),
    );

  const requestUnstake = () =>
    run("Request unstake", () =>
      writeContractAsync({
        address: VAULT_ADDRESS!,
        abi: agentVaultAbi,
        functionName: "requestUnstake",
        args: [agent!],
      }),
    );

  const withdraw = () =>
    run("Withdraw stake", () =>
      writeContractAsync({
        address: VAULT_ADDRESS!,
        abi: agentVaultAbi,
        functionName: "withdrawStake",
        args: [agent!, wei()],
      }),
    );

  const revocation = useReadContract({
    address: AGENT_REVOCATION_ADDRESS,
    abi: agentRevocationAbi,
    functionName: "isRevoked",
    args: agent ? [agent] : undefined,
    query: { enabled: Boolean(agent) },
  });
  const isRevokedOnChain = revocation.data === true;

  // Key attestation status — registrations that predate the attest-first rule
  // may still be unproven; surface it and point the agent at the fix.
  const attestation = useReadContract({
    address: AGENT_ATTESTATION_ADDRESS,
    abi: agentAttestationAbi,
    functionName: "provenAt",
    args: agent ? [agent] : undefined,
    query: { enabled: Boolean(agent) },
  });
  const attestationLoaded = attestation.data !== undefined;
  const agentProven =
    ((attestation.data as bigint | undefined) ?? 0n) !== 0n;

  // On-chain revocation: the operator-controlled kill switch every verifier
  // reads live (not just the API). Costs gas but is honored network-wide.
  const revokeOnChain = () =>
    run("Revoke on-chain", async () => {
      const hash = await writeContractAsync({
        address: AGENT_REVOCATION_ADDRESS,
        abi: agentRevocationAbi,
        functionName: "revoke",
        args: [agent!],
      });
      await revocation.refetch();
      return hash;
    });

  const reinstateOnChain = () =>
    run("Reinstate on-chain", async () => {
      const hash = await writeContractAsync({
        address: AGENT_REVOCATION_ADDRESS,
        abi: agentRevocationAbi,
        functionName: "reinstate",
        args: [agent!],
      });
      await revocation.refetch();
      return hash;
    });

  // Identity revocation: a free EIP-712 signature (no on-chain tx) that tells
  // the registry to stop verifying this agent, independent of the bond.
  async function revoke() {
    if (!agent || !address) return;
    setError(null);
    setNotice(null);
    setBusy("Revoke");
    try {
      const operator = getAddress(address) as `0x${string}`;
      const message = buildRevokeMessage(agent, operator);
      const signature = await signTypedDataAsync({
        domain: agentIdDomain,
        types: revokeTypes,
        primaryType: "RevokeAgentID",
        message,
      });
      await revokeAgent({
        agent,
        operator,
        nonce: message.nonce.toString(),
        signature,
      });
      setNotice("Agent ID revoked — it no longer verifies as human-backed.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Nav />
      <main className="page">
      <header className="hero compact">
        <h1>Manage stake</h1>
        <p className="lede">
          Manage the refundable G$ bond behind your agent. A bond of at least
          the vault minimum is required to keep an agent registered. You can
          withdraw it after a short cooldown (it always returns to you), but
          withdrawing below the minimum invalidates the Agent ID until you
          re-stake — verifiers check the live bond on every verification.
        </p>
      </header>

      {!agentValid && (
        <section className="card">
          <p className="error">Provide a valid agent address: /manage?agent=0x…</p>
        </section>
      )}

      {agentValid && !isVaultConfigured() && (
        <section className="card">
          <p className="warn">On-chain stake vault not configured.</p>
          <p className="muted hint">
            Set <code>VITE_AGENT_VAULT_ADDRESS</code> to the deployed AgentVault
            address to enable staking here.
          </p>
        </section>
      )}

      {agentValid && isVaultConfigured() && !isConnected && (
        <section className="card">
          <p className="muted">Connect your wallet to manage this agent.</p>
          <ConnectButton />
        </section>
      )}

      {agentValid && isVaultConfigured() && isConnected && (
        <>
          <section className="card">
            <h2 className="card-title">On-chain stake</h2>
            {snapshot.isLoading && <p className="muted">Reading Celo…</p>}
            {data && (
              <dl className="kv">
                <dt>Agent</dt>
                <dd>{agent}</dd>
                <dt>Operator</dt>
                <dd>{/^0x0+$/.test(data[0]) ? "— (unstaked)" : data[0]}</dd>
                <dt>Stake</dt>
                <dd>{fmt(data[1])} G$</dd>
                <dt>Unstake</dt>
                <dd>
                  {!unstakeRequested
                    ? "—"
                    : cooldownOver
                      ? "ready to withdraw"
                      : `unlocks ${new Date(unlockAt * 1000).toLocaleString()}`}
                </dd>
                <dt>Key attestation</dt>
                <dd>
                  {!attestationLoaded
                    ? "…"
                    : agentProven
                      ? "✓ proven on-chain"
                      : "not attested"}
                </dd>
              </dl>
            )}
          </section>

          {attestationLoaded && !agentProven && (
            <section className="card warn">
              <h2 className="card-title">Key not attested</h2>
              <p className="muted">
                This agent was registered before attestation became required
                and has never proven on-chain that it controls its address.
                Verifiers see it as <code>agentProven: false</code>. The agent
                can fix this itself any time — see{" "}
                <Link to="/for-agents#register">the agent guide</Link> — and
                this page will pick it up automatically.
              </p>
              <div className="actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={attestation.isFetching}
                  onClick={() => attestation.refetch()}
                >
                  {attestation.isFetching ? "Checking…" : "Re-check"}
                </button>
              </div>
            </section>
          )}

          {!isOperator && data && (
            <section className="card">
              <p className="warn">
                Only the operator that staked this agent can manage its bond.
              </p>
            </section>
          )}

          {isOperator && (
            <section className="card form">
              <h2 className="card-title">Actions</h2>
              <label className="field">
                <span>Amount (G$)</span>
                <input
                  type="number"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>

              <p className="muted hint">
                Approve once (unlimited) — the vault can then pull G$ for any
                future stake without re-approving.{" "}
                {approved && <span className="ok">G$ approved ✓</span>}
              </p>

              {error && <p className="error">{error}</p>}
              {notice && <p className="ok">{notice}</p>}

              <div className="actions wrap">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={Boolean(busy) || approved}
                  onClick={approve}
                >
                  {busy === "Approve"
                    ? "Approving…"
                    : approved
                      ? "✓ Approved"
                      : "1. Approve G$"}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={Boolean(busy)}
                  onClick={stake}
                >
                  {busy === "Stake" ? "Staking…" : "2. Stake"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={Boolean(busy)}
                  onClick={requestUnstake}
                >
                  {busy === "Request unstake"
                    ? "Requesting…"
                    : "Request unstake"}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={Boolean(busy) || !cooldownOver}
                  onClick={withdraw}
                  title={
                    !unstakeRequested
                      ? "Request an unstake first"
                      : !cooldownOver
                        ? "Cooldown still active"
                        : undefined
                  }
                >
                  {busy === "Withdraw stake" ? "Withdrawing…" : "Withdraw stake"}
                </button>
              </div>

              <div className="revoke-block">
                <h3 className="card-title">Revoke identity</h3>
                <p className="muted hint">
                  Two ways to un-vouch, independent of the bond (which you can
                  still withdraw separately):
                </p>
                <p className="muted hint">
                  <strong>On-chain revoke</strong> writes a kill switch to the
                  AgentRevocation registry that <em>every</em> verifier reads
                  live — including SDK/MCP callers that never touch our API.
                  Costs gas. This is the durable, network-wide revocation.
                  {isRevokedOnChain && (
                    <span className="warn"> This agent is revoked on-chain.</span>
                  )}
                </p>
                <div className="actions wrap">
                  {!isRevokedOnChain ? (
                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={Boolean(busy)}
                      onClick={revokeOnChain}
                    >
                      {busy === "Revoke on-chain"
                        ? "Confirm in wallet…"
                        : "Revoke on-chain"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={Boolean(busy)}
                      onClick={reinstateOnChain}
                    >
                      {busy === "Reinstate on-chain"
                        ? "Confirm in wallet…"
                        : "Reinstate on-chain"}
                    </button>
                  )}
                </div>
                <p className="muted hint" style={{ marginTop: "0.75rem" }}>
                  <strong>Off-chain revoke</strong> is a free signature (no gas)
                  that flags the agent in our registry only — fast, but SDK
                  verifiers reading the chain directly won't see it.
                </p>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={Boolean(busy)}
                  onClick={revoke}
                >
                  {busy === "Revoke" ? "Sign in your wallet…" : "Off-chain revoke"}
                </button>
              </div>
            </section>
          )}
        </>
      )}
      </main>
      <Footer />
    </>
  );
}
