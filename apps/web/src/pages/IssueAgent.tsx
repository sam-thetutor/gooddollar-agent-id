import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  formatUnits,
  getAddress,
  isAddress,
  maxUint256,
  type Address,
} from "viem";
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
  agentIdDomain,
  agentIdTypes,
  buildAgentIdMessage,
  messageToWire,
} from "../lib/agentId.js";
import {
  AGENT_ATTESTATION_ADDRESS,
  agentAttestationAbi,
  agentVaultAbi,
  erc20Abi,
  G_DOLLAR_ADDRESS,
  G_DOLLAR_DECIMALS,
  isVaultConfigured,
  VAULT_ADDRESS,
} from "../lib/vault.js";
import { getWalletOverview, issueAgent } from "../lib/api.js";
import { usePageMeta } from "../lib/usePageMeta.js";

const TTL_OPTIONS = [7, 30, 90, 365];

type Identity = { verified: boolean; root: string | null };
type AgentSnapshot = readonly [`0x${string}`, bigint, bigint];

export function IssueAgent() {
  usePageMeta(
    "Issue an Agent ID — GoodAgent",
    "Vouch for your AI agent as a verified GoodDollar human: the agent attests its key, you stake a refundable G$ bond and sign.",
  );
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const [searchParams] = useSearchParams();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [identityError, setIdentityError] = useState(false);
  const [agent, setAgent] = useState(() => searchParams.get("agent") ?? "");
  const [ttlDays, setTtlDays] = useState(30);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<string | null>(null);
  // Set the instant a tx receipt confirms, so the UI is correct even if the
  // load-balanced RPC read still lags (and a stale read can't re-show the button).
  const [approvedLocal, setApprovedLocal] = useState(false);
  const [bondReady, setBondReady] = useState(false);

  useEffect(() => {
    if (!isConnected || !address) {
      setIdentity(null);
      return;
    }
    let cancelled = false;
    setIdentityError(false);
    getWalletOverview(address)
      .then((d) => {
        if (!cancelled)
          setIdentity({
            verified: d.verify.isWhitelisted,
            root: d.verify.root,
          });
      })
      .catch(() => {
        // Don't mislabel an API/RPC outage as "not verified" — surface an error.
        if (!cancelled) {
          setIdentity(null);
          setIdentityError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isConnected, address]);

  const agentValid = useMemo(() => isAddress(agent), [agent]);
  const agentAddr = agentValid ? (getAddress(agent) as `0x${string}`) : null;

  // Bond is per-agent; allowance is per-wallet. Reset the optimistic flags when
  // those inputs change so we never carry a stale "done" state to a new target.
  useEffect(() => setBondReady(false), [agentAddr]);
  useEffect(() => setApprovedLocal(false), [address]);

  // --- on-chain stake reads ------------------------------------------------
  const minStakeRead = useReadContract({
    address: VAULT_ADDRESS ?? undefined,
    abi: agentVaultAbi,
    functionName: "minStake",
    query: { enabled: isVaultConfigured() },
  });
  const minStake = (minStakeRead.data as bigint | undefined) ?? 0n;

  // Agent-first gate: the agent must have attested key ownership on-chain
  // before it can be registered (the API enforces the same rule).
  const attestation = useReadContract({
    address: AGENT_ATTESTATION_ADDRESS,
    abi: agentAttestationAbi,
    functionName: "provenAt",
    args: agentAddr ? [agentAddr] : undefined,
    query: { enabled: Boolean(agentAddr) },
  });
  const agentProven =
    ((attestation.data as bigint | undefined) ?? 0n) !== 0n;

  const snapshot = useReadContract({
    address: VAULT_ADDRESS ?? undefined,
    abi: agentVaultAbi,
    functionName: "getAgent",
    args: agentAddr ? [agentAddr] : undefined,
    query: { enabled: Boolean(VAULT_ADDRESS && agentAddr) },
  });
  const snap = snapshot.data as AgentSnapshot | undefined;
  const stakeAmount = snap?.[1] ?? 0n;
  const vaultOperator = snap?.[0];

  const allowance = useReadContract({
    address: G_DOLLAR_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && VAULT_ADDRESS ? [address, VAULT_ADDRESS] : undefined,
    query: { enabled: Boolean(address && VAULT_ADDRESS) },
  });

  const meetsMin =
    bondReady || (minStake > 0n && stakeAmount >= minStake);
  const approved =
    approvedLocal ||
    (((allowance.data as bigint | undefined) ?? 0n) >= minStake &&
      minStake > 0n);
  const operatorBlocked = Boolean(
    vaultOperator &&
      !/^0x0+$/.test(vaultOperator) &&
      address &&
      getAddress(vaultOperator) !== getAddress(address),
  );

  const canSubmit =
    isConnected &&
    identity?.verified &&
    identity.root &&
    agentValid &&
    agentProven &&
    meetsMin &&
    !busy;

  // forno.celo.org is load-balanced, so an eth_call right after a receipt can hit
  // a node a block behind and return stale data. Poll the read until it reflects
  // the change (or we give up) so the UI flips on the first click — and so a
  // second click can't fire a duplicate (double-stake) transaction.
  async function refetchUntil<T>(
    refetch: () => Promise<{ data?: unknown }>,
    satisfied: (data: T | undefined) => boolean,
    tries = 10,
    delayMs = 1500,
  ) {
    for (let i = 0; i < tries; i++) {
      const { data } = await refetch();
      if (satisfied(data as T | undefined)) return;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  async function tx(
    label: string,
    fn: () => Promise<`0x${string}`>,
    confirm: () => Promise<void>,
  ) {
    setError(null);
    setBusy(label);
    try {
      const hash = await fn();
      await publicClient?.waitForTransactionReceipt({ hash });
      await confirm();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const approve = () =>
    tx(
      "Approve",
      () =>
        writeContractAsync({
          address: G_DOLLAR_ADDRESS,
          abi: erc20Abi,
          functionName: "approve",
          args: [VAULT_ADDRESS!, maxUint256],
        }),
      async () => {
        setApprovedLocal(true);
        await refetchUntil<bigint>(
          () => allowance.refetch(),
          (data) => (data ?? 0n) >= minStake && minStake > 0n,
        );
      },
    );

  const stake = () => {
    // Capture the deficit now so a stale re-read can't make us stake twice.
    const amount = minStake - stakeAmount;
    return tx(
      "Stake",
      () =>
        writeContractAsync({
          address: VAULT_ADDRESS!,
          abi: agentVaultAbi,
          functionName: "stake",
          args: [agentAddr!, amount],
        }),
      async () => {
        setBondReady(true);
        await refetchUntil<AgentSnapshot>(
          () => snapshot.refetch(),
          (data) => (data?.[1] ?? 0n) >= minStake,
        );
      },
    );
  };

  async function handleIssue() {
    if (!address || !identity?.root || !agentAddr) return;
    setError(null);
    setIssued(null);
    setBusy("Issue");
    try {
      const message = buildAgentIdMessage({
        agent: agentAddr as Address,
        operator: getAddress(address) as Address,
        humanRoot: getAddress(identity.root) as Address,
        ttlDays,
      });

      const signature = await signTypedDataAsync({
        domain: agentIdDomain,
        types: agentIdTypes,
        primaryType: "AgentID",
        message,
      });

      const result = await issueAgent({
        fields: messageToWire(message),
        signature,
        chainId: agentIdDomain.chainId,
        verifyingContract: agentIdDomain.verifyingContract,
      });
      setIssued(result.agent);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const minLabel = minStake > 0n ? formatUnits(minStake, G_DOLLAR_DECIMALS) : "…";
  const stakeLabel = formatUnits(stakeAmount, G_DOLLAR_DECIMALS);

  return (
    <>
      <Nav />
      <main className="page">
      <header className="hero compact">
        <h1>Issue an Agent ID</h1>
        <p className="lede">
          Vouch for an AI agent. You sign in your own wallet — non-custodial.
        </p>
      </header>

      {!isConnected && (
        <section className="card">
          <p className="muted">Connect your wallet to issue an Agent ID.</p>
          <ConnectButton />
        </section>
      )}

      {isConnected && identityError && (
        <section className="card">
          <p className="error">
            Couldn't reach the API to read your GoodDollar status. Check your
            connection and try again.
          </p>
        </section>
      )}

      {isConnected && identity && !identity.verified && (
        <section className="card">
          <p className="warn">You're not GoodDollar-verified yet.</p>
          <p className="muted hint">
            Issuing requires a verified human root. Verify in the GoodDollar
            wallet, then come back.
          </p>
          <a
            className="btn btn-primary"
            href="https://wallet.gooddollar.org"
            target="_blank"
            rel="noreferrer"
          >
            Verify with GoodDollar
          </a>
        </section>
      )}

      {isConnected && identity?.verified && !issued && (
        <section className="card form">
          <label className="field">
            <span>Agent address</span>
            <input
              type="text"
              placeholder="0x… the agent's wallet address"
              value={agent}
              onChange={(e) => setAgent(e.target.value.trim())}
            />
            {agent && !agentValid && (
              <span className="error small">Not a valid address.</span>
            )}
          </label>

          <label className="field">
            <span>Expires in</span>
            <select
              value={ttlDays}
              onChange={(e) => setTtlDays(Number(e.target.value))}
            >
              {TTL_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </select>
          </label>

          {/* The agent must have attested key ownership on-chain first */}
          {agentValid && (
            <div className="field">
              <span>Agent key attestation (required)</span>
              {agentProven ? (
                <p className="ok small">
                  ✓ This agent has proven on-chain that it controls its
                  address.
                </p>
              ) : (
                <>
                  <p className="warn small">
                    Not attested yet — point the agent to the{" "}
                    <Link to="/for-agents">agent guide</Link>, then re-check.
                  </p>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={attestation.isFetching}
                    onClick={() => attestation.refetch()}
                  >
                    {attestation.isFetching ? "Checking…" : "Re-check"}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Required refundable bond */}
          {agentValid && (
            <div className="field">
              <span>
                Accountability bond — required, refundable ({minLabel} G$ min)
              </span>
              {operatorBlocked ? (
                <p className="error small">
                  This agent is already bonded by a different wallet. Use that
                  wallet, or choose another agent address.
                </p>
              ) : meetsMin ? (
                <p className="ok small">
                  ✓ {stakeLabel} G$ bonded on-chain — meets the {minLabel} G$
                  minimum.
                </p>
              ) : (
                <>
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
                      disabled={Boolean(busy) || !approved || minStake === 0n}
                      onClick={stake}
                    >
                      {busy === "Stake"
                        ? "Staking…"
                        : `2. Stake ${minLabel} G$`}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {error && <p className="error">{error}</p>}

          <button
            type="button"
            className="btn btn-primary"
            disabled={!canSubmit}
            onClick={handleIssue}
            title={
              agentValid && !agentProven
                ? "The agent must attest key ownership on-chain first"
                : undefined
            }
          >
            {busy === "Issue"
              ? "Sign in your wallet…"
              : "3. Sign & issue Agent ID"}
          </button>
        </section>
      )}

      {issued && (
        <section className="card success-card">
          <h2>✓ Agent ID issued</h2>
          <p>
            Agent <code>{issued}</code> is now vouched for by your verified human
            identity, backed by a refundable G$ bond.
          </p>
          <div className="actions">
            <Link to={`/verify?agent=${issued}`} className="btn btn-primary">
              View public verification
            </Link>
            <Link to="/agents" className="btn btn-ghost">
              My Agents
            </Link>
          </div>
        </section>
      )}
      </main>
      <Footer />
    </>
  );
}
