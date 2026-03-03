import { createHash } from 'crypto';
import type { CastVoteRequest, CreateElectionRequest } from './types';

export type ZkpassportVerificationResult =
  | { ok: true; scopedNullifier: string; mode: 'mock' | 'placeholder' }
  | { ok: false; error: string };

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * POC verifier for voting.
 *
 * - MOCK_ZKPASSPORT=true:
 *   requires proof format `mock:<unique_user_id>` and derives scoped nullifier from (election_id, unique_user_id)
 * - otherwise:
 *   placeholder path requiring proof/vkey/version and deriving a deterministic scoped nullifier
 *   from proof material + election scope until real SDK verification is wired in.
 */
export async function verifyZkpassportProof(
  electionId: string,
  proof: CastVoteRequest['zkpassport_proof'],
): Promise<ZkpassportVerificationResult> {
  if (!proof) {
    return { ok: false, error: 'zkpassport_proof is required' };
  }

  const mockMode = process.env.MOCK_ZKPASSPORT === 'true';

  if (mockMode) {
    if (!proof.proof?.startsWith('mock:')) {
      return {
        ok: false,
        error: 'Invalid mock proof format. Expected proof="mock:<unique_user_id>"',
      };
    }

    const uniqueUserId = proof.proof.slice('mock:'.length).trim();
    if (!uniqueUserId) {
      return { ok: false, error: 'Mock unique user id is missing' };
    }

    const scopedNullifier = sha256Hex(`zkpassport:${electionId}:${uniqueUserId}`);
    return { ok: true, scopedNullifier, mode: 'mock' };
  }

  if (!proof.proof || !proof.vkey_hash || !proof.version) {
    return {
      ok: false,
      error: 'zkpassport_proof must include proof, vkey_hash, and version',
    };
  }

  // Placeholder for real ZKPassport verifier integration.
  // This keeps server-side scoped nullifier derivation (do not trust client nullifier input).
  const scopedNullifier = sha256Hex(
    `zkpassport:${electionId}:${proof.version}:${proof.vkey_hash}:${proof.proof}`,
  );
  return { ok: true, scopedNullifier, mode: 'placeholder' };
}

/**
 * Verify ZKPassport proof for election creation.
 * Uses "creator" scope instead of election_id, so:
 * - Same person = same creator_nullifier across all elections they create
 * - Different from voting nullifier (can't link creator to voter)
 */
export async function verifyCreatorZkpassport(
  proof: CreateElectionRequest['zkpassport_proof'],
): Promise<ZkpassportVerificationResult> {
  if (!proof) {
    return { ok: false, error: 'zkpassport_proof is required for election creation' };
  }

  const mockMode = process.env.MOCK_ZKPASSPORT === 'true';

  if (mockMode) {
    if (!proof.proof?.startsWith('mock:')) {
      return {
        ok: false,
        error: 'Invalid mock proof format. Expected proof="mock:<unique_user_id>"',
      };
    }

    const uniqueUserId = proof.proof.slice('mock:'.length).trim();
    if (!uniqueUserId) {
      return { ok: false, error: 'Mock unique user id is missing' };
    }

    // Use "creator" scope - same person always gets same creator nullifier
    const creatorNullifier = sha256Hex(`zkpassport:creator:${uniqueUserId}`);
    return { ok: true, scopedNullifier: creatorNullifier, mode: 'mock' };
  }

  if (!proof.proof || !proof.vkey_hash || !proof.version) {
    return {
      ok: false,
      error: 'zkpassport_proof must include proof, vkey_hash, and version',
    };
  }

  // Use "creator" scope for real proofs too
  const creatorNullifier = sha256Hex(
    `zkpassport:creator:${proof.version}:${proof.vkey_hash}:${proof.proof}`,
  );
  return { ok: true, scopedNullifier: creatorNullifier, mode: 'placeholder' };
}
