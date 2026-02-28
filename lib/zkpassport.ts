import { createHash } from 'crypto';
import type { CastVoteRequest } from './types';

export type ZkpassportVerificationResult =
  | { ok: true; scopedNullifier: string; mode: 'mock' | 'placeholder' }
  | { ok: false; error: string };

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * POC verifier.
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
