// ── Celestia blob types ──────────────────────────────────────────────────────

export interface ElectionConfigBlob {
  type: 'election_config';
  version: 1;
  election_id: string;
  title: string;
  description: string;
  candidates: string[];
  created_at: string;
  voting_start: string;
  voting_end: string;
  encryption_pubkey?: string;
  admin_address?: string;
  creator_pubkey?: string; // PEM public key for election creator signature
  creator_sig?: string; // base64 signature over canonical election creation payload
}

export interface VoteBlob {
  type: 'vote';
  election_id: string;
  nullifier: string; // hex
  encrypted_vote: string; // base64
  zkpassport_proof?: {
    proof?: string;
    vkey_hash?: string;
    version?: string;
  };
  timestamp: string;
}

export interface TallyBlob {
  type: 'tally';
  election_id: string;
  results: Record<string, number>;
  total_votes: number;
  decryption_key: string; // base64
  nullifiers: string[];
  tallied_at: string;
}

export type AnyBlob = ElectionConfigBlob | VoteBlob | TallyBlob;

// ── API request/response types ───────────────────────────────────────────────

export interface CreateElectionRequest {
  title: string;
  description?: string;
  candidates: string[];
  voting_start: string; // ISO 8601
  voting_end: string;
  creator_pubkey?: string; // optional, for permissionless signed election creation
  creator_sig?: string; // base64 signature over canonical election payload
}

export interface CreateElectionResponse {
  election_id: string;
  namespace: string; // hex-encoded 29 bytes
  celestia_height: number;
  commitment: string; // base64
  encryption_pubkey: string; // base64 (SPKI DER)
  creator_pubkey?: string;
  creator_sig?: string;
}

export interface ElectionResponse {
  election_id: string;
  namespace: string;
  celestia_height: number;
  config: ElectionConfigBlob | null;
  db_data: {
    title: string;
    candidates: string[];
    voting_start: string;
    voting_end: string;
    encryption_pubkey: string | null;
    created_at: string;
  };
}

export interface CastVoteRequest {
  election_id: string;
  nullifier?: string; // deprecated: server derives scoped nullifier from proof
  encrypted_vote: string; // base64
  zkpassport_proof?: {
    proof?: string;
    vkey_hash?: string;
    version?: string;
  };
}

export interface CastVoteResponse {
  success: true;
  celestia_height: number;
  blob_commitment: string; // base64
  receipt: {
    receipt_id: string;
    election_id: string;
    nullifier: string;
    submitted_at: string;
    celestia_height: number;
    blob_commitment: string;
  };
}

// ── DB row types ──────────────────────────────────────────────────────────────

export interface ElectionRow {
  id: string;
  title: string;
  description: string;
  candidates: string; // JSON
  voting_start: string;
  voting_end: string;
  namespace: string; // hex
  celestia_height: number;
  encryption_pubkey: string | null;
  encryption_privkey: string | null;
  created_at: string;
}

// ── Celestia RPC types ───────────────────────────────────────────────────────

export interface CelestiaBlob {
  namespace: string; // base64-encoded 29 bytes
  data: string;      // base64-encoded blob data
  share_version: number;
  commitment: string; // base64-encoded 32 bytes
  index?: number;
}

export interface SubmitBlobResult {
  height: number;
  commitment: Buffer;
}
