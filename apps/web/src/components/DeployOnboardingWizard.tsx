import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export type OnboardStep = 1 | 2 | 3;

export const ONBOARD_STEPS = [
  { n: 1 as OnboardStep, label: "Basic information" },
  { n: 2 as OnboardStep, label: "Configure agent" },
  { n: 3 as OnboardStep, label: "Preview & create" },
] as const;

export function OnboardStepper({ step }: { step: OnboardStep }) {
  return (
    <nav className="onboard-stepper" aria-label="Deploy progress">
      <ol className="onboard-stepper-track">
        {ONBOARD_STEPS.map(({ n, label }, index) => {
          const done = step > n;
          const active = step === n;
          const state = done ? "is-done" : active ? "is-active" : "is-upcoming";
          return (
            <li key={n} className={`onboard-stepper-item ${state}`}>
              <span className="onboard-stepper-node" aria-hidden>
                {done ? (
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                    <path
                      d="M3.5 8.5 6.5 11.5 12.5 4.5"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  n
                )}
              </span>
              <span className="onboard-stepper-label">{label}</span>
              {index < ONBOARD_STEPS.length - 1 && (
                <span className="onboard-stepper-line" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function OnboardPageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="onboard-page-header">
      <h1 className="onboard-page-title">{title}</h1>
      {subtitle ? <p className="onboard-page-subtitle">{subtitle}</p> : null}
    </header>
  );
}

export function OnboardCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`onboard-card ${className}`.trim()}>{children}</section>
  );
}

export function OnboardField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className={`onboard-field${error ? " has-error" : ""}`}>
      <span className="onboard-field-label">{label}</span>
      {children}
      {error ? (
        <span className="onboard-field-error">{error}</span>
      ) : hint ? (
        <span className="onboard-field-hint">{hint}</span>
      ) : null}
    </label>
  );
}

export function OnboardActions({
  onBack,
  onPrimary,
  onCancel,
  backLabel = "Back",
  primaryLabel = "Continue",
  cancelLabel = "Cancel",
  primaryDisabled,
  backDisabled,
  showBack = true,
  showCancel = false,
  busy,
}: {
  onBack?: () => void;
  onPrimary: () => void;
  onCancel?: () => void;
  backLabel?: string;
  primaryLabel?: string;
  cancelLabel?: string;
  primaryDisabled?: boolean;
  backDisabled?: boolean;
  showBack?: boolean;
  showCancel?: boolean;
  busy?: boolean;
}) {
  return (
    <footer className="onboard-actions">
      <div className="onboard-actions-left">
        {showCancel && onCancel ? (
          <Link to="/" className="btn btn-ghost onboard-btn-ghost">
            {cancelLabel}
          </Link>
        ) : showBack && onBack ? (
          <button
            type="button"
            className="btn btn-ghost onboard-btn-ghost"
            disabled={backDisabled}
            onClick={onBack}
          >
            {backLabel}
          </button>
        ) : (
          <span />
        )}
      </div>
      <button
        type="button"
        className="btn btn-primary onboard-btn-primary"
        disabled={primaryDisabled || busy}
        onClick={onPrimary}
      >
        {busy ? "Creating…" : primaryLabel}
      </button>
    </footer>
  );
}

export function OnboardReviewStep({
  name,
  skillName,
  highlights,
  configRows,
  fundingNote,
  note,
  error,
  onBack,
  onCreate,
  busy,
  backDisabled,
  createDisabled,
}: {
  name: string;
  skillName: string;
  highlights: string[];
  configRows: { label: string; value: string }[];
  fundingNote: string;
  note?: ReactNode;
  error?: string | null;
  onBack: () => void;
  onCreate: () => void;
  busy?: boolean;
  backDisabled?: boolean;
  createDisabled?: boolean;
}) {
  const initial = (name.trim()[0] ?? "A").toUpperCase();

  return (
    <OnboardCard className="onboard-review-card">
      <div className="onboard-review-hero">
        <div className="onboard-review-avatar" aria-hidden>
          {initial}
        </div>
        <div className="onboard-review-identity">
          <h2 className="onboard-review-name">
            {name.trim() || "Untitled agent"}
          </h2>
          <p className="onboard-review-skill">{skillName}</p>
        </div>
        {highlights.length > 0 && (
          <ul className="onboard-review-badges">
            {highlights.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        )}
      </div>

      {configRows.length > 0 && (
        <dl className="onboard-review-stats">
          {configRows.map(({ label, value }) => (
            <div key={label} className="onboard-review-stat">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="onboard-review-funding">{fundingNote}</p>
      {note ? <p className="onboard-review-note">{note}</p> : null}
      {error ? <p className="error onboard-review-error">{error}</p> : null}

      <OnboardActions
        showBack
        onBack={onBack}
        backDisabled={backDisabled}
        primaryLabel="Create agent"
        primaryDisabled={createDisabled}
        busy={busy}
        onPrimary={onCreate}
      />
    </OnboardCard>
  );
}

export function OnboardSuccessOverlay({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="onboard-success" role="status" aria-live="polite">
      <div className="onboard-success-ring">
        <svg viewBox="0 0 48 48" width="48" height="48" fill="none">
          <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2" />
          <path
            d="M14 25l7 7 13-14"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p>Agent created</p>
    </div>
  );
}
