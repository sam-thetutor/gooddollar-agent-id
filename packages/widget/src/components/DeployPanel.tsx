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
  onGoToVerify,
  onStartNew,
  renderSkillConfig,
}: {
  deployId?: string;
  onDeployId?: (id: string) => void;
  onAwaitingVouch?: (agentAddress: string, deployId: string) => void;
  onGoToVerify?: () => void;
  onStartNew?: () => void;
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
  const provisioning =
    flow.status?.pipelineRunning ||
    step === "provisioning" ||
    step === "installing" ||
    step === "starting";
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
            {provisioning ? " (updating live…)" : ""}
          </p>
          {provisioning && (
            <p className="ga-widget-muted">
              Server is provisioning your agent wallet and skill. This usually
              takes 1–3 minutes — no refresh needed.
            </p>
          )}
          {flow.status?.agentAddress && (
            <p>
              <strong>Agent:</strong>{" "}
              <code>{flow.status.agentAddress.slice(0, 10)}…</code>
            </p>
          )}
          {flow.needsVouch && (
            <div className="ga-widget-stack">
              <p className="ga-widget-warn">
                Provisioning complete — vouch required before the agent can run.
              </p>
              {onGoToVerify && (
                <button
                  type="button"
                  className="ga-widget-btn ga-widget-btn-primary"
                  onClick={onGoToVerify}
                >
                  Continue to Verify →
                </button>
              )}
            </div>
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
          {step === "failed" && flow.status?.lastError && (
            <p className="ga-widget-error">{flow.status.lastError}</p>
          )}
          {step === "failed" && (
            <button
              type="button"
              className="ga-widget-btn ga-widget-btn-primary"
              disabled={flow.busy}
              onClick={() => void flow.retryPipeline()}
            >
              {flow.busy ? "Retrying…" : "Retry provisioning"}
            </button>
          )}
          <button
            type="button"
            className="ga-widget-btn"
            disabled={flow.busy}
            onClick={() => onStartNew?.()}
          >
            Start new deploy
          </button>
        </div>
      )}

      {flow.error && <p className="ga-widget-error">{flow.error}</p>}
    </div>
  );
}
