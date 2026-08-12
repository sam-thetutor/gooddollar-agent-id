import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useSignMessage } from "wagmi";
import { ConnectButton, Nav } from "../components/Nav.js";
import { Footer } from "../components/Footer.js";
import { GamearenaConfigFields } from "../components/GamearenaConfigFields.js";
import { BalaioConfigFields } from "../components/BalaioConfigFields.js";
import {
  createDeploy,
  getDeployStatus,
  runDeployPipeline,
  startDeploy,
  type DeployStatusResponse,
  type SkillConfiguration,
} from "../lib/host.js";
import { signDeployControl } from "../lib/deploy-control.js";
import { deployNeedsUserVouch, issueAgentHref } from "../lib/deploy-vouch.js";
import {
  GAMEARENA_SKILL_ID,
  parsePlayMode,
  playModeLabel,
  strategyLabelFromConfig,
} from "../lib/gamearena-config.js";
import {
  isBalaioRoleEnabled,
} from "../lib/balaio-config.js";
import {
  DEFAULT_DEPLOY_SKILL_ID,
  filterListedSkills,
  resolveDefaultDeploySkillId,
} from "../lib/skill-registry.js";
import { usePageMeta } from "../lib/usePageMeta.js";
import {
  OnboardActions,
  OnboardCard,
  OnboardField,
  OnboardPageHeader,
  OnboardReviewStep,
  OnboardStepper,
  OnboardSuccessOverlay,
  type OnboardStep,
} from "../components/DeployOnboardingWizard.js";

const DEPLOY_DRAFT_KEY = "goodagent-deploy-draft-v2";
import { MAX_DEPLOY_SKILLS } from "@goodagent/shared";

const REGISTRY_URL =
  "https://raw.githubusercontent.com/sam-thetutor/goodagent-skills/main/registry.json";

const UBI_REMINDER_SKILL_ID = "social/reminder/ubi_claim_reminder";
const BALAIO_WORKER_SKILL_ID = "work/marketplace/balaio_worker";

interface SkillEntry {
  name: string;
  skill_id: string;
  path: string;
  description: string;
  chain: string;
  spends_tokens: boolean;
  listed?: boolean;
  enabled?: boolean;
  modes?: string[];
  token?: string;
  game?: string;
  game_url?: string;
}

interface Registry {
  version: number;
  skills: SkillEntry[];
}

async function fetchRegistry(): Promise<Registry> {
  const res = await fetch(REGISTRY_URL);
  if (!res.ok) throw new Error(`registry fetch failed: ${res.status}`);
  return res.json() as Promise<Registry>;
}

const STEPS = [
  { id: "create", label: "Create job" },
  { id: "fund", label: "Fund wallet" },
  { id: "install", label: "Install skill" },
  { id: "vouch", label: "You vouch" },
  { id: "live", label: "Go live" },
] as const;

function stepIndex(status: string, pipelineRunning: boolean): number {
  // Step i is active when current === i + 1; done when current > i + 1.
  if (status === "pending_payment") return 1;
  if (status === "provisioning" || pipelineRunning) return 2;
  if (status === "installing") return 3;
  if (status === "awaiting_vouch") return 4;
  if (status === "starting") return 5;
  if (status === "running") return 6;
  if (status === "failed") return -1;
  return 1;
}

function defaultConfigForSkill(skillId: string): SkillConfiguration {
  if (skillId === "gaming/wagering/gamearena_1v1") {
    return {
      PLAY_MODE: "offchain",
      MARKOV_STRATEGY: "random",
      RPS_SEQUENCE: "rock,paper,scissors",
      RPS_FIXED: "rock",
      DAILY_MATCH_CAP: "50",
      AUTO_REFILL: "1",
      DAILY_REFILL_CAP_GS: "20",
      MAX_REFILLS_PER_DAY: "10",
      WAGER_GS: "1",
      DAILY_LOSS_CAP_GS: "20",
      ACCEPT_TIMEOUT_SECONDS: "90",
      GAME_TYPE: "0",
      MAX_MATCHES: "10",
      MATCH_INTERVAL_SECONDS: "300",
      ROUND_PACE_MS: "2500",
    };
  }
  if (skillId === "gaming/card-fighter/actionorder_vshouse") {
    return {
      CHARACTER_ID: "riven",
      STRATEGY: "anti_strike",
      DIFFICULTY: "0",
      MAX_MATCHES: "5",
      DAILY_MATCH_CAP: "50",
      MATCH_INTERVAL_SECONDS: "10",
    };
  }
  if (skillId === UBI_REMINDER_SKILL_ID) {
    return {
      REMINDER_INTERVAL_MINUTES: "15",
      IDENTITY_EXPIRY_WARN_DAYS: "14",
    };
  }
  if (skillId === BALAIO_WORKER_SKILL_ID) {
    return {
      ENABLE_WORKER: "1",
      ENABLE_CREATE: "0",
      ENABLE_APPROVE: "0",
      SCAN_INTERVAL_SECONDS: "300",
      MIN_REWARD: "1",
      REWARD_TOKENS: "G$,USDC,CELO,cUSD",
      MAX_TASKS_PER_RUN: "1",
      CREATE_SLOTS: "1",
      CREATE_TOKEN: "G$",
      CREATE_VISIBILITY: "public",
      MAX_ESCROW_GS: "500",
      MIN_WALLET_RESERVE_GS: "10",
      CREATE_ONCE: "1",
    };
  }
  return {};
}

