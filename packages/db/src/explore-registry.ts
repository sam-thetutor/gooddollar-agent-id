import type { AgentCredential } from "@prisma/client";
import { prisma } from "./client.js";

export interface ExploreRegistryStats {
  /** Unique agents from host deploys plus credential-only registrations. */
  totalAgents: number;
  /** Host deploys with a provisioned play wallet. */
  provisioned: number;
}

export interface ExploreRegistryRow {
  agent: string;
  operator: string;
  createdAt: Date;
  deployStatus: string | null;
  credential: AgentCredential | null;
}

function matchesQuery(
  row: ExploreRegistryRow,
  query: string,
): boolean {
  const q = query.toLowerCase();
  return (
    row.agent.toLowerCase().includes(q) ||
    row.operator.toLowerCase().includes(q)
  );
}

async function loadExploreRegistryRows(): Promise<ExploreRegistryRow[]> {
  const [deployed, credentials] = await Promise.all([
    prisma.deployedAgent.findMany({
      where: { agentAddress: { not: null } },
      select: {
        agentAddress: true,
        ownerWallet: true,
        operatorWallet: true,
        status: true,
        deployedAt: true,
        createdAt: true,
      },
    }),
    prisma.agentCredential.findMany(),
  ]);

  const byAgent = new Map<string, ExploreRegistryRow>();

  for (const deploy of deployed) {
    if (!deploy.agentAddress) continue;
    const agent = deploy.agentAddress;
    byAgent.set(agent.toLowerCase(), {
      agent,
      operator: deploy.ownerWallet ?? deploy.operatorWallet ?? "",
      createdAt: deploy.deployedAt ?? deploy.createdAt,
      deployStatus: deploy.status,
      credential: null,
    });
  }

  for (const credential of credentials) {
    const key = credential.agent.toLowerCase();
    const existing = byAgent.get(key);
    if (existing) {
      existing.credential = credential;
      if (credential.operator) existing.operator = credential.operator;
    } else {
      byAgent.set(key, {
        agent: credential.agent,
        operator: credential.operator,
        createdAt: credential.createdAt,
        deployStatus: null,
        credential,
      });
    }
  }

  return [...byAgent.values()].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

export async function getExploreRegistryStats(): Promise<ExploreRegistryStats> {
  const [provisioned, rows] = await Promise.all([
    prisma.deployedAgent.count({ where: { agentAddress: { not: null } } }),
    loadExploreRegistryRows(),
  ]);
  return { totalAgents: rows.length, provisioned };
}

export async function listExploreRegistryPaged(opts: {
  query?: string;
  page: number;
  pageSize: number;
}): Promise<{ rows: ExploreRegistryRow[]; total: number }> {
  let rows = await loadExploreRegistryRows();
  const query = opts.query?.trim();
  if (query) rows = rows.filter((row) => matchesQuery(row, query));
  const total = rows.length;
  const start = (opts.page - 1) * opts.pageSize;
  return { rows: rows.slice(start, start + opts.pageSize), total };
}
