import { ZKPassport } from '@zkpassport/sdk';

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

type GlobalStore = {
  zkp?: ZKPassport;
  requests: Map<string, ZkpassportRequestState>;
};

const globalKey = '__zkpassport_request_store__';
const g = globalThis as typeof globalThis & { [globalKey]?: GlobalStore };

function nowIso(): string {
  return new Date().toISOString();
}

function getStore(): GlobalStore {
  if (!g[globalKey]) {
    g[globalKey] = { requests: new Map<string, ZkpassportRequestState>() };
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

export async function createZkpassportRequest(electionId: string): Promise<ZkpassportRequestState> {
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

  const store = getStore();
  const initial: ZkpassportRequestState = {
    requestId,
    electionId,
    url,
    status: 'created',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  store.requests.set(requestId, initial);

  const patch = (delta: Partial<ZkpassportRequestState>) => {
    const prev = store.requests.get(requestId);
    if (!prev) return;
    store.requests.set(requestId, {
      ...prev,
      ...delta,
      updatedAt: nowIso(),
    });
  };

  onRequestReceived(() => {
    patch({ status: 'request_received' });
  });

  onGeneratingProof(() => {
    patch({ status: 'generating_proof' });
  });

  onProofGenerated((p) => {
    if (!p.proof || !p.vkeyHash || !p.version) {
      patch({ status: 'generating_proof' });
      return;
    }

    patch({
      status: 'generating_proof',
      proof: {
        proof: p.proof,
        vkey_hash: p.vkeyHash,
        version: p.version,
        name: p.name,
      },
    });
  });

  onResult(({ uniqueIdentifier, verified }) => {
    patch({
      status: 'completed',
      verified,
      uniqueIdentifier,
    });
  });

  onReject(() => {
    patch({ status: 'rejected' });
  });

  onError((error) => {
    patch({ status: 'error', error });
  });

  return initial;
}

export function getZkpassportRequest(requestId: string): ZkpassportRequestState | null {
  return getStore().requests.get(requestId) ?? null;
}
