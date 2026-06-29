# Roadmap & milestones

12-week build plan aligned with **GoodBuilders Season 4** (3-month streaming round).

## Season targets (Flow State KPIs)

| KPI | Target | How measured |
|-----|--------|--------------|
| Telegram users | 300+ | Unique `/start` sessions |
| Verify + claim via bot | 150+ | Onchain claim txs with linked telegram session |
| G$ onchain volume | 500,000+ G$ | Claims + transfers + stream volume |
| MCP adoption | 2+ integrations | External repos or npm download + doc proof |
| Weekly milestone updates | 12/12 | Flow State dashboard |

**Funding weights:** 50% mentor votes · 25% community votes · 25% product activity metrics

Plan **community voting** from week 1 — not only product growth.

---

## Phase 1 — Foundation (Weeks 1–2)

### Deliverables

- [ ] Monorepo scaffold (`packages/shared`, `packages/chain`)
- [ ] MCP server with read-only tools:
  - `verify_status`
  - `claim_eligibility`
  - `get_balance`
  - `get_daily_stats`
- [ ] PostgreSQL schema + API skeleton
- [ ] Telegram bot: `/start`, `/help`, `/status`, `/connect`
- [ ] Docs published in `docs/` ✅

### Demo

Bot responds to `/status` with onchain data for a test wallet.

---

## Phase 2 — Identity & connect (Weeks 3–4)

### Deliverables

- [ ] Mini App `/connect` with WalletConnect
- [ ] API `POST /sessions/link` + Telegram initData validation
- [ ] MCP `generate_verify_link`
- [ ] FV callback route + `/verify` command
- [ ] Browser fallback `/connect` page

### Milestone

10 beta users connect wallet + 5 complete face verification.

---

## Phase 3 — Claim & sign (Weeks 5–6)

### Deliverables

- [ ] Mini App `/sign/{actionId}`
- [ ] MCP `prepare_claim`, `get_action_status`
- [ ] `/claim` command + NL "claim my G$"
- [ ] `WebApp.sendData` → bot confirmation + CeloScan link
- [ ] Pending action expiry job

### Milestone

50 claims completed via bot · First Flow State demo day.

---

## Phase 4 — Transfers (Weeks 7–8)

### Deliverables

- [ ] MCP `prepare_transfer`
- [ ] NL intent: "send X G$ to ..."
- [ ] Transfer limits + validation
- [ ] CELO balance warning in Mini App
- [ ] Audit logging

### Milestone

100 users · 100K G$ cumulative volume.

---

## Phase 5 — Streams (Weeks 9–10)

### Deliverables

- [ ] Superfluid helpers in `packages/chain`
- [ ] MCP `prepare_stream`
- [ ] Savings preset: "stream 20% of monthly claim"
- [ ] Stream status read tool (optional)

### Milestone

25 active streams · 300K G$ cumulative volume.

---

## Phase 6 — MCP launch & polish (Weeks 11–12)

### Deliverables

- [ ] Publish `gooddollar-mcp` to npm
- [ ] Claude Desktop config + README tutorial
- [ ] LangChain tool bindings documented
- [ ] Metrics dashboard (internal)
- [ ] GoodBuilders finale demo
- [ ] Gas faucet research / v2 spec (optional)

### Milestone

500K+ G$ volume · 2 MCP adoptions · 300 Telegram users.

---

## Gantt overview

```
Week:  1  2  3  4  5  6  7  8  9  10 11 12
       ├──┤
       Foundation + MCP read
          ├──┤
          Connect + Verify
             ├──┤
             Claim + Sign
                ├──┤
                Transfers
                   ├──┤
                   Streams
                      ├──┤
                      npm + demo
```

---

## Phase 2 backlog (post-season)

| Feature | Description |
|---------|-------------|
| Community bill pool | Group G$ → batch bill pay |
| Esusu adapter | MCP tool for airtime/data |
| Balaio adapter | Task matching tool |
| Gas faucet | Sponsor first claim CELO |
| Flow State vote widget | In Mini App after actions |
| WhatsApp bot | Same MCP core |

---

## Weekly ops (GoodBuilders rhythm)

| Cadence | Activity |
|---------|----------|
| Weekly | 1:1 mentor check-in |
| Bi-weekly | Demo day presentation |
| Weekly | Update Flow State milestones |
| Ongoing | Community voting outreach |

---

## Risk register

| Risk | Mitigation |
|------|------------|
| Gas friction blocks claims | CELO warning + v2 faucet |
| Telegram Web WC issues | Browser fallback |
| LLM cost | Cache reads; commands for common actions |
| Superfluid complexity | Ship transfers before streams |
| Low voter count | Partner with other S4 teams for mutual votes |

---

## Definition of done (v1)

- [ ] End-to-end: connect → verify → claim → transfer in Telegram
- [ ] MCP server documented and publishable
- [ ] No custodial keys; security checklist complete
- [ ] Season KPI targets met or documented with trajectory
