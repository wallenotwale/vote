/**
 * Celestia RPC client for Lumina light node (localhost:26658).
 *
 * Implements blob.Submit and blob.GetAll JSON-RPC calls.
 * Blob commitment is computed using celestia's NMT + subtree-root scheme.
 *
 * Namespace format: v0, 29 bytes = 0x00 || 18 zero bytes || 10-byte NID
 * NID for an election  = sha256(election_id)[0:10]
 */

import { createHash } from 'crypto';
import type { CelestiaBlob, SubmitBlobResult } from './types';

// ── Constants ────────────────────────────────────────────────────────────────

const SHARE_SIZE = 512;
const NS_SIZE = 29;        // namespace bytes per share
const INFO_BYTE_SIZE = 1;
const SEQ_LEN_BYTES = 4;
const FIRST_SHARE_CONTENT = SHARE_SIZE - NS_SIZE - INFO_BYTE_SIZE - SEQ_LEN_BYTES; // 478
const CONT_SHARE_CONTENT = SHARE_SIZE - NS_SIZE - INFO_BYTE_SIZE;                   // 482

// NMT hash = ns_min(29) || ns_max(29) || sha256(32) = 90 bytes
const NMT_HASH_SIZE = NS_SIZE * 2 + 32;

const NMT_LEAF_PREFIX = 0x00;
const NMT_INNER_PREFIX = 0x01;
// Cosmos SDK Merkle tree leaf prefix (same values, different context)
const MERKLE_LEAF_PREFIX = 0x00;

// ── Namespace helpers ────────────────────────────────────────────────────────

/**
 * Derive the Celestia v0 namespace (29 bytes) for an election.
 * namespace = 0x00 || zeros(18) || sha256(election_id)[0:10]
 */
export function electionNamespace(electionId: string): Uint8Array {
  const hash = createHash('sha256').update(electionId).digest();
  const nid = hash.slice(0, 10);
  const ns = new Uint8Array(NS_SIZE); // zeroed by default
  ns[0] = 0x00;                       // version = 0
  ns.set(nid, NS_SIZE - 10);          // last 10 bytes = NID
  return ns;
}

export function namespaceToHex(ns: Uint8Array): string {
  return Buffer.from(ns).toString('hex');
}

export function namespaceFromHex(hex: string): Uint8Array {
  return new Uint8Array(Buffer.from(hex, 'hex'));
}

// ── Share splitting ──────────────────────────────────────────────────────────

function splitIntoShares(namespace: Uint8Array, data: Uint8Array): Uint8Array[] {
  const shares: Uint8Array[] = [];

  // First share
  const first = new Uint8Array(SHARE_SIZE); // zeroed
  first.set(namespace, 0);
  first[NS_SIZE] = 0x80; // info byte: sequence_start=1, share_version=0
  // Sequence length as big-endian uint32
  const seqLen = data.length;
  first[NS_SIZE + 1] = (seqLen >>> 24) & 0xff;
  first[NS_SIZE + 2] = (seqLen >>> 16) & 0xff;
  first[NS_SIZE + 3] = (seqLen >>> 8) & 0xff;
  first[NS_SIZE + 4] = seqLen & 0xff;
  first.set(data.slice(0, FIRST_SHARE_CONTENT), NS_SIZE + INFO_BYTE_SIZE + SEQ_LEN_BYTES);
  shares.push(first);

  // Continuation shares
  let offset = FIRST_SHARE_CONTENT;
  while (offset < data.length) {
    const cont = new Uint8Array(SHARE_SIZE); // zeroed (padding = 0x00)
    cont.set(namespace, 0);
    cont[NS_SIZE] = 0x00; // info byte: sequence_start=0, share_version=0
    cont.set(data.slice(offset, offset + CONT_SHARE_CONTENT), NS_SIZE + INFO_BYTE_SIZE);
    shares.push(cont);
    offset += CONT_SHARE_CONTENT;
  }

  return shares;
}

// ── NMT hashing ──────────────────────────────────────────────────────────────

function nmtLeafHash(share: Uint8Array): Uint8Array {
  const ns = share.slice(0, NS_SIZE);
  const h = createHash('sha256');
  h.update(Buffer.from([NMT_LEAF_PREFIX]));
  h.update(ns); // ns_min
  h.update(ns); // ns_max (same for blob shares — all same namespace)
  h.update(share);
  const digest = h.digest();

  const result = new Uint8Array(NMT_HASH_SIZE);
  result.set(ns, 0);          // ns_min
  result.set(ns, NS_SIZE);    // ns_max
  result.set(digest, NS_SIZE * 2);
  return result;
}

function nmtInnerHash(left: Uint8Array, right: Uint8Array): Uint8Array {
  const nsMin = left.slice(0, NS_SIZE);
  const nsMax = right.slice(NS_SIZE, NS_SIZE * 2);
  const h = createHash('sha256');
  h.update(Buffer.from([NMT_INNER_PREFIX]));
  h.update(left);
  h.update(right);
  const digest = h.digest();

  const result = new Uint8Array(NMT_HASH_SIZE);
  result.set(nsMin, 0);
  result.set(nsMax, NS_SIZE);
  result.set(digest, NS_SIZE * 2);
  return result;
}

