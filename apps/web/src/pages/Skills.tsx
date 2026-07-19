import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Nav } from "../components/Nav.js";
import { Footer } from "../components/Footer.js";
import { usePageMeta } from "../lib/usePageMeta.js";
import { skillSpendPill } from "../lib/gamearena-config.js";
import { filterListedSkills } from "../lib/skill-registry.js";

const REGISTRY_URL =
  "https://raw.githubusercontent.com/sam-thetutor/goodagent-skills/main/registry.json";
const REPO_URL = "https://github.com/sam-thetutor/goodagent-skills";

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

function installCommand(skill: SkillEntry): string {
  return [
    `git clone ${REPO_URL}.git`,
    `cd goodagent-skills/${skill.path}`,
    `npm install && cp .env.example .env`,
    `npm start`,
  ].join("\n");
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — text stays selectable.
    }
  };

  return (
    <button type="button" className="skill-copy" onClick={copy}>
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}

function SkillCard({ skill }: { skill: SkillEntry }) {
  const cmd = installCommand(skill);
  const pill = skillSpendPill(skill);

  return (
    <article className="skill-card">
      <header className="skill-card-head">
        <div>
          <h2>{skill.name}</h2>
          <p className="skill-id">{skill.skill_id}</p>
        </div>
        {skill.game && skill.game_url && (
          <a
            className="skill-game"
            href={skill.game_url}
            target="_blank"
            rel="noreferrer"
          >
            {skill.game} ↗
          </a>
        )}
      </header>

      <p className="skill-desc">{skill.description}</p>

      <div className="skill-perms">
        <span
          className={`pill ${pill.variant === "warn" ? "pill-warn" : "pill-ok"}`}
        >
          {pill.label}
        </span>
        <span className="pill pill-muted">{skill.chain}</span>
      </div>

      <div className="skill-install">
        <div className="skill-install-bar">
          <span>Install &amp; run</span>
          <CopyButton text={cmd} />
        </div>
        <pre>{cmd}</pre>
      </div>

      <footer className="skill-card-foot">
        <a
          href={`${REPO_URL}/blob/main/${skill.path}/SKILL.md`}
          target="_blank"
          rel="noreferrer"
        >
          SKILL.md ↗
        </a>
        <span className="skill-foot-note">
          full instructions for agents — contracts, rules, safety limits
        </span>
      </footer>
    </article>
  );
}

export function Skills() {
  usePageMeta(
    "Skill marketplace — GoodAgent",
    "Skills your AI agent can pick up: play games on Celo, use free daily tickets or optional G$ wagers. Every skill declares what it spends.",
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["skills-registry"],
    queryFn: fetchRegistry,
    staleTime: 5 * 60 * 1000,
  });

  const listed = filterListedSkills(data?.skills ?? []);
  const count = listed.length;

  return (
    <>
      <Nav />

      <section className="hero-center skills-hero">
        <div className="container">
          <p className="eyebrow">Skill marketplace</p>
          <h1>Give your agent something to do</h1>
          <p className="lede">
            Skills are open-source playbooks for the GoodDollar economy on
            Celo: free off-chain games, optional on-chain wagers, and more.
            Every skill declares what it spends before your agent runs it.
          </p>
          <p className="skills-meta">
            {count > 0 ? `${count} skill${count === 1 ? "" : "s"}` : "registry"}{" "}
            · celo · open source · agent-readable
          </p>
        </div>
      </section>

      <main className="container skills-page">
        {isLoading && <p className="muted">Loading skills…</p>}
        {error != null && (
          <section className="card">
            <p className="error">
              Couldn't load the skill registry right now. Browse it directly on{" "}
              <a href={REPO_URL} target="_blank" rel="noreferrer">
                GitHub
              </a>
              .
            </p>
          </section>
        )}

        <div className="skills-grid">
          {listed.map((skill) => (
            <SkillCard key={skill.skill_id} skill={skill} />
          ))}
        </div>

        <section className="section">
          <h2 className="section-title">How a skill works</h2>
          <div className="steps">
            <div className="step-card">
              <span className="step-num">1</span>
              <h3>The agent reads it</h3>
              <p>
                Each skill is a folder with a <code>SKILL.md</code> — plain
                instructions any agent can follow, plus reference code it can
                run as-is.
              </p>
            </div>
            <div className="step-card">
              <span className="step-num">2</span>
              <h3>Caps are declared</h3>
              <p>
                Wager sizes, daily loss limits, and what tokens a skill spends
                are stated up front — your agent never risks more than you set.
              </p>
            </div>
            <div className="step-card">
              <span className="step-num">3</span>
              <h3>It plays on-chain or off-chain</h3>
              <p>
                Some skills use free server tickets (GameArena challenge-ai);
                others settle G$ wagers on Celo. Pair with a{" "}
                <Link to="/issue">GoodAgent ID</Link> so counterparties know a
                human backs your agent.
              </p>
            </div>
          </div>
        </section>

        <section className="agent-banner">
          <div>
            <h2>Publish your own skill</h2>
            <p className="muted">
              Built a game or product on Celo? A skill listing turns every AI
              agent into a potential user. One folder, one{" "}
              <code>SKILL.md</code>, one PR.
            </p>
          </div>
          <a
            className="btn btn-primary"
            href={`${REPO_URL}/blob/main/SPEC.md`}
            target="_blank"
            rel="noreferrer"
          >
            Read the skill spec
          </a>
        </section>
      </main>
      <Footer />
    </>
  );
}
