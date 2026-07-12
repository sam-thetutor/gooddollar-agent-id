import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useSignMessage } from "wagmi";
import { ConnectButton, Nav } from "../components/Nav.js";
import { Footer } from "../components/Footer.js";
import {
  createDeploy,
  getDeployStatus,
  runDeployPipeline,
  type DeployStatusResponse,
  type SkillConfiguration,
} from "../lib/host.js";
import { signDeployControl } from "../lib/deploy-control.js";
import { usePageMeta } from "../lib/usePageMeta.js";

const REGISTRY_URL =
  "https://raw.githubusercontent.com/sam-thetutor/goodagent-skills/main/registry.json";

const DEFAULT_SKILL_ID = "gaming/wagering/gamearena_1v1";

interface SkillEntry {
  name: string;
  skill_id: string;
  path: string;
  description: string;
  chain: string;
  spends_tokens: boolean;
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
  { id: "wallet", label: "Fund & verify" },
  { id: "install", label: "Install skill" },
  { id: "start", label: "Go live" },
] as const;

function stepIndex(status: string, pipelineRunning: boolean): number {
  if (status === "pending_payment") return 0;
  if (status === "provisioning" || pipelineRunning) return 1;
  if (status === "installing") return 2;
  if (status === "starting") return 3;
  if (status === "running") return 4;
  if (status === "failed") return -1;
  return 0;
}

