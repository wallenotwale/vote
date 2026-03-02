import type {
  CastVoteRequest,
  CreateElectionRequest,
  ElectionConfigBlob,
  TallyBlob,
  VoteBlob,
} from './types';

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: string };
type ValidationResult<T> = Ok<T> | Err;

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const BASE64_REGEX = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(obj: Record<string, unknown>, allowed: string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(obj).every((k) => allowedSet.has(k));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoUtcDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_REGEX.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

function isBase64(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && BASE64_REGEX.test(value);
}

export function parseCreateElectionRequest(body: unknown): ValidationResult<CreateElectionRequest> {
  if (!isObject(body)) return { ok: false, error: 'Body must be a JSON object' };

  const allowed = ['title', 'description', 'candidates', 'voting_start', 'voting_end', 'creator_pubkey', 'creator_sig'];
  if (!hasOnlyKeys(body, allowed)) {
    return { ok: false, error: 'Body contains unsupported fields' };
  }

  const title = body.title;
  const description = body.description;
  const candidates = body.candidates;
  const votingStart = body.voting_start;
  const votingEnd = body.voting_end;
  const creatorPubkey = body.creator_pubkey;
  const creatorSig = body.creator_sig;

  if (!isNonEmptyString(title)) {
    return { ok: false, error: 'title is required and must be a non-empty string' };
  }

  if (description !== undefined && typeof description !== 'string') {
    return { ok: false, error: 'description must be a string when provided' };
  }

  if (!Array.isArray(candidates) || candidates.length < 2) {
    return { ok: false, error: 'candidates must be an array with at least 2 entries' };
  }
  if (!candidates.every((c) => isNonEmptyString(c))) {
    return { ok: false, error: 'all candidates must be non-empty strings' };
  }

  const normalizedCandidates = candidates.map((c) => c.trim());
  const deduped = new Set(normalizedCandidates.map((c) => c.toLowerCase()));
  if (deduped.size !== normalizedCandidates.length) {
    return { ok: false, error: 'candidates must be unique' };
  }

  if (!isIsoUtcDateString(votingStart) || !isIsoUtcDateString(votingEnd)) {
    return { ok: false, error: 'voting_start and voting_end must be ISO 8601 UTC strings' };
  }

  if (new Date(votingStart).getTime() >= new Date(votingEnd).getTime()) {
    return { ok: false, error: 'voting_start must be before voting_end' };
  }

  if (creatorPubkey !== undefined && !isNonEmptyString(creatorPubkey)) {
    return { ok: false, error: 'creator_pubkey must be a non-empty string when provided' };
  }

  if (creatorSig !== undefined && !isBase64(creatorSig)) {
    return { ok: false, error: 'creator_sig must be a base64 string when provided' };
  }

  if ((creatorPubkey && !creatorSig) || (!creatorPubkey && creatorSig)) {
    return { ok: false, error: 'creator_pubkey and creator_sig must be provided together' };
  }

  return {
    ok: true,
    data: {
      title: title.trim(),
      description: typeof description === 'string' ? description : '',
      candidates: normalizedCandidates,
      voting_start: votingStart,
      voting_end: votingEnd,
      ...(typeof creatorPubkey === 'string' ? { creator_pubkey: creatorPubkey } : {}),
      ...(typeof creatorSig === 'string' ? { creator_sig: creatorSig } : {}),
    },
  };
}

export function parseCastVoteRequest(body: unknown): ValidationResult<CastVoteRequest> {
  if (!isObject(body)) return { ok: false, error: 'Body must be a JSON object' };

  const allowed = ['election_id', 'nullifier', 'encrypted_vote', 'zkpassport_proof'];
  if (!hasOnlyKeys(body, allowed)) {
    return { ok: false, error: 'Body contains unsupported fields' };
  }

  const electionId = body.election_id;
  const nullifier = body.nullifier;
  const encryptedVote = body.encrypted_vote;
  const zkpassportProof = body.zkpassport_proof;

  if (!isNonEmptyString(electionId)) {
    return { ok: false, error: 'election_id is required' };
  }

  if (nullifier !== undefined) {
    if (typeof nullifier !== 'string' || !/^[a-fA-F0-9]{16,}$/.test(nullifier)) {
      return { ok: false, error: 'nullifier must be a hex string (min length 16)' };
    }
  }

  if (!isBase64(encryptedVote)) {
    return { ok: false, error: 'encrypted_vote must be a base64 string' };
  }

  if (zkpassportProof === undefined) {
    return { ok: false, error: 'zkpassport_proof is required' };
  }

  if (zkpassportProof !== undefined) {
    if (!isObject(zkpassportProof)) {
      return { ok: false, error: 'zkpassport_proof must be an object when provided' };
    }
    if (!hasOnlyKeys(zkpassportProof, ['proof', 'vkey_hash', 'version'])) {
      return { ok: false, error: 'zkpassport_proof contains unsupported fields' };
    }

    const { proof, vkey_hash, version } = zkpassportProof;
    if (proof !== undefined && !isNonEmptyString(proof)) {
      return { ok: false, error: 'zkpassport_proof.proof must be a non-empty string' };
    }
    if (vkey_hash !== undefined && !isNonEmptyString(vkey_hash)) {
      return { ok: false, error: 'zkpassport_proof.vkey_hash must be a non-empty string' };
    }
    if (version !== undefined && !isNonEmptyString(version)) {
      return { ok: false, error: 'zkpassport_proof.version must be a non-empty string' };
    }
  }

  return {
    ok: true,
    data: {
      election_id: electionId,
      ...(typeof nullifier === 'string' ? { nullifier: nullifier.toLowerCase() } : {}),
      encrypted_vote: encryptedVote,
      ...(zkpassportProof ? { zkpassport_proof: zkpassportProof } : {}),
    },
  };
}

export function validateElectionConfigBlob(
  blob: unknown,
  expectedElectionId?: string,
): ValidationResult<ElectionConfigBlob> {
  if (!isObject(blob)) return { ok: false, error: 'Blob is not an object' };

  const {
    type,
    version,
    election_id,
    title,
    description,
    candidates,
    created_at,
    voting_start,
    voting_end,
    encryption_pubkey,
    creator_pubkey,
    creator_sig,
  } = blob;

  if (type !== 'election_config') return { ok: false, error: 'Invalid blob type' };
  if (version !== 1) return { ok: false, error: 'Invalid blob version' };
  if (!isNonEmptyString(election_id)) return { ok: false, error: 'Invalid election_id' };
  if (expectedElectionId && election_id !== expectedElectionId) {
    return { ok: false, error: 'election_id mismatch' };
  }
  if (!isNonEmptyString(title)) return { ok: false, error: 'Invalid title' };
  if (typeof description !== 'string') return { ok: false, error: 'Invalid description' };
  if (!Array.isArray(candidates) || candidates.length < 2 || !candidates.every((c) => isNonEmptyString(c))) {
    return { ok: false, error: 'Invalid candidates' };
  }
  if (!isIsoUtcDateString(created_at)) return { ok: false, error: 'Invalid created_at' };
  if (!isIsoUtcDateString(voting_start) || !isIsoUtcDateString(voting_end)) {
    return { ok: false, error: 'Invalid voting window' };
  }
  if (new Date(voting_start).getTime() >= new Date(voting_end).getTime()) {
    return { ok: false, error: 'Invalid voting window ordering' };
  }
  if (encryption_pubkey !== undefined && !isNonEmptyString(encryption_pubkey)) {
    return { ok: false, error: 'Invalid encryption_pubkey' };
  }
  if (creator_pubkey !== undefined && !isNonEmptyString(creator_pubkey)) {
    return { ok: false, error: 'Invalid creator_pubkey' };
  }
  if (creator_sig !== undefined && !isBase64(creator_sig)) {
    return { ok: false, error: 'Invalid creator_sig' };
  }
  if ((creator_pubkey && !creator_sig) || (!creator_pubkey && creator_sig)) {
    return { ok: false, error: 'creator_pubkey and creator_sig must both be present when used' };
  }

  return {
    ok: true,
    data: {
      type: 'election_config',
      version: 1,
      election_id,
      title,
      description,
      candidates: candidates.map((c) => c.trim()),
      created_at,
      voting_start,
      voting_end,
      ...(encryption_pubkey ? { encryption_pubkey } : {}),
      ...(creator_pubkey ? { creator_pubkey } : {}),
      ...(creator_sig ? { creator_sig } : {}),
    },
  };
}

export function validateVoteBlob(blob: unknown, expectedElectionId?: string): ValidationResult<VoteBlob> {
  if (!isObject(blob)) return { ok: false, error: 'Blob is not an object' };

  const { type, election_id, nullifier, encrypted_vote, zkpassport_proof, timestamp } = blob;

  if (type !== 'vote') return { ok: false, error: 'Invalid blob type' };
  if (!isNonEmptyString(election_id)) return { ok: false, error: 'Invalid election_id' };
  if (expectedElectionId && election_id !== expectedElectionId) {
    return { ok: false, error: 'election_id mismatch' };
  }
  if (typeof nullifier !== 'string' || !/^[a-fA-F0-9]{16,}$/.test(nullifier)) {
    return { ok: false, error: 'Invalid nullifier' };
  }
  if (!isBase64(encrypted_vote)) return { ok: false, error: 'Invalid encrypted_vote' };
  if (!isIsoUtcDateString(timestamp)) return { ok: false, error: 'Invalid timestamp' };

  if (zkpassport_proof !== undefined) {
    if (!isObject(zkpassport_proof)) {
      return { ok: false, error: 'Invalid zkpassport_proof' };
    }
  }

  return {
    ok: true,
    data: {
      type: 'vote',
      election_id,
      nullifier: nullifier.toLowerCase(),
      encrypted_vote,
      ...(zkpassport_proof ? { zkpassport_proof } : {}),
      timestamp,
    },
  };
}

export function validateTallyBlob(blob: unknown, expectedElectionId?: string): ValidationResult<TallyBlob> {
  if (!isObject(blob)) return { ok: false, error: 'Blob is not an object' };

  const { type, election_id, results, total_votes, decryption_key, nullifiers, tallied_at } = blob;

  if (type !== 'tally') return { ok: false, error: 'Invalid blob type' };
  if (!isNonEmptyString(election_id)) return { ok: false, error: 'Invalid election_id' };
  if (expectedElectionId && election_id !== expectedElectionId) {
    return { ok: false, error: 'election_id mismatch' };
  }

  if (!isObject(results)) return { ok: false, error: 'Invalid results' };
  for (const [key, value] of Object.entries(results)) {
    if (!isNonEmptyString(key)) return { ok: false, error: 'Invalid results key' };
    if (typeof value !== 'number' || value < 0 || !Number.isInteger(value)) {
      return { ok: false, error: 'Invalid results value' };
    }
  }

  if (typeof total_votes !== 'number' || total_votes < 0 || !Number.isInteger(total_votes)) {
    return { ok: false, error: 'Invalid total_votes' };
  }
  if (!isBase64(decryption_key)) return { ok: false, error: 'Invalid decryption_key' };
  if (!Array.isArray(nullifiers) || !nullifiers.every((n) => typeof n === 'string' && /^[a-fA-F0-9]{16,}$/.test(n))) {
    return { ok: false, error: 'Invalid nullifiers' };
  }
  if (!isIsoUtcDateString(tallied_at)) return { ok: false, error: 'Invalid tallied_at' };

  return {
    ok: true,
    data: {
      type: 'tally',
      election_id,
      results: results as Record<string, number>,
      total_votes,
      decryption_key,
      nullifiers: (nullifiers as string[]).map((n) => n.toLowerCase()),
      tallied_at,
    },
  };
}
