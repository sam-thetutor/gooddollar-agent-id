import { useCallback, useEffect, useRef, useState } from "react";
import {
  deployNeedsUserVouch,
  signDeployControl,
  type DeployStatusResponse,
} from "../client/host.js";
import { useWidget } from "../context.js";
import {
  useActiveDeploySkillId,
  useSelectedDeploySkillIds,
} from "../deploy-session.js";
import {
  defaultConfigForSkill,
  defaultDisplayNameForSkill,
  deployTemplateForSkill,
  UBI_REMINDER_SKILL_ID,
} from "../skill-config.js";
import type { SkillConfiguration } from "../types.js";
import { isDeployProvisioning } from "../lib/deploy-progress.js";
import { useOwnerIdentity } from "./useOwnerIdentity.js";

function buildInitialSkillConfigs(
  skillIds: string[],
  partnerDefaults: SkillConfiguration,
): Record<string, SkillConfiguration> {
  const out: Record<string, SkillConfiguration> = {};
  for (const id of skillIds) {
    out[id] = { ...defaultConfigForSkill(id), ...partnerDefaults };
  }
  return out;
}

export function useDeployFlow(opts?: {
  deployId?: string;
  onDeployId?: (id: string) => void;
  onAwaitingVouch?: (status: DeployStatusResponse) => void;
  onStatusChange?: (status: DeployStatusResponse | null) => void;
}) {
  const { config, wallet, host } = useWidget();
  const skillId = useActiveDeploySkillId(config);
  const selectedSkillIds = useSelectedDeploySkillIds(config);
  const ownerIdentity = useOwnerIdentity();

  const [deployId, setDeployId] = useState(opts?.deployId ?? "");
  const [displayName, setDisplayName] = useState(
    config.defaultDisplayName ?? defaultDisplayNameForSkill(skillId),
  );
  const [skillConfigs, setSkillConfigs] = useState<
    Record<string, SkillConfiguration>
  >(() =>
    buildInitialSkillConfigs(selectedSkillIds, config.skillConfiguration),
  );
  const [telegramBotToken, setTelegramBotToken] = useState(
    config.telegramBotToken ?? "",
  );
  const [status, setStatus] = useState<DeployStatusResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onAwaitingVouchRef = useRef(opts?.onAwaitingVouch);
  onAwaitingVouchRef.current = opts?.onAwaitingVouch;
  const onStatusChangeRef = useRef(opts?.onStatusChange);
  onStatusChangeRef.current = opts?.onStatusChange;
  const displayNameDirtyRef = useRef(false);
  const vouchNotifiedForDeployRef = useRef("");

  const configValues = skillConfigs[skillId] ?? defaultConfigForSkill(skillId);

  const basePollMs = config.statusPollMs ?? 4000;
  const pollMs =
    status?.pipelineRunning ||
    status?.status === "provisioning" ||
    status?.status === "installing" ||
    status?.status === "starting"
      ? 2000
      : basePollMs;

  useEffect(() => {
    setSkillConfigs((prev) => {
      const next = { ...prev };
      for (const id of selectedSkillIds) {
        if (!next[id]) {
          next[id] = {
            ...defaultConfigForSkill(id),
            ...config.skillConfiguration,
          };
        }
      }
      for (const id of Object.keys(next)) {
        if (!selectedSkillIds.includes(id)) delete next[id];
      }
      return next;
    });
    if (!displayNameDirtyRef.current) {
      setDisplayName(
        config.defaultDisplayName ?? defaultDisplayNameForSkill(skillId),
      );
    }
    setTelegramBotToken(config.telegramBotToken ?? "");
  }, [
    selectedSkillIds,
    skillId,
    config.defaultDisplayName,
    config.telegramBotToken,
    config.skillConfiguration,
  ]);

  useEffect(() => {
    onStatusChangeRef.current?.(status);
  }, [status]);

  const poll = useCallback(async () => {
    if (!deployId) return null;
    try {
      const s = await host.getDeployStatus(deployId, { lite: true });
      setStatus(s);
      setError(null);
      return s;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [deployId, host]);

  useEffect(() => {
    setDeployId(opts?.deployId ?? "");
    if (!opts?.deployId) {
      setStatus(null);
      setError(null);
      displayNameDirtyRef.current = false;
      vouchNotifiedForDeployRef.current = "";
    }
  }, [opts?.deployId]);

  useEffect(() => {
    if (!deployId) return;
    void poll();
    const t = setInterval(() => void poll(), pollMs);
    return () => clearInterval(t);
  }, [deployId, poll, pollMs]);

  useEffect(() => {
    if (!status || !deployId) return;
    if (!deployNeedsUserVouch(status)) return;
    if (vouchNotifiedForDeployRef.current === deployId) return;
    vouchNotifiedForDeployRef.current = deployId;
    onAwaitingVouchRef.current?.(status);
  }, [status, deployId]);

  const updateConfig = useCallback(
    (key: string, value: string) => {
      setSkillConfigs((prev) => ({
        ...prev,
        [skillId]: { ...(prev[skillId] ?? {}), [key]: value },
      }));
    },
    [skillId],
  );

  const setDisplayNameSafe = useCallback((value: string) => {
    displayNameDirtyRef.current = true;
    setDisplayName(value);
  }, []);

  const deploy = useCallback(async () => {
    if (!wallet.address) throw new Error("Connect your wallet first");
    if (!ownerIdentity.verified) {
      throw new Error(
        "GoodDollar face verification is required before deploying an agent.",
      );
    }
    if (
      selectedSkillIds.includes(UBI_REMINDER_SKILL_ID) &&
      !telegramBotToken.trim()
    ) {
      throw new Error("Telegram bot token is required for UBI reminder");
    }
    setError(null);
    setBusy(true);
    try {
      const primarySkill = selectedSkillIds[0] ?? skillId;
      const { agent } = await host.createDeploy({
        displayName:
          displayName.trim() || defaultDisplayNameForSkill(primarySkill),
        ownerWallet: wallet.address,
        skillIds: selectedSkillIds,
        skillConfigurations: Object.fromEntries(
          selectedSkillIds.map((id) => [id, skillConfigs[id] ?? {}]),
        ),
        partnerId: config.partnerId,
        template:
          config.deployTemplate ?? deployTemplateForSkill(primarySkill),
        telegramBotToken: selectedSkillIds.includes(UBI_REMINDER_SKILL_ID)
          ? telegramBotToken.trim()
          : undefined,
      });
      setDeployId(agent.id);
      opts?.onDeployId?.(agent.id);

      const auth = await signDeployControl(wallet, "run-pipeline", agent.id);
      await host.runDeployPipeline(agent.id, auth);
      await poll();
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }, [
    wallet,
    host,
    displayName,
    skillId,
    selectedSkillIds,
    skillConfigs,
    config.partnerId,
    config.deployTemplate,
    telegramBotToken,
    opts,
    poll,
    ownerIdentity.verified,
  ]);

  const startAgent = useCallback(async () => {
    if (!deployId || !wallet.address) return;
    setError(null);
    setBusy(true);
    try {
      const auth = await signDeployControl(wallet, "resume", deployId);
      await host.startDeploy(deployId, auth);
      await poll();
    } catch (e) {
      const message = (e as Error).message;
      setError(
        message === "OWNER_MISMATCH"
          ? "Connected wallet does not own this deploy. Switch to the owner wallet or deploy a new agent."
          : message,
      );
      throw e;
    } finally {
      setBusy(false);
    }
  }, [deployId, wallet, host, poll]);

  const retryPipeline = useCallback(async () => {
    if (!deployId || !wallet.address) return;
    setError(null);
    setBusy(true);
    try {
      const auth = await signDeployControl(wallet, "run-pipeline", deployId);
      await host.runDeployPipeline(deployId, auth);
      await poll();
    } catch (e) {
      const message = (e as Error).message;
      setError(
        message === "OWNER_MISMATCH"
          ? "Connected wallet does not own this deploy. Switch to the owner wallet or deploy a new agent."
          : message,
      );
    } finally {
      setBusy(false);
    }
  }, [deployId, wallet, host, poll]);

  const canDeploy =
    ownerIdentity.verified &&
    selectedSkillIds.length > 0 &&
    (!selectedSkillIds.includes(UBI_REMINDER_SKILL_ID) ||
      telegramBotToken.trim().length > 0);

  return {
    skillId,
    selectedSkillIds,
    deployId,
    displayName,
    setDisplayName: setDisplayNameSafe,
    provisioning: isDeployProvisioning(status, deployId),
    configValues,
    skillConfigs,
    updateConfig,
    telegramBotToken,
    setTelegramBotToken,
    status,
    busy,
    error,
    deploy,
    startAgent,
    retryPipeline,
    poll,
    needsVouch: deployNeedsUserVouch(status),
    isLive: status?.status === "running",
    canDeploy,
    ownerIdentity,
  };
}
