import { and, count, eq, lt } from 'drizzle-orm';
import { ZKPassport } from '@zkpassport/sdk';
import { zkpassportRequests } from '@/db/schema';
import { db } from '@/lib/db';

type RequestStatus = 'created' | 'request_received' | 'generating_proof' | 'completed' | 'rejected' | 'error';

type ProofPayload = {
  proof: string;
  vkey_hash: string;
  version: string;
  name?: string;
};

export type ZkpassportRequestState = {
  requestId: string;
  electionId: string;
  url: string;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
  error?: string;
  verified?: boolean;
  uniqueIdentifier?: string;
  proof?: ProofPayload;
};

export type ZkpassportRequestStats = {
  total: number;
  byStatus: Record<string, number>;
};

type GlobalStore = {
  zkp?: ZKPassport;
  lastCleanupAt?: number;
};

const globalKey = '__zkpassport_request_store__';
const g = globalThis as typeof globalThis & { [globalKey]?: GlobalStore };

const DEFAULT_TTL_HOURS = 24;
const CLEANUP_MIN_INTERVAL_MS = 10 * 60 * 1000;

function nowIso(): string {
  return new Date().toISOString();
}

function getStore(): GlobalStore {
  if (!g[globalKey]) {
    g[globalKey] = {};
  }
  return g[globalKey]!;
}

function getClient(): ZKPassport {
  const domain = process.env.NEXT_PUBLIC_ZKPASSPORT_DOMAIN;
  if (!domain) {
    throw new Error('NEXT_PUBLIC_ZKPASSPORT_DOMAIN is not configured');
  }

  const store = getStore();
  if (!store.zkp) {
    store.zkp = new ZKPassport(domain);
  }
  return store.zkp;
}

function toState(row: typeof zkpassportRequests.$inferSelect): ZkpassportRequestState {
  const proof = row.proof && row.vkeyHash && row.version
    ? {
        proof: row.proof,
        vkey_hash: row.vkeyHash,
        version: row.version,
        ...(row.proofName ? { name: row.proofName } : {}),
      }
    : undefined;

  return {
    requestId: row.requestId,
    electionId: row.electionId,
    url: row.url,
    status: row.status as RequestStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.error ? { error: row.error } : {}),
    ...(typeof row.verified === 'boolean' ? { verified: row.verified } : {}),
    ...(row.uniqueIdentifier ? { uniqueIdentifier: row.uniqueIdentifier } : {}),
    ...(proof ? { proof } : {}),
  };
}

function getTtlHours(): number {
  const raw = Number(process.env.ZKPASSPORT_REQUEST_TTL_HOURS ?? DEFAULT_TTL_HOURS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TTL_HOURS;
  return raw;
}

export function getZkpassportRequestTtlHours(): number {
  return getTtlHours();
}

export async function cleanupExpiredZkpassportRequests(ttlHours = getTtlHours()): Promise<number> {
  const cutoff = new Date(Date.now() - ttlHours * 60 * 60 * 1000).toISOString();

  const deleted = await db
    .delete(zkpassportRequests)
    .where(
      and(
        lt(zkpassportRequests.updatedAt, cutoff),
        eq(zkpassportRequests.status, 'completed'),
      ),
    )
    .returning({ requestId: zkpassportRequests.requestId });

  return deleted.length;
}

async function maybeCleanupExpiredRequests(): Promise<void> {
  const store = getStore();
  const now = Date.now();

  if (store.lastCleanupAt && now - store.lastCleanupAt < CLEANUP_MIN_INTERVAL_MS) {
    return;
  }

  store.lastCleanupAt = now;
  try {
    await cleanupExpiredZkpassportRequests();
  } catch {
    // Best-effort cleanup should never break request flow.
  }
}

export async function createZkpassportRequest(electionId: string): Promise<ZkpassportRequestState> {
  await maybeCleanupExpiredRequests();

  const zkPassport = getClient();

  const queryBuilder = await zkPassport.request({
    name: process.env.ZKPASSPORT_APP_NAME ?? 'ZK Vote Celestia',
    logo:
      process.env.ZKPASSPORT_APP_LOGO_URL ??
      'https://avatars.githubusercontent.com/u/213009008?s=200&v=4',
    purpose: `Verify unique voter for election ${electionId}`,
    scope: electionId,
    devMode: process.env.MOCK_ZKPASSPORT === 'true',
  });

  const { url, requestId, onRequestReceived, onGeneratingProof, onProofGenerated, onResult, onReject, onError } =
    queryBuilder.done();

  const initial = {
    requestId,
    electionId,
    url,
    status: 'created' as const,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  await db.insert(zkpassportRequests).values(initial);

  const patch = async (delta: Partial<typeof zkpassportRequests.$inferInsert>) => {
    await db
      .update(zkpassportRequests)
      .set({
        ...delta,
        updatedAt: nowIso(),
      })
      .where(eq(zkpassportRequests.requestId, requestId));
  };

  onRequestReceived(() => {
    void patch({ status: 'request_received' });
  });

  onGeneratingProof(() => {
    void patch({ status: 'generating_proof' });
  });

  onProofGenerated((p) => {
    if (!p.proof || !p.vkeyHash || !p.version) {
      void patch({ status: 'generating_proof' });
      return;
    }

    void patch({
      status: 'generating_proof',
      proof: p.proof,
      vkeyHash: p.vkeyHash,
      version: p.version,
      proofName: p.name,
    });
  });

  onResult(({ uniqueIdentifier, verified }) => {
    void patch({
      status: 'completed',
      verified,
      uniqueIdentifier,
    });
  });

  onReject(() => {
    void patch({ status: 'rejected' });
  });

  onError((error) => {
    void patch({ status: 'error', error });
  });

  return {
    requestId,
    electionId,
    url,
    status: 'created',
    createdAt: initial.createdAt,
    updatedAt: initial.updatedAt,
  };
}

export async function getZkpassportRequest(requestId: string): Promise<ZkpassportRequestState | null> {
  const row = await db.query.zkpassportRequests.findFirst({
    where: eq(zkpassportRequests.requestId, requestId),
  });

  if (!row) return null;
  return toState(row);
}

export async function getZkpassportRequestStats(): Promise<ZkpassportRequestStats> {
  const rows = await db
    .select({
      status: zkpassportRequests.status,
      count: count(),
    })
    .from(zkpassportRequests)
    .groupBy(zkpassportRequests.status);

  const byStatus = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = row.count;
    return acc;
  }, {});

  const total = rows.reduce((acc, row) => acc + row.count, 0);

  return { total, byStatus };
}
