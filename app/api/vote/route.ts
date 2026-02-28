import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { namespaceFromHex, submitBlob } from '@/lib/celestia';
import { elections, nullifiers } from '@/db/schema';
import { parseCastVoteRequest, validateVoteBlob } from '@/lib/validation';
import { verifyZkpassportProof } from '@/lib/zkpassport';
import type { CastVoteResponse, VoteBlob } from '@/lib/types';

function isOpenWindow(votingStart: string, votingEnd: string): boolean {
  const now = Date.now();
  const start = new Date(votingStart).getTime();
  const end = new Date(votingEnd).getTime();
  return now >= start && now <= end;
}

export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = parseCastVoteRequest(rawBody);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { election_id, encrypted_vote, zkpassport_proof } = parsed.data;

  const election = await db.query.elections.findFirst({
    where: eq(elections.id, election_id),
  });

  if (!election) {
    return NextResponse.json({ error: 'Election not found' }, { status: 404 });
  }

  if (!isOpenWindow(election.votingStart, election.votingEnd)) {
    return NextResponse.json(
      { error: 'Voting is not active for this election' },
      { status: 400 },
    );
  }

  const verification = await verifyZkpassportProof(election_id, zkpassport_proof);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: 400 });
  }

  const nullifier = verification.scopedNullifier;

  const existing = await db.query.nullifiers.findFirst({
    where: and(
      eq(nullifiers.electionId, election_id),
      eq(nullifiers.nullifier, nullifier),
    ),
  });

  if (existing) {
    return NextResponse.json(
      { error: 'Nullifier already used for this election' },
      { status: 409 },
    );
  }

  const voteBlob: VoteBlob = {
    type: 'vote',
    election_id,
    nullifier,
    encrypted_vote,
    ...(zkpassport_proof ? { zkpassport_proof } : {}),
    timestamp: new Date().toISOString(),
  };

  const validatedVoteBlob = validateVoteBlob(voteBlob, election_id);
  if (!validatedVoteBlob.ok) {
    return NextResponse.json(
      { error: `Invalid vote blob: ${validatedVoteBlob.error}` },
      { status: 400 },
    );
  }

  let celestiaHeight: number;
  let commitment: Buffer;
  try {
    const result = await submitBlob(namespaceFromHex(election.namespace), validatedVoteBlob.data);
    celestiaHeight = result.height;
    commitment = result.commitment;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Failed to submit vote blob to Celestia: ${msg}` },
      { status: 502 },
    );
  }

  try {
    await db.insert(nullifiers).values({
      electionId: election_id,
      nullifier,
      celestiaHeight,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('unique')) {
      return NextResponse.json(
        { error: 'Nullifier already used for this election' },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: `Failed to persist nullifier: ${msg}` },
      { status: 500 },
    );
  }

  const blobCommitment = commitment.toString('base64');
  const submittedAt = new Date().toISOString();

  const response: CastVoteResponse = {
    success: true,
    celestia_height: celestiaHeight,
    blob_commitment: blobCommitment,
    receipt: {
      receipt_id: crypto.randomUUID(),
      election_id,
      nullifier,
      submitted_at: submittedAt,
      celestia_height: celestiaHeight,
      blob_commitment: blobCommitment,
    },
  };
  return NextResponse.json(response, { status: 201 });
}
