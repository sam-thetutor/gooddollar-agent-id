import type { ReactNode } from "react";
import { useDeployFlow } from "../hooks/useDeployFlow.js";
import { useWidget } from "../context.js";
import {
  deployHintForSkill,
  skillShortLabel,
} from "../skill-config.js";
import { SkillConfigFields } from "./SkillConfigFields.js";

export function DeployPanel({
  deployId: initialDeployId,
  onDeployId,
  onAwaitingVouch,
  renderSkillConfig,
}: {
  deployId?: string;
  onDeployId?: (id: string) => void;
  onAwaitingVouch?: (agentAddress: string, deployId: string) => void;
  renderSkillConfig?: (props: {
    skillId: string;
    config: Record<string, string>;
    onChange: (key: string, value: string) => void;
    telegramBotToken?: string;
    onTelegramBotTokenChange?: (value: string) => void;
  }) => ReactNode;
}) {
  const { config } = useWidget();
  const flow = useDeployFlow({
    deployId: initialDeployId,
    onDeployId,
    onAwaitingVouch: (s) => {
      if (s.agentAddress) onAwaitingVouch?.(s.agentAddress, s.id);
    },
  });

  const step = flow.status?.status ?? (flow.deployId ? "provisioning" : "idle");
  const skillLabel =
    config.skillLabel ?? skillShortLabel(flow.skillId);
  const hint = config.deployHint ?? deployHintForSkill(flow.skillId);

  return (
    <div className="ga-widget-section">
      <h3 className="ga-widget-title">Deploy {skillLabel} agent</h3>
      <p className="ga-widget-muted">{hint}</p>

      {!flow.deployId && (
        <>
          <label className="ga-widget-field">
            <span>Agent name</span>
            <input
              className="ga-widget-input"
              value={flow.displayName}
              onChange={(e) => flow.setDisplayName(e.target.value)}
              placeholder={flow.displayName}
            />
          </label>

          {!config.hideSkillConfig &&
            (renderSkillConfig ? (
              renderSkillConfig({
                skillId: flow.skillId,
                config: flow.configValues,
                onChange: flow.updateConfig,
                telegramBotToken: flow.telegramBotToken,
                onTelegramBotTokenChange: flow.setTelegramBotToken,
              })
            ) : (
              <SkillConfigFields
                skillId={flow.skillId}
                config={flow.configValues}
                onChange={flow.updateConfig}
                telegramBotToken={flow.telegramBotToken}
                onTelegramBotTokenChange={flow.setTelegramBotToken}
              />
            ))}

          <button
            type="button"
            className="ga-widget-btn ga-widget-btn-primary"
            disabled={flow.busy || !flow.canDeploy}
            onClick={() => void flow.deploy()}
          >
            {flow.busy ? "Deploying…" : "Deploy agent"}
          </button>
        </>
      )}

      {flow.deployId && (
        <div className="ga-widget-status">
          <p>
            <strong>Deploy:</strong> {flow.deployId.slice(0, 12)}…
          </p>
          <p>
            <strong>Status:</strong> {step}
          </p>
          {flow.status?.agentAddress && (
            <p>
              <strong>Agent:</strong>{" "}
              <code>{flow.status.agentAddress.slice(0, 10)}…</code>
            </p>
          )}
          {flow.needsVouch && (
            <p className="ga-widget-warn">
              Vouch required — complete verification in the next step.
            </p>
          )}
          {flow.status?.verify?.valid && !flow.isLive && (
            <button
              type="button"
              className="ga-widget-btn ga-widget-btn-primary"
              disabled={flow.busy}
              onClick={() => void flow.startAgent()}
            >
              {flow.busy ? "Starting…" : "Start agent"}
            </button>
          )}
          {flow.isLive && (
            <p className="ga-widget-ok">Agent is live.</p>
          )}
        </div>
      )}

      {flow.error && <p className="ga-widget-error">{flow.error}</p>}
    </div>
  );
}
