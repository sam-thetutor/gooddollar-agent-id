import type { SkillStatsView } from "@goodagent/shared";
import { formatMatchWhen, matchResultLabel } from "../lib/agent-display.js";

export function SkillStatsPanel({
  title,
  stats,
  configRows,
  emptyMessage,
  onEditSettings,
  canEdit,
}: {
  title: string;
  stats: SkillStatsView | null | undefined;
  configRows?: Array<{ label: string; value: string }>;
  emptyMessage?: string;
  onEditSettings?: () => void;
  canEdit?: boolean;
}) {
  return (
    <div className="ga-widget-dash-section">
      <div className="ga-widget-dash-section-head">
        <h4>{title}</h4>
        {canEdit && onEditSettings ? (
          <button
            type="button"
            className="ga-widget-btn ga-widget-btn-compact"
            onClick={onEditSettings}
          >
            Edit
          </button>
        ) : null}
      </div>

      {configRows?.length ? (
        <dl className="ga-widget-config-summary">
          {configRows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {stats && stats.gamesPlayed > 0 ? (
        <>
          <p className="ga-widget-muted">
            {stats.wins}W · {stats.losses}L · {stats.matchesToday} today
            {stats.summary ? ` · ${stats.summary}` : ""}
          </p>
          {stats.matches.length > 0 ? (
            <ul className="ga-widget-match-list">
              {stats.matches.slice(0, 5).map((m) => (
                <li key={`${m.matchId}-${m.at}`}>
                  <span>#{m.matchId}</span>
                  <span>{matchResultLabel(m.result)}</span>
                  <span className="ga-widget-muted">{formatMatchWhen(m.at)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <p className="ga-widget-muted">
          {emptyMessage ??
            "No activity yet — stats appear once this skill runs."}
        </p>
      )}
    </div>
  );
}
