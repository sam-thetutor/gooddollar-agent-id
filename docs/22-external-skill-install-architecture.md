# 22 — External Skill Install Architecture

How an **external agent** — any AI agent running anywhere, with no GoodAgent
account, verification, or hosted deploy — discovers, installs, and runs a
skill from the GoodAgent marketplace, from first contact to a running
process.

Shipped in `apps/api/src/routes/skills.ts`, `packages/mcp-server`
(`skills-handlers.ts`, npm `@goodagent/mcp-server`), and
`packages/runtime/src/skill-local-install.ts`. Live at
`goodagentids.xyz/api/v1/skills`.

Design principle: **install is local and permissionless.** The platform hands
out instructions and code; the agent runs the skill on its own machine with
its own keys. Verification (GoodAgent ID) is optional and only matters to
counterparties.

---

## 1. The pieces

```mermaid
flowchart LR
    subgraph agent["External agent (anywhere)"]
        A["AI agent / LLM runtime"]
        MCPC["MCP client<br/>(Cursor, Claude, custom)"]
        FS["Local disk<br/>./skills/&lt;name&gt;"]
    end

    subgraph platform["GoodAgent platform (VPS)"]
        API["Skills REST API<br/>/api/v1/skills<br/>(Hono, cached, rate-limited)"]
        WK["Discovery index<br/>/api/.well-known/goodagent-skills.json"]
        LLMS["llms.txt §5 — Skills<br/>(agent-readable guide)"]
    end

    subgraph npmw["npm"]
        MCP["@goodagent/mcp-server<br/>goodagent_* skill tools"]
    end

    subgraph gh["GitHub"]
        REPO["sam-thetutor/goodagent-skills<br/>registry.json + skills/&lt;folder&gt;<br/>(SKILL.md, src, .env.example)"]
    end

    A --> MCPC
    MCPC -->|"npx -y @goodagent/mcp-server"| MCP
    A -->|plain HTTP| API
    A -->|reads| LLMS
    A -->|probes| WK
    API -->|"fetch registry + SKILL.md<br/>(5–15 min cache)"| REPO
    MCP -->|"shallow clone → cache"| REPO
    MCP -->|"copy + npm install"| FS
```

Source of truth is the **public GitHub repo**: `registry.json` lists every
skill (OASF-style `skill_id`, path, chain, spend permissions); each skill
folder carries `SKILL.md` (frontmatter + instructions), source code, and
`.env.example`. The REST API and MCP tools are both thin, cached views over
that repo — there is no separate database to fall out of sync.

---

## 2. Two doors, one flow

| | REST API | MCP tools |
| --- | --- | --- |
| For | any HTTP-capable agent | agents in MCP hosts (Cursor, Claude, …) |
| Discover | `GET /api/v1/skills?q=&chain=` | `goodagent_list_skills`, `goodagent_search_skills` |
| Inspect | `GET /api/v1/skills/:id` (manifest), `/:id/skill.md`, `/:id/env.example` | `goodagent_describe_skill`, `goodagent_fetch_skill_md` |
| Install | manual: git clone + npm install (commands in manifest) | `goodagent_install_skill` — clone, copy, npm install in one call |
| Auth | none (per-IP rate limit) | none |

The install manifest returned for a skill:

```json
{
  "skill_id": "gaming/wagering/gamearena_1v1",
  "name": "gamearena-player",
  "chain": "celo:42220",
  "spends_tokens": false,
  "verification_required": false,
  "install": {
    "type": "npm-worker",
    "repo": "https://github.com/sam-thetutor/goodagent-skills.git",
    "path": "skills/gamearena-player",
    "entry": "npm start",
    "required_env": ["PLAYER_ADDRESS"],
    "permissions": { "spends_tokens": false, "token": "G$" }
  },
  "urls": { "skill_md": "…/skill.md", "env_example": "…/env.example" }
}
```

`required_env` and `version` are parsed live from the SKILL.md frontmatter,
so the repo stays the single place skills are authored.

---

## 3. End-to-end flow — external agent installs a skill

```mermaid
sequenceDiagram
    actor X as External agent
    participant L as llms.txt / .well-known
    participant API as Skills REST API
    participant M as MCP server<br/>(local, via npx)
    participant GH as goodagent-skills repo
    participant D as Local disk

    Note over X,L: DISCOVER
    X->>L: read llms.txt §5 (or probe .well-known)
    L-->>X: registry + API URLs, MCP package name
    X->>API: GET /v1/skills?q=game
    API-->>X: matching skills (id, name, description, spends_tokens)

    Note over X,GH: INSPECT
    X->>API: GET /v1/skills/gaming/wagering/gamearena_1v1
    API->>GH: fetch SKILL.md (cached 15 min)
    API-->>X: install manifest (repo, path, entry, required_env, permissions)
    X->>API: GET /v1/skills/.../skill.md
    API-->>X: full rules: contracts, caps, safety limits
    Note over X: agent reads permissions —<br/>does this skill spend tokens? what caps?

    Note over X,D: INSTALL (choose one door)
    alt via MCP
        X->>M: goodagent_install_skill { skill_id }
        M->>GH: shallow clone → ~/.goodagent cache<br/>(reset --hard origin/main on reuse)
        M->>D: copy skills/gamearena-player → ./skills/…
        M->>D: npm ci (fallback npm install)
        M-->>X: { ok, targetDir, envExamplePath, next_steps }
    else manual (REST only)
        X->>GH: git clone --depth 1 …/goodagent-skills.git
        X->>D: cd skills/gamearena-player && npm install
    end

    Note over X,D: CONFIGURE + RUN
    X->>D: cp .env.example .env, fill required_env<br/>(own agent address / key — never a human's)
    X->>D: npm start
    Note over D: skill loops autonomously<br/>within its declared caps
```

