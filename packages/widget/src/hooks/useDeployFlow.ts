import { useCallback, useEffect, useState } from "react";
import {
  deployNeedsUserVouch,
  signDeployControl,
  type DeployStatusResponse,
} from "../client/host.js";
import { useWidget } from "../context.js";
import {
  defaultConfigForSkill,
  defaultDisplayNameForSkill,
  deployTemplateForSkill,
  UBI_REMINDER_SKILL_ID,
} from "../skill-config.js";
import type { SkillConfiguration } from "../types.js";

export function useDeployFlow(opts?: {
  deployId?: string;
  onDeployId?: (id: string) => void;
  onAwaitingVouch?: (status: DeployStatusResponse) => void;
}) {
  const { config, wallet, host } = useWidget();
  const skillId = config.skillId;

  const [deployId, setDeployId] = useState(opts?.deployId ?? "");
  const [displayName, setDisplayName] = useState(
    config.defaultDisplayName ?? defaultDisplayNameForSkill(skillId),
  );
  const [configValues, setConfigValues] = useState<SkillConfiguration>(() => ({
    ...defaultConfigForSkill(skillId),
    ...config.skillConfiguration,
  }));
  const [telegramBotToken, setTelegramBotToken] = useState(
    config.telegramBotToken ?? "",
  );
  const [status, setStatus] = useState<DeployStatusResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollMs = config.statusPollMs ?? 4000;

  useEffect(() => {
    setConfigValues({
      ...defaultConfigForSkill(skillId),
      ...config.skillConfiguration,
    });
    setDisplayName(
      config.defaultDisplayName ?? defaultDisplayNameForSkill(skillId),
    );
    setTelegramBotToken(config.telegramBotToken ?? "");
  }, [skillId, config.skillConfiguration, config.defaultDisplayName, config.telegramBotToken]);

  const poll = useCallback(async () => {
    if (!deployId) return null;
    const s = await host.getDeployStatus(deployId);
    setStatus(s);
    return s;
  }, [deployId, host]);

  useEffect(() => {
    if (opts?.deployId) setDeployId(opts.deployId);
  }, [opts?.deployId]);

  useEffect(() => {
    if (!deployId) return;
    void poll();
    const t = setInterval(() => void poll(), pollMs);
    return () => clearInterval(t);
  }, [deployId, poll, pollMs]);

  useEffect(() => {
    if (status && deployNeedsUserVouch(status)) {
      opts?.onAwaitingVouch?.(status);
    }
  }, [status, opts]);

  const updateConfig = useCallback((key: string, value: string) => {
    setConfigValues((c) => ({ ...c, [key]: value }));
  }, []);

  const deploy = useCallback(async () => {
    if (!wallet.address) throw new Error("Connect your wallet first");
    if (skillId === UBI_REMINDER_SKILL_ID && !telegramBotToken.trim()) {
      throw new Error("Telegram bot token is required for this skill");
    }
    setError(null);
    setBusy(true);
    try {
      const { agent } = await host.createDeploy({
        displayName:
          displayName.trim() || defaultDisplayNameForSkill(skillId),
        ownerWallet: wallet.address,
        skillId,
        configuration: configValues,
        partnerId: config.partnerId,
        template: config.deployTemplate ?? deployTemplateForSkill(skillId),
        telegramBotToken:
          skillId === UBI_REMINDER_SKILL_ID
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
    configValues,
    config.partnerId,
    config.deployTemplate,
    telegramBotToken,
    opts,
    poll,
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
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }, [deployId, wallet, host, poll]);

  const canDeploy =
    skillId !== UBI_REMINDER_SKILL_ID || telegramBotToken.trim().length > 0;

  return {
    skillId,
    deployId,
    displayName,
    setDisplayName,
    configValues,
    updateConfig,
    telegramBotToken,
    setTelegramBotToken,
    status,
    busy,
    error,
    deploy,
    startAgent,
    poll,
    needsVouch: deployNeedsUserVouch(status),
    isLive: status?.status === "running",
    canDeploy,
  };
}
