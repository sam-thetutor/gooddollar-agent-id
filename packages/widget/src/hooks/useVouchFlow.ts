import { useCallback, useEffect, useState } from "react";
import {
  createPublicClient,
  formatUnits,
  getAddress,
  http,
  isAddress,
  maxUint256,
  type Address,
} from "viem";
import { celo } from "viem/chains";
import {
  agentAttestationAbi,
  agentIdDomain,
  agentIdTypes,
  agentVaultAbi,
  AGENT_ATTESTATION_ADDRESS,
  buildAgentIdMessage,
  erc20Abi,
  G_DOLLAR_ADDRESS,
  G_DOLLAR_DECIMALS,
  messageToWire,
} from "../constants.js";
import { useWidget } from "../context.js";
import { parseFvCallback, startGoodDollarFaceVerification } from "../gooddollar.js";

type AgentSnapshot = readonly [Address, bigint, bigint];

export function useVouchFlow(agentAddress: string, ttlDays = 30) {
  const { wallet, api, config, vaultAddress, rpcUrl } = useWidget();
  const [identity, setIdentity] = useState<{
    verified: boolean;
    root: string | null;
  } | null>(null);
  const [identityError, setIdentityError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<string | null>(null);
  const [minStake, setMinStake] = useState(0n);
  const [stakeAmount, setStakeAmount] = useState(0n);
  const [allowance, setAllowance] = useState(0n);
  const [agentProven, setAgentProven] = useState(false);
  const [approvedLocal, setApprovedLocal] = useState(false);
  const [bondReady, setBondReady] = useState(false);

  const agentValid = isAddress(agentAddress);
  const agentAddr = agentValid
    ? (getAddress(agentAddress) as Address)
    : null;

  const publicClient = createPublicClient({
    chain: celo,
    transport: http(rpcUrl),
  });

  const refreshChain = useCallback(async () => {
    if (!agentAddr) return;
    const [proven, min, snap, allow] = await Promise.all([
      publicClient.readContract({
        address: AGENT_ATTESTATION_ADDRESS,
        abi: agentAttestationAbi,
        functionName: "provenAt",
        args: [agentAddr],
      }),
      publicClient.readContract({
        address: vaultAddress,
        abi: agentVaultAbi,
        functionName: "minStake",
      }),
      publicClient.readContract({
        address: vaultAddress,
        abi: agentVaultAbi,
        functionName: "getAgent",
        args: [agentAddr],
      }),
      wallet.address
        ? publicClient.readContract({
            address: G_DOLLAR_ADDRESS,
            abi: erc20Abi,
            functionName: "allowance",
            args: [wallet.address, vaultAddress],
          })
        : Promise.resolve(0n),
    ]);
    setAgentProven((proven as bigint) !== 0n);
    setMinStake(min as bigint);
    const s = snap as AgentSnapshot;
    setStakeAmount(s[1] ?? 0n);
    setAllowance(allow as bigint);
  }, [agentAddr, publicClient, vaultAddress, wallet.address]);

  useEffect(() => {
    if (!wallet.address) {
      setIdentity(null);
      return;
    }
    setIdentityError(false);
    api
      .getWalletOverview(wallet.address)
      .then((d) =>
        setIdentity({
          verified: d.verify.isWhitelisted,
          root: d.verify.root,
        }),
      )
      .catch(() => setIdentityError(true));
  }, [wallet.address, api]);

  useEffect(() => {
    void refreshChain();
  }, [refreshChain]);

  useEffect(() => {
    setBondReady(false);
  }, [agentAddr]);

  useEffect(() => {
    setApprovedLocal(false);
  }, [wallet.address]);

  const fv =
    typeof window !== "undefined"
      ? parseFvCallback(new URLSearchParams(window.location.search))
      : null;

  const meetsMin = bondReady || (minStake > 0n && stakeAmount >= minStake);
  const approved =
    approvedLocal || (allowance >= minStake && minStake > 0n);

  const verifyFv = useCallback(async () => {
    await startGoodDollarFaceVerification(wallet, config, rpcUrl);
  }, [wallet, config, rpcUrl]);

  const approve = useCallback(async () => {
    if (!wallet.address) return;
    setBusy("Approve");
    setError(null);
    try {
      const hash = await wallet.writeContract({
        address: G_DOLLAR_ADDRESS,
        abi: erc20Abi,
        functionName: "approve",
        args: [vaultAddress, maxUint256],
      });
      if (wallet.waitForTransactionReceipt) {
        await wallet.waitForTransactionReceipt(hash);
      }
      setApprovedLocal(true);
      await refreshChain();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [wallet, vaultAddress, refreshChain]);

  const stake = useCallback(async () => {
    if (!wallet.address || !agentAddr) return;
    const amount = minStake - stakeAmount;
    if (amount <= 0n) {
      setBondReady(true);
      return;
    }
    setBusy("Stake");
    setError(null);
    try {
      const hash = await wallet.writeContract({
        address: vaultAddress,
        abi: agentVaultAbi,
        functionName: "stake",
        args: [agentAddr, amount],
      });
      if (wallet.waitForTransactionReceipt) {
        await wallet.waitForTransactionReceipt(hash);
      }
      setBondReady(true);
      await refreshChain();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [wallet, agentAddr, minStake, stakeAmount, vaultAddress, refreshChain]);

  const issue = useCallback(async () => {
    if (!wallet.address || !identity?.root || !agentAddr) return;
    setBusy("Issue");
    setError(null);
    try {
      const message = buildAgentIdMessage({
        agent: agentAddr,
        operator: getAddress(wallet.address),
        humanRoot: getAddress(identity.root),
        ttlDays,
      });
      const signature = await wallet.signTypedData({
        domain: agentIdDomain,
        types: agentIdTypes,
        primaryType: "AgentID",
        message: message as unknown as Record<string, unknown>,
      });
      const result = await api.issueAgent({
        fields: messageToWire(message),
        signature,
        chainId: agentIdDomain.chainId,
        verifyingContract: agentIdDomain.verifyingContract,
      });
      setIssued(result.agent);
      return result.agent;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(null);
    }
  }, [wallet, identity, agentAddr, ttlDays, api]);

  return {
    identity,
    identityError,
    fv,
    agentValid,
    agentProven,
    minStakeLabel:
      minStake > 0n ? formatUnits(minStake, G_DOLLAR_DECIMALS) : "…",
    stakeLabel: formatUnits(stakeAmount, G_DOLLAR_DECIMALS),
    approved,
    meetsMin,
    busy,
    error,
    issued,
    verifyFv,
    approve,
    stake,
    issue,
    canIssue:
      wallet.isConnected &&
      identity?.verified &&
      identity.root &&
      agentValid &&
      agentProven &&
      meetsMin &&
      !busy,
  };
}
