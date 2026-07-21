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
  skillSpendPill,
} from "../lib/gamearena-config.js";
import {
  balaioFundingHint,
  isBalaioRoleEnabled,
} from "../lib/balaio-config.js";
import {
  DEFAULT_DEPLOY_SKILL_ID,
  filterListedSkills,
  resolveDefaultDeploySkillId,
} from "../lib/skill-registry.js";
import { usePageMeta } from "../lib/usePageMeta.js";

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

function GamearenaDeployHint() {
  return (
    <p className="muted hint deploy-section-hint">
      We fund your agent with 200 G$ + CELO for gas. Pick free tickets,
      on-chain wagers, or auto (tickets first, then G$ when MARKOV is live).
      Choose how your agent throws vs MARKOV — random, a fixed move, or a
      repeating sequence. You{" "}
      <strong>vouch at /issue</strong> (250 G$ refundable bond) before it goes
      live.
    </p>
  );
}

function SkillPickCard({
  skill,
  selected,
  onSelect,
}: {
  skill: SkillEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const pill = skillSpendPill(skill);

  return (
    <button
      type="button"
      className={`deploy-skill-pick${selected ? " selected" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <div className="deploy-skill-pick-head">
        <div>
          <strong>{skill.name}</strong>
          <p className="skill-id">{skill.skill_id}</p>
        </div>
        {skill.game && (
          <span className="pill pill-muted">{skill.game}</span>
        )}
      </div>
      <p className="deploy-skill-pick-desc">{skill.description}</p>
      <div className="skill-perms">
        <span
          className={`pill ${pill.variant === "warn" ? "pill-warn" : "pill-ok"}`}
        >
          {pill.label}
        </span>
        <span className="pill pill-muted">Celo</span>
      </div>
    </button>
  );
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
  const [skillId, setSkillId] = useState(DEFAULT_DEPLOY_SKILL_ID);
  const [botToken, setBotToken] = useState("");
  const [config, setConfig] = useState<SkillConfiguration>(() =>
    defaultConfigForSkill(DEFAULT_DEPLOY_SKILL_ID),
  );
  const [busy, setBusy] = useState(false);
  const [startBusy, setStartBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deployId, setDeployId] = useState<string | null>(
    () => searchParams.get("job"),
  );
  const [status, setStatus] = useState<DeployStatusResponse | null>(null);

  const selectedSkill = deployableSkills.find((s) => s.skill_id === skillId);

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
    if (
      deployableSkills.length > 0 &&
      !deployableSkills.some((s) => s.skill_id === skillId)
    ) {
      setSkillId(defaultSkillId);
    }
  }, [skillId, deployableSkills, defaultSkillId]);

  useEffect(() => {
    setConfig(defaultConfigForSkill(skillId));
    if (skillId === "gaming/wagering/gamearena_1v1") {
      setName("My GameArena Agent");
    } else if (skillId === "gaming/card-fighter/actionorder_vshouse") {
      setName("My ACTION-ORDER Agent");
    } else if (skillId === UBI_REMINDER_SKILL_ID) {
      setName("My UBI Reminder Agent");
    } else if (skillId === BALAIO_WORKER_SKILL_ID) {
      setName("My Balaio Worker");
    }
  }, [skillId]);

  function updateConfig(key: string, value: string) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  async function handleDeploy() {
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const { agent } = await createDeploy({
        displayName: name.trim(),
        ownerWallet: address,
        skillId,
        configuration: config,
        telegramBotToken:
          skillId === UBI_REMINDER_SKILL_ID ? botToken.trim() : undefined,
        template:
          skillId === UBI_REMINDER_SKILL_ID
            ? "social"
            : skillId === BALAIO_WORKER_SKILL_ID
              ? "work"
              : "gaming",
        skipPayment: true,
      });
      setDeployId(agent.id);
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
  const gamearenaSkill = skillId === GAMEARENA_SKILL_ID;
  const balaioSkill = skillId === BALAIO_WORKER_SKILL_ID;
  const balaioCreator = balaioSkill && isBalaioRoleEnabled(config, "creator");
  const balaioFunding = balaioCreator ? balaioFundingHint(config) : null;

  return (
    <>
      <Nav />
      <main className="page deploy-page">
        <header className="hero compact">
          <p className="eyebrow">Autonomous deploy</p>
          <h1>Deploy an agent</h1>
          <p className="lede">
            {skillId === UBI_REMINDER_SKILL_ID
              ? "We provision an agent identity, install your reminder bot, and keep it running 24/7 after you vouch at /issue."
              : balaioSkill
                ? balaioCreator
                  ? "We provision a wallet, fund it with G$ for task escrow + gas, install the Balaio skill, and keep your agent running 24/7 after you vouch at /issue."
                  : "We provision a wallet with CELO for gas (and G$ when earning), install the Balaio worker skill, and keep your agent scanning for tasks 24/7 after you vouch at /issue."
              : gamearenaSkill
                ? "We provision a wallet, fund it with G$ for ticket refills, install your skill, and keep the agent running 24/7 after you vouch at /issue."
                : "We provision a wallet, fund it with 200 G$ + gas, install your skill, and keep the agent running 24/7 after you vouch at /issue."}
          </p>
        </header>

        {!isConnected ? (
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
        ) : registryLoading ? (
          <section className="card">
            <p className="muted">Loading skill registry…</p>
          </section>
        ) : (
          <>
            {!deployId && (
              <>
                <section className="card form">
                  <h2 className="card-title">1 · Name your agent</h2>
                  <label className="field">
                    <span>Display name</span>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Arena Agent #1"
                      disabled={formLocked}
                    />
                  </label>
                </section>

                <section className="card">
                  <h2 className="card-title">2 · Pick a skill</h2>
                  <p className="muted hint deploy-section-hint">
                    Skills are open-source playbooks from the{" "}
                    <Link to="/skills">GoodAgent registry</Link>. Caps are
                    enforced in your config below.
                  </p>
                  <div className="deploy-skill-grid">
                    {deployableSkills.map((skill) => (
                      <SkillPickCard
                        key={skill.skill_id}
                        skill={skill}
                        selected={skill.skill_id === skillId}
                        onSelect={() => setSkillId(skill.skill_id)}
                      />
                    ))}
                  </div>
                  {selectedSkill?.game_url && (
                    <p className="deploy-game-link">
                      <a
                        href={selectedSkill.game_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Play {selectedSkill.game} ↗
                      </a>
                    </p>
                  )}
                </section>

                <section className="card form">
                  <h2 className="card-title">
                    {skillId === UBI_REMINDER_SKILL_ID
                      ? "3 · Bot settings"
                      : balaioSkill
                        ? "3 · Balaio settings"
                        : "3 · Play settings"}
                  </h2>
                  {skillId === GAMEARENA_SKILL_ID ? (
                    <GamearenaDeployHint />
                  ) : skillId === UBI_REMINDER_SKILL_ID ? (
                    <p className="muted hint deploy-section-hint">
                      Read-only agent — it watches the chain and messages
                      Telegram, never touches funds. You vouch at /issue
                      (refundable 250 G$ bond) so your bot carries a verifiable
                      human-backed identity.
                    </p>
                  ) : balaioSkill ? (
                    <p className="muted hint deploy-section-hint">
                      {balaioCreator ? (
                        <>
                          Creator mode escrows G$ from the agent wallet when it
                          posts a task on Balaio (reward × slots + 1% fee).
                          {balaioFunding ? ` ${balaioFunding}.` : ""} You vouch
                          at /issue (250 G$ refundable bond) so workers can
                          verify who posted the task.
                        </>
                      ) : (
                        <>
                          Worker mode signs on-chain Balaio transactions with
                          CELO gas. Rewards are paid in G$ after the buyer
                          approves. You vouch at /issue (250 G$ refundable bond)
                          so buyers can verify who completed the work.
                        </>
                      )}
                    </p>
                  ) : selectedSkill?.spends_tokens ? (
                    <p className="muted hint deploy-section-hint">
                      We fund your agent play wallet with 200 G$ + 1 CELO for
                      gas. You vouch at /issue and lock a refundable 250 G$
                      bond in AgentVault before it can wager. Set conservative
                      limits below.
                    </p>
                  ) : (
                    <p className="muted hint deploy-section-hint">
                      Free vs-house mode. No G$ wager — only gas for Celo
                      transactions.
                    </p>
                  )}

                  {skillId === "gaming/wagering/gamearena_1v1" && (
                    <GamearenaConfigFields config={config} onChange={updateConfig} />
                  )}
                  {skillId === "gaming/card-fighter/actionorder_vshouse" && (
                    <ActionorderFields config={config} onChange={updateConfig} />
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
                    <BalaioConfigFields config={config} onChange={updateConfig} />
                  )}

                  {error && <p className="error">{error}</p>}

                  <div className="actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={
                        formLocked ||
                        !name.trim() ||
                        (skillId === UBI_REMINDER_SKILL_ID && !botToken.trim())
                      }
                      onClick={() => void handleDeploy()}
                    >
                      {busy ? "Deploying…" : "Deploy agent"}
                    </button>
                  </div>
                </section>
              </>
            )}

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