Five stages, in the agent's own words:

1. **Discover** — read `llms.txt` §5 or `GET /api/.well-known/goodagent-skills.json`;
   list or search skills.
2. **Inspect** — fetch the manifest and `SKILL.md`; check `spends_tokens`,
   caps, and `required_env` *before* running anything.
3. **Install** — one MCP call, or clone + `npm install` by hand. Both end with
   the same folder on the agent's disk.
4. **Configure** — copy `.env.example` → `.env`, fill in the agent's own
   address/key.
5. **Run** — `npm start`. The skill is a self-contained worker loop with the
   loss caps and match caps declared in its SKILL.md.

---

## 4. What happens inside `goodagent_install_skill`

```mermaid
flowchart TD
    START(["goodagent_install_skill { skill_id, target_dir?, skip_npm? }"])
    START --> R["fetch registry.json<br/>find skill by skill_id"]
    R -->|not found| E1["error NOT_FOUND"]
    R --> C{"cache exists?<br/>.goodagent/skill-registry/"}
    C -->|no| CL["git clone --depth 1<br/>goodagent-skills.git → cache"]
    C -->|yes| UP["git fetch +<br/>reset --hard origin/main"]
    CL --> SRC
    UP --> SRC["resolve skills/&lt;folder&gt;<br/>(must contain package.json)"]
    SRC -->|missing| E2["error: skill folder<br/>not published in repo"]
    SRC --> CP["wipe + copy folder<br/>→ target_dir (default ./skills/&lt;name&gt;)"]
    CP --> NPM{"skip_npm?"}
    NPM -->|no| I["npm ci → fallback npm install"]
    NPM -->|yes| OUT
    I --> OUT(["return { targetDir, envExamplePath,<br/>next_steps: cd · cp .env · npm start }"])
```

Operational notes:

- The clone cache lives at `./.goodagent/skill-registry/goodagent-skills`
  (override: `GOODAGENT_SKILLS_CACHE`); repeat installs are fast and always
  reset to `origin/main`.
- `LOCAL_SKILLS_REPO` env var short-circuits to a local checkout (used by the
  platform's own deploy pipeline, which shares this exact install code).
- Registry responses are cached 5 minutes, SKILL.md/env.example 15 minutes,
  and the whole `/v1/skills/*` scope is per-IP rate-limited.

---

## 5. Trust model

```mermaid
flowchart LR
    subgraph open["Open to everyone"]
        BROWSE["browse / read / install<br/>no auth, no account, no payment"]
    end
    subgraph declared["Declared, not hidden"]
        PERM["spends_tokens + caps in registry<br/>full rules in SKILL.md<br/>agent reviews BEFORE running"]
    end
    subgraph earned["Earned separately"]
        VER["GoodAgent ID (sections 1–3 of llms.txt)<br/>human vouch + 250 G$ bond<br/>counterparties may prefer or require it"]
    end
    BROWSE --> PERM --> VER
```

- **Installing is permissionless** — `verification_required: false`
  everywhere. The platform never holds the external agent's keys or funds.
- **Spending is opt-in and capped** — a skill that wagers G$ says so in its
  registry entry and enforces daily loss/match caps in code the agent can
  read.
- **Identity is a separate, optional layer** — the same agent can later get
  human-vouched (GoodAgent ID) to be trusted by counterparties, or its human
  can switch to a hosted deploy (goodagentids.xyz/deploy) with the AI-chat
  brain (doc 21).

## 6. Current status

| Piece | Status |
| --- | --- |
| REST list/search/manifest/skill.md/env.example | live in production |
| `.well-known/goodagent-skills.json` | live under `/api/` (root path still serves the SPA) |
| MCP skill tools on npm (`@goodagent/mcp-server` 0.5.0) | published, verified end-to-end |
| llms.txt §5 Skills section | added (this change) |
| `proof-of-alpha-hunt` folder in the public repo | **missing — registry lists it, install fails** (deliberately parked) |
| `npx @goodagent/cli skills install` one-liner | not started |
| For-Agents web page section on skills | not started |
