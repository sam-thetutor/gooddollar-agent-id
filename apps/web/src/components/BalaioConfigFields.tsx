import type { ReactNode } from "react";
import {
  estimateBalaioEscrowGs,
  isBalaioRoleEnabled,
} from "../lib/balaio-config.js";
import type { SkillConfiguration } from "../lib/host.js";

function ConfigField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`config-field ${className}`.trim()}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function BalaioConfigFields({
  config,
  onChange,
}: {
  config: SkillConfiguration;
  onChange: (key: string, value: string) => void;
}) {
  const workerOn = isBalaioRoleEnabled(config, "worker");
  const creatorOn = isBalaioRoleEnabled(config, "creator");
  const approverOn = isBalaioRoleEnabled(config, "approver");
  const escrow = estimateBalaioEscrowGs(config);

  const setRole = (role: "worker" | "creator" | "approver", enabled: boolean) => {
    const key =
      role === "worker"
        ? "ENABLE_WORKER"
        : role === "creator"
          ? "ENABLE_CREATE"
          : "ENABLE_APPROVE";
    onChange(key, enabled ? "1" : "0");
  };

  return (
    <div className="gamearena-config-form">
      <section className="config-section">
        <h4 className="config-section-title">Agent roles</h4>
        <div className="chips">
          <button
            type="button"
            className={`chip ${workerOn ? "chip-on" : ""}`}
            onClick={() => setRole("worker", !workerOn)}
          >
            Worker
          </button>
          <button
            type="button"
            className={`chip ${creatorOn ? "chip-on" : ""}`}
            onClick={() => setRole("creator", !creatorOn)}
          >
            Creator
          </button>
          <button
            type="button"
            className={`chip ${approverOn ? "chip-on" : ""}`}
            onClick={() => setRole("approver", !approverOn)}
          >
            Approver
          </button>
        </div>
        <p className="config-section-note muted">
          Worker earns from open tasks. Creator posts and escrows G$. Approver
          validates submissions on tasks you own.
        </p>
      </section>

      {workerOn && (
        <section className="config-section">
          <h4 className="config-section-title">Worker settings</h4>
          <div className="deploy-config-grid">
            <ConfigField label="Scan interval (sec)">
              <input
                value={config.SCAN_INTERVAL_SECONDS ?? "300"}
                onChange={(e) => onChange("SCAN_INTERVAL_SECONDS", e.target.value)}
                inputMode="numeric"
              />
            </ConfigField>
            <ConfigField label="Minimum reward">
              <input
                value={config.MIN_REWARD ?? "1"}
                onChange={(e) => onChange("MIN_REWARD", e.target.value)}
                inputMode="numeric"
              />
            </ConfigField>
            <ConfigField label="Reward tokens">
              <input
                value={config.REWARD_TOKENS ?? "G$,USDC,CELO,cUSD"}
                onChange={(e) => onChange("REWARD_TOKENS", e.target.value)}
              />
            </ConfigField>
            <ConfigField label="Max claims per scan">
              <input
                value={config.MAX_TASKS_PER_RUN ?? "1"}
                onChange={(e) => onChange("MAX_TASKS_PER_RUN", e.target.value)}
                inputMode="numeric"
              />
            </ConfigField>
          </div>
        </section>
      )}

      {creatorOn && (
        <section className="config-section">
          <h4 className="config-section-title">Creator task</h4>
          <div className="deploy-config-grid">
            <ConfigField label="Task ID" className="deploy-config-full">
              <input
                value={config.CREATE_TASK_ID ?? ""}
                onChange={(e) => onChange("CREATE_TASK_ID", e.target.value)}
                placeholder="Unique id, e.g. GoodAgentWeek-01"
              />
            </ConfigField>
            <ConfigField label="Title" className="deploy-config-full">
              <input
                value={config.CREATE_TITLE ?? ""}
                onChange={(e) => onChange("CREATE_TITLE", e.target.value)}
                placeholder="Task title"
              />
            </ConfigField>
            <ConfigField label="Description" className="deploy-config-full">
              <textarea
                value={config.CREATE_DESCRIPTION ?? ""}
                onChange={(e) => onChange("CREATE_DESCRIPTION", e.target.value)}
                rows={3}
                placeholder="What should workers deliver?"
              />
            </ConfigField>
            <ConfigField label="Reward per slot">
              <input
                value={config.CREATE_REWARD ?? ""}
                onChange={(e) => onChange("CREATE_REWARD", e.target.value)}
                inputMode="decimal"
                placeholder="e.g. 500"
              />
            </ConfigField>
            <ConfigField label="Slots">
              <input
                value={config.CREATE_SLOTS ?? "1"}
                onChange={(e) => onChange("CREATE_SLOTS", e.target.value)}
                inputMode="numeric"
              />
            </ConfigField>
            <ConfigField label="Token">
              <input
                value={config.CREATE_TOKEN ?? "G$"}
                onChange={(e) => onChange("CREATE_TOKEN", e.target.value)}
              />
            </ConfigField>
            <ConfigField label="Visibility">
              <input
                value={config.CREATE_VISIBILITY ?? "public"}
                onChange={(e) => onChange("CREATE_VISIBILITY", e.target.value)}
              />
            </ConfigField>
            <ConfigField label="Max escrow (G$)" className="deploy-config-full">
              <input
                value={config.MAX_ESCROW_GS ?? "500"}
                onChange={(e) => onChange("MAX_ESCROW_GS", e.target.value)}
                inputMode="numeric"
              />
            </ConfigField>
            <ConfigField label="Wallet reserve (G$)" className="deploy-config-full">
              <input
                value={config.MIN_WALLET_RESERVE_GS ?? "10"}
                onChange={(e) =>
                  onChange("MIN_WALLET_RESERVE_GS", e.target.value)
                }
                inputMode="numeric"
              />
            </ConfigField>
          </div>
          {escrow != null && (
            <p className="config-section-note muted">
              Escrow on create: ~{escrow} G$ (reward × slots + 1% fee). Agent
              wallet is funded with 200 G$ base + this amount at deploy.
            </p>
          )}
        </section>
      )}

      {approverOn && (
        <section className="config-section">
          <h4 className="config-section-title">Approver</h4>
          <ConfigField label="Extra task IDs (comma-separated)" className="deploy-config-full">
            <input
              value={config.APPROVE_TASK_IDS ?? ""}
              onChange={(e) => onChange("APPROVE_TASK_IDS", e.target.value)}
              placeholder="Optional — defaults to tasks this agent created"
            />
          </ConfigField>
        </section>
      )}
    </div>
  );
}