// Largest power of 2 strictly less than n  (Cosmos SDK getSplitPoint)
function splitPoint(n: number): number {
  let k = 1;
  while (k < n) k <<= 1;
  return k >> 1;
}

function nmtRoot(hashes: Uint8Array[]): Uint8Array {
  if (hashes.length === 0) {
    // Empty: return zeroed NMT hash
    return new Uint8Array(NMT_HASH_SIZE);
  }
  if (hashes.length === 1) {
    return hashes[0];
  }
  const k = splitPoint(hashes.length);
  const left = nmtRoot(hashes.slice(0, k));
  const right = nmtRoot(hashes.slice(k));
  return nmtInnerHash(left, right);
}

// ── Commitment computation ───────────────────────────────────────────────────

/**
 * Compute the blob commitment for a blob with the given namespace and data.
 *
 * For blobs with < SubtreeRootThreshold (64) shares:
 *   commitment = CosmosLeafHash(NMT_root(shares))
 *              = SHA256(0x00 || nmt_root_90_bytes)
 *
 * For larger blobs: multiple subtree roots are merged. Not needed for POC
 * (election config + votes are tiny).
 */
export function computeCommitment(namespace: Uint8Array, data: Uint8Array): Buffer {
  const shares = splitIntoShares(namespace, data);
  const leafHashes = shares.map(nmtLeafHash);
  const root = nmtRoot(leafHashes); // 90 bytes

  // Cosmos SDK Merkle leafHash over the single subtree root
  const h = createHash('sha256');
  h.update(Buffer.from([MERKLE_LEAF_PREFIX]));
  h.update(root);
  return h.digest();
}

// ── JSON-RPC helpers ─────────────────────────────────────────────────────────

interface RpcResponse<T> {
  id: number;
  jsonrpc: '2.0';
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const url = process.env.CELESTIA_RPC_URL ?? 'http://localhost:26658';
  const token = process.env.CELESTIA_AUTH_TOKEN;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      id: 1,
      jsonrpc: '2.0',
      method,
      params,
    }),
  });

  if (!res.ok) {
    throw new Error(`Celestia RPC HTTP error: ${res.status} ${res.statusText}`);
  }

  const json: RpcResponse<T> = await res.json();

  if (json.error) {
    throw new Error(`Celestia RPC error [${json.error.code}]: ${json.error.message}`);
  }

  return json.result as T;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Submit a JSON blob to the given namespace.
 * Returns the block height and commitment.
 */
export async function submitBlob(
  namespace: Uint8Array,
  data: object,
): Promise<SubmitBlobResult> {
  const dataBytes = Buffer.from(JSON.stringify(data));
  const commitment = computeCommitment(namespace, dataBytes);

  const blob: CelestiaBlob = {
    namespace: Buffer.from(namespace).toString('base64'),
    data: dataBytes.toString('base64'),
    share_version: 0,
    commitment: commitment.toString('base64'),
  };

  // blob.Submit(blobs []Blob, gasPrice float64) → uint64 (height)
  const height = await rpcCall<number>('blob.Submit', [[blob], -1.0]);

  return { height, commitment };
}

/**
 * Get all blobs in a namespace at a specific block height.
 */
export async function getBlobs(
  namespace: Uint8Array,
  height: number,
): Promise<CelestiaBlob[]> {
  const nsB64 = Buffer.from(namespace).toString('base64');

  // blob.GetAll(height uint64, namespaces []Namespace) → []Blob
  const result = await rpcCall<CelestiaBlob[] | null>('blob.GetAll', [height, [nsB64]]);
  return result ?? [];
}

/**
 * Decode a CelestiaBlob's data field from base64 and parse as JSON.
 */
export function decodeBlobData<T = unknown>(blob: CelestiaBlob): T {
  return JSON.parse(Buffer.from(blob.data, 'base64').toString('utf8')) as T;
}

/**
 * Get the current block height from the Lumina node's local head.
 */
export async function getHeight(): Promise<number> {
  const head = await rpcCall<{ header: { height: string } }>('header.LocalHead', []);
  return parseInt(head.header.height, 10);
}

/**
 * Scan a namespace across a range of heights (inclusive).
 * Useful for gathering all vote blobs for an election.
 */
export async function scanNamespace(
  namespace: Uint8Array,
  fromHeight: number,
  toHeight: number,
): Promise<CelestiaBlob[]> {
  const all: CelestiaBlob[] = [];
  for (let h = fromHeight; h <= toHeight; h++) {
    try {
      const blobs = await getBlobs(namespace, h);
      all.push(...blobs);
    } catch {
      // Height may not have blobs for this namespace — skip
    }
  }
  return all;
}