const CHARACTERS = [
  { id: "riven", label: "Riven" },
  { id: "mira", label: "Mira" },
  { id: "kade", label: "Kade" },
] as const;

const STRATEGIES = [
  { id: "anti_strike", label: "Anti-strike" },
  { id: "rush", label: "Rush" },
  { id: "balanced", label: "Balanced" },
] as const;

function ActionorderFields({
  config,
  onChange,
}: {
  config: SkillConfiguration;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="deploy-config-grid">
      <label className="field">
        <span>Character</span>
        <select
          value={config.CHARACTER_ID ?? "riven"}
          onChange={(e) => onChange("CHARACTER_ID", e.target.value)}
        >
          {CHARACTERS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Strategy</span>
        <select
          value={config.STRATEGY ?? "anti_strike"}
          onChange={(e) => onChange("STRATEGY", e.target.value)}
        >
          {STRATEGIES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>House difficulty</span>
        <select
          value={config.DIFFICULTY ?? "0"}
          onChange={(e) => onChange("DIFFICULTY", e.target.value)}
        >
          <option value="0">Easy</option>
          <option value="1">Normal</option>
          <option value="2">Hard</option>
          <option value="3">Expert</option>
        </select>
      </label>

      <label className="field">
        <span>Max matches per day</span>
        <input
          value={config.MAX_MATCHES ?? "5"}
          onChange={(e) => onChange("MAX_MATCHES", e.target.value)}
          inputMode="numeric"
        />
      </label>

      <label className="field">
        <span>Pause between matches</span>
        <div className="input-suffix">
          <input
            value={config.MATCH_INTERVAL_SECONDS ?? "10"}
            onChange={(e) => onChange("MATCH_INTERVAL_SECONDS", e.target.value)}
            inputMode="numeric"
          />
          <span className="input-suffix-label">sec</span>
        </div>
      </label>
    </div>
  );
}

function UbiReminderFields({
  config,
  onChange,
  botToken,
  onTokenChange,
}: {
  config: SkillConfiguration;
  onChange: (key: string, value: string) => void;
  botToken: string;
  onTokenChange: (value: string) => void;
}) {
  return (
    <div className="deploy-config-grid">
      <label className="field deploy-config-full">
        <span>Telegram bot token</span>
        <input
          type="password"
          value={botToken}
          onChange={(e) => onTokenChange(e.target.value)}
          placeholder="123456789:AA…  (from @BotFather)"
          autoComplete="off"
        />
      </label>

      <label className="field">
        <span>Scan interval</span>
        <div className="input-suffix">
          <input
            value={config.REMINDER_INTERVAL_MINUTES ?? "15"}
            onChange={(e) =>
              onChange("REMINDER_INTERVAL_MINUTES", e.target.value)
            }
            inputMode="numeric"
          />
          <span className="input-suffix-label">min</span>
        </div>
      </label>

      <label className="field">
        <span>Identity expiry warning</span>
        <div className="input-suffix">
          <input
            value={config.IDENTITY_EXPIRY_WARN_DAYS ?? "14"}
            onChange={(e) =>
              onChange("IDENTITY_EXPIRY_WARN_DAYS", e.target.value)
            }
            inputMode="numeric"
          />
          <span className="input-suffix-label">days</span>
        </div>
      </label>

      <p className="muted hint deploy-config-full">
        Create a bot with{" "}
        <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">
          @BotFather
        </a>{" "}
        and paste its token here. The token is encrypted at rest and only ever
        used by your deployed agent. The bot reads public chain data only — it
        never holds funds.
      </p>
    </div>
  );
}

function BrainChatFields({
  enabled,
  onEnabledChange,
  botToken,
  onTokenChange,
  disabled,
}: {
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  botToken: string;
  onTokenChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="deploy-config-grid">
      <label
        className={`brain-toggle deploy-config-full${enabled ? " is-on" : ""}`}
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          disabled={disabled}
        />
        <span className="brain-toggle-track" aria-hidden="true">
          <span className="brain-toggle-knob" />
        </span>
        <span className="brain-toggle-text">
          <strong>Enable AI chat (Telegram)</strong>
          <small>
            Your agent answers people on Telegram with live stats and
            GoodDollar help.
          </small>
        </span>
      </label>
      {enabled ? (
        <>
          <label className="field deploy-config-full">
            <span>Chat bot token</span>
            <input
              type="password"
              value={botToken}
              onChange={(e) => onTokenChange(e.target.value)}
              placeholder="123456789:AA…  (from @BotFather)"
              autoComplete="off"
              disabled={disabled}
            />
          </label>
          <p className="muted hint deploy-config-full">
            Gives your agent a chat persona: it answers questions on Telegram,
            reports its own live stats, verifies addresses, and checks
            GoodDollar claim eligibility. Powered by decentralized AntSeed
            inference paid in G$. Create a separate bot with{" "}
            <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">
              @BotFather
            </a>{" "}
            and paste its token — it is encrypted at rest. Chat is read-only:
            the bot never holds funds or places bets.
          </p>
        </>
      ) : (
        <p className="muted hint deploy-config-full">
          Optional: let people talk to your agent on Telegram. It answers with
          live stats and GoodDollar help, powered by AntSeed inference paid in
          G$.
        </p>
      )}
    </div>
  );
}

function deployFundingShort(
  skillId: string,
  balaioSkill: boolean,
  balaioCreator: boolean,
): string {
  if (skillId === UBI_REMINDER_SKILL_ID) {
    return "Telegram only — no play wallet. Refundable 250 G$ bond at /issue.";
  }
  if (balaioSkill) {
    return balaioCreator
      ? "G$ for escrow + CELO for gas · 250 G$ bond at /issue"
      : "CELO for gas · 250 G$ bond at /issue";
  }
  if (skillId === GAMEARENA_SKILL_ID) {
    return "G$ for refills + CELO for gas · 250 G$ bond at /issue";
  }
  return "200 G$ + CELO for gas · 250 G$ bond at /issue";
}

function deployReviewRows(
  skillId: string,
  config: SkillConfiguration,
  botToken?: string,
): { label: string; value: string }[] {
  if (skillId === GAMEARENA_SKILL_ID) {
    const playMode = parsePlayMode(config);
    const showOnchain = playMode === "onchain" || playMode === "auto";
    const showOffchain = playMode === "offchain" || playMode === "auto";
    const autoRefill = (config.AUTO_REFILL ?? "1") !== "0";

    const rows: { label: string; value: string }[] = [
      { label: "Play mode", value: playModeLabel(playMode) },
      { label: "Strategy", value: strategyLabelFromConfig(config) },
    ];

    if (showOffchain) {
      rows.push({
        label: "Auto-refill",
        value: autoRefill ? "On" : "Off",
      });
      if (autoRefill) {
        rows.push(
          {
            label: "Refill budget / day",
            value: `${config.DAILY_REFILL_CAP_GS ?? "20"} G$`,
          },
          {
            label: "Max refills / day",
            value: config.MAX_REFILLS_PER_DAY ?? "10",
          },
        );
      }
      rows.push({
        label: "Daily match cap",
        value: config.DAILY_MATCH_CAP ?? "50",
      });
    }

    rows.push(
      {
        label: "Max matches / run",
        value: config.MAX_MATCHES ?? "10",
      },
      {
        label: "Pause between matches",
        value: `${config.MATCH_INTERVAL_SECONDS ?? "300"} sec`,
      },
    );

    if (showOffchain) {
      rows.push({
        label: "Round pace (spectator)",
        value: `${config.ROUND_PACE_MS ?? "1000"} ms`,
      });
    }

    if (showOnchain) {
      rows.push(
        {
          label: "Wager per match",
          value: `${config.WAGER_GS ?? "1"} G$`,
        },
        {
          label: "Daily loss cap",
          value: `${config.DAILY_LOSS_CAP_GS ?? "20"} G$`,
        },
        {
          label: "Accept timeout",
          value: `${config.ACCEPT_TIMEOUT_SECONDS ?? "90"} sec`,
        },
      );
    }

    return rows;
  }
  if (skillId === "gaming/card-fighter/actionorder_vshouse") {
    const char =
      CHARACTERS.find((c) => c.id === config.CHARACTER_ID)?.label ??
      config.CHARACTER_ID ??
      "Riven";
    const strat =
      STRATEGIES.find((s) => s.id === config.STRATEGY)?.label ??
      config.STRATEGY ??
      "Anti-strike";
    const diff = ["Easy", "Normal", "Hard", "Expert"][
      Number(config.DIFFICULTY ?? "0")
    ] ?? "Easy";
    return [
      { label: "Character", value: char },
      { label: "Strategy", value: strat },
      { label: "Difficulty", value: diff },
      { label: "Max matches per day", value: config.MAX_MATCHES ?? "5" },
      {
        label: "Pause between matches",
        value: `${config.MATCH_INTERVAL_SECONDS ?? "10"} sec`,
      },
    ];
  }
  if (skillId === UBI_REMINDER_SKILL_ID) {
    return [
      {
        label: "Telegram bot",
        value: botToken?.trim()
          ? `${botToken.slice(0, 8)}… (token set)`
          : "Not set",
      },
      {
        label: "Scan interval",
        value: `${config.REMINDER_INTERVAL_MINUTES ?? "15"} min`,
      },
      {
        label: "Identity expiry warning",
        value: `${config.IDENTITY_EXPIRY_WARN_DAYS ?? "14"} days`,
      },
    ];
  }
  if (skillId === BALAIO_WORKER_SKILL_ID) {
    const roles = [
      config.ENABLE_WORKER === "1" ? "Worker" : null,
      config.ENABLE_CREATE === "1" ? "Creator" : null,
      config.ENABLE_APPROVE === "1" ? "Approver" : null,
    ].filter(Boolean);
    return [
      { label: "Roles", value: roles.join(", ") || "Worker" },
      {
        label: "Scan interval",
        value: `${config.SCAN_INTERVAL_SECONDS ?? "300"} sec`,
      },
      { label: "Min reward", value: config.MIN_REWARD ?? "1" },
      { label: "Reward tokens", value: config.REWARD_TOKENS ?? "G$" },
    ];
  }
  return [{ label: "Configuration", value: "Registry defaults" }];
}

type WizardStep = OnboardStep;

function previewHighlights(
  skillId: string,
  config: SkillConfiguration,
): string[] {
  if (skillId === GAMEARENA_SKILL_ID) {
    return [
      playModeLabel(parsePlayMode(config)),
      strategyLabelFromConfig(config),
      `${config.DAILY_MATCH_CAP ?? "50"} matches/day`,
    ];
  }
  if (skillId === "gaming/card-fighter/actionorder_vshouse") {
    const char =
      CHARACTERS.find((c) => c.id === config.CHARACTER_ID)?.label ?? "Riven";
    return [char, `${config.MAX_MATCHES ?? "5"} matches/day`];
  }
  if (skillId === UBI_REMINDER_SKILL_ID) {
    return ["Telegram", "Read-only", "Chain watcher"];
  }
  if (skillId === BALAIO_WORKER_SKILL_ID) {
    return isBalaioRoleEnabled(config, "creator")
      ? ["Balaio creator", "G$ escrow"]
      : ["Balaio worker", "On-chain tasks"];
  }
  return ["Hosted runtime", "GoodAgent ID"];
}

function DeployPipeline({
  status,
  deployId,
  onRetry,
  onStartAfterVouch,
  startBusy,
}: {
  status: DeployStatusResponse;
  deployId: string;
  onRetry: () => void;
  onStartAfterVouch: () => void;
  startBusy: boolean;
}) {
  const current = stepIndex(status.status, status.pipelineRunning);
  const failed = status.status === "failed";
  const done = status.status === "running";
  const needsVouch = deployNeedsUserVouch(status);
  const vouched = status.verify?.valid === true;
  const issueHref = status.agentAddress
    ? issueAgentHref(status.agentAddress, deployId)
    : null;

  return (
    <section className="card deploy-status-card">
      <div className="deploy-status-head">
        <h2 className="card-title">Deployment</h2>
        <span className={`pill ${done ? "pill-ok" : failed ? "pill-bad" : "pill-warn"}`}>
          {status.status.replace(/_/g, " ")}
        </span>
      </div>

      <ol className="deploy-pipeline" aria-label="Deploy progress">
        {STEPS.map((step, i) => {
          const state =
            current > i + 1 ? "done" : current === i + 1 ? "active" : "pending";
          return (
            <li key={step.id} className={state}>
              <span className="deploy-pipeline-dot" aria-hidden />
              <span className="deploy-pipeline-label">{step.label}</span>
            </li>
          );
        })}
      </ol>

      <dl className="kv-grid deploy-kv">
        {status.agentAddress && (
          <>
            <dt>Agent</dt>
            <dd>
              <code>{status.agentAddress}</code>
            </dd>
          </>
        )}
        {status.skillId && (
          <>
            <dt>Skill</dt>
            <dd>
              <code>{status.skillId.split("/").pop()}</code>
            </dd>
          </>
        )}
        {status.pm2 && (
          <>
            <dt>Process</dt>
            <dd>
              {status.pm2.name} · {status.pm2.status}
            </dd>
          </>
        )}
      </dl>

      {status.lastError && <p className="error">{status.lastError}</p>}

      {needsVouch && issueHref && (
        <section className="deploy-vouch-card" aria-label="Vouch required">
          <h3 className="card-title">Next: vouch for this agent</h3>
          <p className="muted hint">
            The play wallet is funded and the skill is installed. Issue an Agent
            ID from your verified wallet — this is separate from My Agents until
            you complete /issue.
          </p>
          <p className="muted hint">
            Agent <code>{status.agentAddress}</code>
          </p>
          <div className="actions">
            <Link className="btn btn-primary" to={issueHref}>
              Vouch at /issue
            </Link>
            <Link className="btn btn-ghost" to="/deployments">
              View in deployments
            </Link>
          </div>
        </section>
      )}

      <div className="actions">
        {done && (
          <Link className="btn btn-primary" to={`/dashboard/${deployId}`}>
            Open dashboard
          </Link>
        )}
        {needsVouch && issueHref && (
          <>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!vouched || startBusy}
              onClick={onStartAfterVouch}
              title={
                vouched
                  ? "Start the agent process on the host"
                  : "Complete /issue with your wallet first"
              }
            >
              {startBusy ? "Starting…" : "Start agent"}
            </button>
          </>
        )}
        {failed && (
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            Retry deploy
          </button>
        )}
        {status.pipelineRunning && (
          <span className="muted hint">Running pipeline…</span>
        )}
        {!done && !needsVouch && !failed && !status.pipelineRunning && (
          <span className="muted hint">
            Provisioning wallet, funding play balance, and installing skill
          </span>
        )}
      </div>
    </section>
  );
}

export function Deploy() {
  usePageMeta(
    "Deploy Agent — GoodAgent",
    "Deploy a 24/7 agent: GameArena and ACTION-ORDER players, or a Telegram UBI reminder bot.",
  );

  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [searchParams] = useSearchParams();
  const { data: registry, isLoading: registryLoading } = useQuery({
    queryKey: ["skills-registry"],
    queryFn: fetchRegistry,
    staleTime: 60_000,
  });

  const deployableSkills = useMemo(
    () => filterListedSkills(registry?.skills ?? []),
    [registry],
  );

  const defaultSkillId = useMemo(
    () => resolveDefaultDeploySkillId(registry?.skills ?? []),
    [registry],
  );

  const [name, setName] = useState("My GameArena Agent");
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([
    DEFAULT_DEPLOY_SKILL_ID,
  ]);
  const [activeSkillId, setActiveSkillId] = useState(DEFAULT_DEPLOY_SKILL_ID);
  const [skillConfigs, setSkillConfigs] = useState<
    Record<string, SkillConfiguration>
  >(() => ({
    [DEFAULT_DEPLOY_SKILL_ID]: defaultConfigForSkill(DEFAULT_DEPLOY_SKILL_ID),
  }));
  const [botToken, setBotToken] = useState("");
  const [brainEnabled, setBrainEnabled] = useState(false);
  const [brainBotToken, setBrainBotToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [startBusy, setStartBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deployId, setDeployId] = useState<string | null>(
    () => searchParams.get("job"),
  );
  const [status, setStatus] = useState<DeployStatusResponse | null>(null);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [nameTouched, setNameTouched] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);

  const skillId = activeSkillId;
  const config = skillConfigs[activeSkillId] ?? defaultConfigForSkill(activeSkillId);

  const selectedSkill = deployableSkills.find((s) => s.skill_id === skillId);
  const selectedSkills = deployableSkills.filter((s) =>
    selectedSkillIds.includes(s.skill_id),
  );

  function toggleSkill(nextSkillId: string) {
    setSelectedSkillIds((prev) => {
      const has = prev.includes(nextSkillId);
      if (has) {
        if (prev.length === 1) return prev;
        const next = prev.filter((id) => id !== nextSkillId);
        if (activeSkillId === nextSkillId) {
          setActiveSkillId(next[0] ?? DEFAULT_DEPLOY_SKILL_ID);
        }
        return next;
      }
      if (prev.length >= MAX_DEPLOY_SKILLS) return prev;
      setSkillConfigs((configs) => ({
        ...configs,
        [nextSkillId]: configs[nextSkillId] ?? defaultConfigForSkill(nextSkillId),
      }));
      setActiveSkillId(nextSkillId);
      return [...prev, nextSkillId];
    });
  }

  useEffect(() => {
    if (deployId || searchParams.get("job")) return;
    try {
      const raw = localStorage.getItem(DEPLOY_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        name?: string;
        skillId?: string;
        selectedSkillIds?: string[];
        activeSkillId?: string;
        skillConfigs?: Record<string, SkillConfiguration>;
        config?: SkillConfiguration;
        botToken?: string;
        brainEnabled?: boolean;
        brainBotToken?: string;
        wizardStep?: WizardStep;
      };
      if (draft.name) setName(draft.name);
      if (draft.selectedSkillIds?.length) {
        setSelectedSkillIds(draft.selectedSkillIds);
      } else if (draft.skillId) {
        setSelectedSkillIds([draft.skillId]);
      }
      if (draft.activeSkillId) setActiveSkillId(draft.activeSkillId);
      else if (draft.skillId) setActiveSkillId(draft.skillId);
      if (draft.skillConfigs) setSkillConfigs(draft.skillConfigs);
      else if (draft.config && (draft.activeSkillId || draft.skillId)) {
        setSkillConfigs({
          [draft.activeSkillId ?? draft.skillId!]: draft.config,
        });
      }
      if (draft.botToken) setBotToken(draft.botToken);
      if (draft.brainEnabled) setBrainEnabled(true);
      if (draft.brainBotToken) setBrainBotToken(draft.brainBotToken);
      if (draft.wizardStep) setWizardStep(draft.wizardStep);
    } catch {
      localStorage.removeItem(DEPLOY_DRAFT_KEY);
    }
  }, [deployId, searchParams]);

  useEffect(() => {
    if (deployId) return;
    const saveTimer = window.setTimeout(() => {
      localStorage.setItem(
        DEPLOY_DRAFT_KEY,
        JSON.stringify({
          name,
          selectedSkillIds,
          activeSkillId,
          skillConfigs,
          botToken,
          brainEnabled,
          brainBotToken,
          wizardStep,
        }),
      );
      setDraftSaved(true);
    }, 400);
    const hideTimer = window.setTimeout(() => setDraftSaved(false), 2000);
    return () => {
      window.clearTimeout(saveTimer);
      window.clearTimeout(hideTimer);
    };
  }, [name, selectedSkillIds, activeSkillId, skillConfigs, botToken, brainEnabled, brainBotToken, wizardStep, deployId]);

  useEffect(() => {
    const job = searchParams.get("job");
    if (job && job !== deployId) setDeployId(job);
  }, [searchParams, deployId]);

  const poll = useCallback(async (id: string) => {
    const s = await getDeployStatus(id);
    setStatus(s);
    return s;
  }, []);

  useEffect(() => {
    if (!deployId) return;
    void poll(deployId);
    const t = setInterval(() => {
      void poll(deployId);
    }, 4000);
    return () => clearInterval(t);
  }, [deployId, poll]);

  useEffect(() => {
    const fromUrl = searchParams.get("skill");
    if (
      fromUrl &&
      deployableSkills.some((s) => s.skill_id === fromUrl)
    ) {
      setSelectedSkillIds([fromUrl]);
      setActiveSkillId(fromUrl);
      setSkillConfigs((prev) => ({
        ...prev,
        [fromUrl]: prev[fromUrl] ?? defaultConfigForSkill(fromUrl),
      }));
      return;
    }
    if (
      deployableSkills.length > 0 &&
      !selectedSkillIds.some((id) =>
        deployableSkills.some((s) => s.skill_id === id),
      )
    ) {
      setSelectedSkillIds([defaultSkillId]);
      setActiveSkillId(defaultSkillId);
    }
  }, [selectedSkillIds, deployableSkills, defaultSkillId, searchParams]);

  useEffect(() => {
    setSkillConfigs((prev) => ({
      ...prev,
      [activeSkillId]: prev[activeSkillId] ?? defaultConfigForSkill(activeSkillId),
    }));
    if (activeSkillId === "gaming/wagering/gamearena_1v1") {
      setName("My GameArena Agent");
    } else if (activeSkillId === "gaming/card-fighter/actionorder_vshouse") {
      setName("My ACTION-ORDER Agent");
    } else if (activeSkillId === UBI_REMINDER_SKILL_ID) {
      setName("My UBI Reminder Agent");
    } else if (activeSkillId === BALAIO_WORKER_SKILL_ID) {
      setName("My Balaio Worker");
    }
  }, [activeSkillId]);

  function updateConfig(key: string, value: string) {
    setSkillConfigs((prev) => ({
      ...prev,
      [activeSkillId]: { ...(prev[activeSkillId] ?? {}), [key]: value },
    }));
  }

  async function handleDeploy() {
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const { agent } = await createDeploy({
        displayName: name.trim(),
        ownerWallet: address,
        skillIds: selectedSkillIds,
        skillConfigurations: Object.fromEntries(
          selectedSkillIds.map((id) => [id, skillConfigs[id] ?? {}]),
        ),
        telegramBotToken: selectedSkillIds.includes(UBI_REMINDER_SKILL_ID)
          ? botToken.trim()
          : undefined,
        brain:
          brainEnabled && brainBotToken.trim()
            ? { enabled: true, botToken: brainBotToken.trim() }
            : undefined,
        template: selectedSkillIds.includes(UBI_REMINDER_SKILL_ID)
          ? "social"
          : selectedSkillIds.includes(BALAIO_WORKER_SKILL_ID)
            ? "work"
            : "gaming",
        skipPayment: true,
      });
      setDeployId(agent.id);
      localStorage.removeItem(DEPLOY_DRAFT_KEY);
      setShowSuccess(true);
      window.setTimeout(() => setShowSuccess(false), 1800);
      const auth = await signDeployControl(
        "run-pipeline",
        agent.id,
        address,
        (args) => signMessageAsync(args),
      );
      await runDeployPipeline(agent.id, auth);
      await poll(agent.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const formLocked = busy || !!deployId;
  const balaioSkill = skillId === BALAIO_WORKER_SKILL_ID;
  const balaioCreator = balaioSkill && isBalaioRoleEnabled(config, "creator");
  const fundingShort = deployFundingShort(skillId, balaioSkill, balaioCreator);

  const reviewConfigRows = useMemo(
    () =>
      selectedSkillIds.flatMap((id) => {
        const rows = deployReviewRows(
          id,
          skillConfigs[id] ?? {},
          id === UBI_REMINDER_SKILL_ID ? botToken : undefined,
        );
        if (selectedSkillIds.length === 1) return rows;
        const label = deployableSkills.find((s) => s.skill_id === id)?.name ?? id;
        return rows.map((row) => ({
          ...row,
          label: `${label} · ${row.label}`,
        }));
      }).concat(
        brainEnabled
          ? [
              {
                label: "AI chat",
                value: brainBotToken.trim()
                  ? `Enabled — ${brainBotToken.slice(0, 8)}… (token set)`
                  : "Enabled — token missing",
              },
            ]
          : [],
      ),
    [selectedSkillIds, skillConfigs, botToken, brainEnabled, brainBotToken, deployableSkills],
  );

  const step1Valid =
    name.trim().length > 0 &&
    deployableSkills.length > 0 &&
    selectedSkillIds.length > 0 &&
    selectedSkillIds.every((id) =>
      deployableSkills.some((s) => s.skill_id === id),
    );
  const step2Valid =
    step1Valid &&
    (!selectedSkillIds.includes(UBI_REMINDER_SKILL_ID) ||
      botToken.trim().length > 0) &&
    (!brainEnabled || brainBotToken.trim().length > 0);

  const nameError =
    nameTouched && name.trim().length === 0
      ? "Give your AI agent a memorable name."
      : null;

  const previewTags = useMemo(
    () => previewHighlights(skillId, config),
    [skillId, config],
  );

  function goWizardNext() {
    setError(null);
    if (wizardStep === 1) {
      setNameTouched(true);
      if (!step1Valid) return;
      setWizardStep(2);
    } else if (wizardStep === 2 && step2Valid) {
      setWizardStep(3);
    }
  }

  function goWizardBack() {
    setError(null);
    if (wizardStep === 3) setWizardStep(2);
    else if (wizardStep === 2) setWizardStep(1);
  }

  return (
    <>
      <Nav />
      <main className="page deploy-page">
        {!isConnected ? (
          <div className="container">
            <section className="card">
              <h2 className="card-title">Connect wallet</h2>
              <p className="muted">
                Connect your GoodDollar-verified wallet to own and manage this
                deploy.
              </p>
              <div className="actions">
                <ConnectButton />
              </div>
            </section>
          </div>
        ) : registryLoading ? (
          <div className="container">
            <section className="card">
              <p className="muted">Loading skills…</p>
            </section>
          </div>
        ) : (
          <>
            {!deployId ? (
              <div className="onboard-shell">
                <div className="onboard-sticky-header">
                  <OnboardStepper step={wizardStep} />
                </div>

                <div key={wizardStep} className="onboard-step">
                  {wizardStep === 1 && (
                    <OnboardCard>
                      <OnboardPageHeader
                        title="Basic information"
                        subtitle="Name your agent and pick a skill."
                      />
                      <OnboardField
                        label="Agent name"
                        hint="Give your AI agent a memorable name."
                        error={nameError}
                      >
                        <input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          onBlur={() => setNameTouched(true)}
                          placeholder="My GameArena Agent"
                          disabled={formLocked}
                          aria-invalid={!!nameError}
                        />
                      </OnboardField>

                      {deployableSkills.length > 0 ? (
                        <OnboardField
                          label="Skills"
                          hint={`Choose up to ${MAX_DEPLOY_SKILLS} skills for one agent wallet.`}
                        >
                          <div className="onboard-skill-grid">
                            {deployableSkills.map((skill) => {
                              const checked = selectedSkillIds.includes(
                                skill.skill_id,
                              );
                              return (
                                <label
                                  key={skill.skill_id}
                                  className={`onboard-skill-option${checked ? " is-selected" : ""}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={
                                      formLocked ||
                                      (!checked &&
                                        selectedSkillIds.length >=
                                          MAX_DEPLOY_SKILLS)
                                    }
                                    onChange={() => toggleSkill(skill.skill_id)}
                                  />
                                  <span>
                                    <strong>{skill.name}</strong>
                                    <small>{skill.description.slice(0, 96)}</small>
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </OnboardField>
                      ) : (
                        <p className="error">
                          No skills available.{" "}
                          <Link to="/skills">Browse registry</Link>
                        </p>
                      )}

                      <OnboardActions
                        showCancel
                        primaryLabel="Continue"
                        primaryDisabled={formLocked || !step1Valid}
                        onPrimary={goWizardNext}
                      />
                    </OnboardCard>
                  )}

                  {wizardStep === 2 && (
                    <OnboardCard>
                      <OnboardPageHeader
                        title="Configure agent"
                        subtitle={
                          selectedSkill?.description
                            ? selectedSkill.description.slice(0, 140) +
                              (selectedSkill.description.length > 140
                                ? "…"
                                : "")
                            : "Tune behavior and limits before going live."
                        }
                      />
                      {selectedSkills.length > 1 ? (
                        <div className="onboard-segment" role="tablist">
                          {selectedSkills.map((skill) => (
                            <button
                              key={skill.skill_id}
                              type="button"
                              role="tab"
                              className={`onboard-segment-btn${activeSkillId === skill.skill_id ? " is-active" : ""}`}
                              onClick={() => setActiveSkillId(skill.skill_id)}
                              disabled={formLocked}
                            >
                              {skill.name}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <div className="onboard-config-stack form">
                        {skillId === GAMEARENA_SKILL_ID && (
                          <GamearenaConfigFields
                            config={config}
                            onChange={updateConfig}
                            compact
                            variant="onboard"
                          />
                        )}
                        {skillId ===
                          "gaming/card-fighter/actionorder_vshouse" && (
                          <ActionorderFields
                            config={config}
                            onChange={updateConfig}
                          />
                        )}
                        {skillId === UBI_REMINDER_SKILL_ID && (
                          <UbiReminderFields
                            config={config}
                            onChange={updateConfig}
                            botToken={botToken}
                            onTokenChange={setBotToken}
                          />
                        )}
                        {skillId === BALAIO_WORKER_SKILL_ID && (
                          <BalaioConfigFields
                            config={config}
                            onChange={updateConfig}
                          />
                        )}
                        {skillId !== GAMEARENA_SKILL_ID &&
                          skillId !==
                            "gaming/card-fighter/actionorder_vshouse" &&
                          skillId !== UBI_REMINDER_SKILL_ID &&
                          skillId !== BALAIO_WORKER_SKILL_ID && (
                            <p className="muted">
                              Registry defaults apply. Change settings from the
                              dashboard after deploy.
                            </p>
                          )}
                        <BrainChatFields
                          enabled={brainEnabled}
                          onEnabledChange={setBrainEnabled}
                          botToken={brainBotToken}
                          onTokenChange={setBrainBotToken}
                          disabled={formLocked}
                        />
                      </div>
                      <OnboardActions
                        showBack
                        onBack={goWizardBack}
                        backDisabled={formLocked}
                        primaryDisabled={formLocked || !step2Valid}
                        onPrimary={goWizardNext}
                      />
                    </OnboardCard>
                  )}

                  {wizardStep === 3 && (
                    <OnboardReviewStep
                      name={name}
                      skillName={
                        selectedSkills.map((s) => s.name).join(" + ") ||
                        selectedSkill?.name ||
                        skillId
                      }
                      highlights={previewTags}
                      configRows={reviewConfigRows}
                      fundingNote={fundingShort}
                      note={
                        <>
                          Sign once to provision the wallet and runtime. Vouch
                          at <Link to="/issue">/issue</Link> before it plays.
                        </>
                      }
                      error={error}
                      onBack={goWizardBack}
                      onCreate={() => void handleDeploy()}
                      backDisabled={formLocked || busy}
                      createDisabled={formLocked || !step2Valid || busy}
                      busy={busy}
                    />
                  )}
                </div>

                {draftSaved && !deployId ? (
                  <p className="onboard-autosave">Progress saved</p>
                ) : null}
                <OnboardSuccessOverlay show={showSuccess} />
              </div>
            ) : null}

            {deployId && status && (
              <DeployPipeline
                status={status}
                deployId={deployId}
                startBusy={startBusy}
                onStartAfterVouch={() => {
                  if (!address || !deployId) return;
                  void (async () => {
                    setStartBusy(true);
                    setError(null);
                    try {
                      const auth = await signDeployControl(
                        "resume",
                        deployId,
                        address,
                        (args) => signMessageAsync(args),
                      );
                      await startDeploy(deployId, auth);
                      await poll(deployId);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e));
                    } finally {
                      setStartBusy(false);
                    }
                  })();
                }}
                onRetry={() => {
                  if (!address || !deployId) return;
                  void (async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      const auth = await signDeployControl(
                        "run-pipeline",
                        deployId,
                        address,
                        (args) => signMessageAsync(args),
                      );
                      await runDeployPipeline(deployId, auth);
                      await poll(deployId);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e));
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              />
            )}
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
