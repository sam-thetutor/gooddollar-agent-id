import type { DeployAgent } from "../client/host.js";
import { formatStatusLabel } from "../lib/agent-display.js";

export function AgentSelect({
  agents,
  value,
  onChange,
  label = "Select agent",
  disabled,
}: {
  agents: DeployAgent[];
  value: string;
  onChange: (deployId: string, agentAddress: string) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <label className="ga-widget-field ga-widget-agent-select">
      <span>{label}</span>
      <select
        className="ga-widget-select"
        value={value}
        disabled={disabled || agents.length === 0}
        onChange={(e) => {
          const id = e.target.value;
          const agent = agents.find((a) => a.id === id);
          if (agent?.agentAddress) onChange(id, agent.agentAddress);
        }}
      >
        {agents.length === 0 && (
          <option value="">No agents yet</option>
        )}
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.displayName}
            {a.agentAddress
              ? ` · ${formatStatusLabel(a.status)}`
              : " · setting up…"}
          </option>
        ))}
      </select>
    </label>
  );
}