function defaultConfigForSkill(skillId: string): SkillConfiguration {
  if (skillId === "gaming/wagering/gamearena_1v1") {
    return {
      WAGER_GS: "1",
      GAME_TYPE: "0",
      DAILY_LOSS_CAP_GS: "20",
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
  return {};
}

function GamearenaFields({
  config,
  onChange,
}: {
  config: SkillConfiguration;
  onChange: (key: string, value: string) => void;
}) {
  const gameType = config.GAME_TYPE ?? "0";

  return (
    <div className="deploy-config-grid">
      <label className="field">
        <span>Wager per match</span>
        <div className="input-suffix">
          <input
            value={config.WAGER_GS ?? "1"}
            onChange={(e) => onChange("WAGER_GS", e.target.value)}
            inputMode="decimal"
          />
          <span className="input-suffix-label">G$</span>
        </div>
      </label>

      <label className="field">
        <span>Daily loss cap</span>
        <div className="input-suffix">
          <input
            value={config.DAILY_LOSS_CAP_GS ?? "20"}
            onChange={(e) => onChange("DAILY_LOSS_CAP_GS", e.target.value)}
            inputMode="decimal"
          />
          <span className="input-suffix-label">G$</span>
        </div>
      </label>

      <label className="field deploy-config-full">
        <span>Game mode</span>
        <div className="chips">
          <button
            type="button"
            className={`chip ${gameType === "0" ? "chip-on" : ""}`}
            onClick={() => onChange("GAME_TYPE", "0")}
          >
            Rock · Paper · Scissors
          </button>
          <button
            type="button"
            className={`chip ${gameType === "1" ? "chip-on" : ""}`}
            onClick={() => onChange("GAME_TYPE", "1")}
          >
            Coin flip
          </button>
        </div>
      </label>

      <label className="field">
        <span>Max matches per day</span>
        <input
          value={config.MAX_MATCHES ?? "10"}
          onChange={(e) => onChange("MAX_MATCHES", e.target.value)}
          inputMode="numeric"
        />
      </label>

      <label className="field">
        <span>Pause between matches</span>
        <div className="input-suffix">
          <input
            value={config.MATCH_INTERVAL_SECONDS ?? "300"}
            onChange={(e) => onChange("MATCH_INTERVAL_SECONDS", e.target.value)}
            inputMode="numeric"
          />
          <span className="input-suffix-label">sec</span>
        </div>
      </label>
    </div>
  );
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

function SkillPickCard({
  skill,
  selected,
  onSelect,
}: {
  skill: SkillEntry;
  selected: boolean;
  onSelect: () => void;
}) {
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
        {skill.spends_tokens ? (
          <span className="pill pill-warn">
            Spends {skill.token ?? "G$"}
          </span>
        ) : (
          <span className="pill pill-ok">No wager</span>
        )}
        <span className="pill pill-muted">Celo</span>
      </div>
    </button>
  );
}

function DeployPipeline({
  status,
  deployId,
  onRetry,
}: {
  status: DeployStatusResponse;
  deployId: string;
  onRetry: () => void;
}) {
  const current = stepIndex(status.status, status.pipelineRunning);
  const failed = status.status === "failed";
  const done = status.status === "running";

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

      <div className="actions">
        {done && (
          <Link className="btn btn-primary" to={`/dashboard/${deployId}`}>
            Open dashboard
          </Link>
        )}
        {failed && (
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            Retry deploy
          </button>
        )}
        {status.pipelineRunning && (
          <span className="muted hint">Running pipeline…</span>
        )}
        {!done && (
          <span className="muted hint">
            Funding play wallet, attesting key, and locking 250 G$ vault bond
          </span>
        )}
      </div>
    </section>
  );
}

export function Deploy() {
  usePageMeta(
    "Deploy Agent — GoodAgent",
    "Deploy a 24/7 gaming agent with GameArena or ACTION-ORDER skills.",
  );

  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { data: registry, isLoading: registryLoading } = useQuery({
    queryKey: ["skills-registry"],
    queryFn: fetchRegistry,
    staleTime: 60_000,
  });

  const deployableSkills = useMemo(
    () => registry?.skills ?? [],
    [registry],
  );

  const [name, setName] = useState("My GameArena Agent");
  const [skillId, setSkillId] = useState(DEFAULT_SKILL_ID);
  const [config, setConfig] = useState<SkillConfiguration>(() =>
    defaultConfigForSkill(DEFAULT_SKILL_ID),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deployId, setDeployId] = useState<string | null>(null);
  const [status, setStatus] = useState<DeployStatusResponse | null>(null);

  const selectedSkill = deployableSkills.find((s) => s.skill_id === skillId);

  useEffect(() => {
    setConfig(defaultConfigForSkill(skillId));
    if (skillId === "gaming/wagering/gamearena_1v1") {
      setName("My GameArena Agent");
    } else if (skillId === "gaming/card-fighter/actionorder_vshouse") {
      setName("My ACTION-ORDER Agent");
    }
  }, [skillId]);

  const poll = useCallback(async (id: string) => {
    const s = await getDeployStatus(id);
    setStatus(s);
    return s;
  }, []);

  useEffect(() => {
    if (!deployId) return;
    const t = setInterval(() => {
      void poll(deployId);
    }, 4000);
    return () => clearInterval(t);
  }, [deployId, poll]);

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

  return (
    <>
      <Nav />
      <main className="page deploy-page">
        <header className="hero compact">
          <p className="eyebrow">Autonomous deploy</p>
          <h1>Deploy a gaming agent</h1>
          <p className="lede">
            We provision a wallet, fund it with 200 G$ + gas, lock your 250 G$
            refundable vault bond, and keep your agent running 24/7.
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
                      placeholder="e.g. Arena Bot #1"
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
                  <h2 className="card-title">3 · Play settings</h2>
                  {selectedSkill?.spends_tokens ? (
                    <p className="muted hint deploy-section-hint">
                      We fund your agent play wallet with 200 G$ + 1 CELO for
                      gas. You lock a refundable 250 G$ bond in AgentVault
                      before it can wager. Set conservative limits below.
                    </p>
                  ) : (
                    <p className="muted hint deploy-section-hint">
                      Free vs-house mode. No G$ wager — only gas for Celo
                      transactions.
                    </p>
                  )}

                  {skillId === "gaming/wagering/gamearena_1v1" && (
                    <GamearenaFields config={config} onChange={updateConfig} />
                  )}
                  {skillId === "gaming/card-fighter/actionorder_vshouse" && (
                    <ActionorderFields config={config} onChange={updateConfig} />
                  )}

                  {error && <p className="error">{error}</p>}

                  <div className="actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={formLocked || !name.trim()}
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
