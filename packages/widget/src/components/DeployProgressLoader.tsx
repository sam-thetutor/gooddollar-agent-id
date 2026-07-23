import type { DeployStatusResponse } from "../client/host.js";
import {
  DEPLOY_STEP_SHORT_LABELS,
  deployProgressPercent,
  deployProgressSteps,
  deployStatusHeadline,
} from "../lib/deploy-progress.js";

export function DeployProgressLoader({
  status,
  deployId,
  provisioning,
}: {
  status: DeployStatusResponse | null | undefined;
  deployId: string;
  provisioning: boolean;
}) {
  const steps = deployProgressSteps(status, deployId);
  const percent = deployProgressPercent(status, deployId);
  const headline = deployStatusHeadline(status, deployId);
  const activeStep = steps.find((s) => s.active);
  const nextStep = steps.find((s) => !s.done && !s.active);
  const subline = activeStep?.label ?? nextStep?.label ?? "All set";

  return (
    <div className="ga-widget-deploy-loader">
      {provisioning && (
        <div className="ga-widget-deploy-orbit" aria-hidden="true">
          <span className="ga-widget-deploy-orbit-ring ga-widget-deploy-orbit-ring-outer" />
          <span className="ga-widget-deploy-orbit-ring ga-widget-deploy-orbit-ring-inner" />
          <span className="ga-widget-deploy-orbit-core" />
        </div>
      )}

      <p className="ga-widget-deploy-loader-title">{headline}</p>
      <p className="ga-widget-deploy-loader-sub">{subline}</p>

      <div className="ga-widget-deploy-rail" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="ga-widget-deploy-rail-track">
          <div
            className={`ga-widget-deploy-rail-fill${provisioning ? " ga-widget-deploy-rail-fill-active" : ""}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="ga-widget-deploy-dots">
        {steps.map((s, i) => (
          <div
            key={s.id}
            className={`ga-widget-deploy-dot${s.done ? " ga-widget-deploy-dot-done" : ""}${
              s.active ? " ga-widget-deploy-dot-active" : ""
            }`}
          >
            <span className="ga-widget-deploy-dot-mark">
              {s.done ? "✓" : i + 1}
            </span>
            <span className="ga-widget-deploy-dot-label">
              {DEPLOY_STEP_SHORT_LABELS[s.id] ?? s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
