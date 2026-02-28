import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { elections } from '@/db/schema';
import { decodeBlobData, getHeight, scanNamespace, submitBlob, namespaceFromHex } from '@/lib/celestia';
import { tallyVotes } from '@/lib/crypto';
import { validateTallyBlob, validateVoteBlob } from '@/lib/validation';
import type { TallyBlob } from '@/lib/types';

function isAdminAuthorized(request: Request): boolean {
  const configured = process.env.ADMIN_API_KEY;
  if (!configured) return false;
  const provided = request.headers.get('x-admin-api-key');
  return provided === configured;
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const electionId = params.id;
  const election = await db.query.elections.findFirst({
    where: eq(elections.id, electionId),
  });

  if (!election) {
    return NextResponse.json({ error: 'Election not found' }, { status: 404 });
  }

  if (!election.encryptionPrivkey) {
    return NextResponse.json({ error: 'Election private key is unavailable' }, { status: 500 });
  }

  const now = Date.now();
  const votingEnd = new Date(election.votingEnd).getTime();
  if (now < votingEnd) {
    return NextResponse.json({ error: 'Voting is still active' }, { status: 400 });
  }

  const namespace = namespaceFromHex(election.namespace);
  const currentHeight = await getHeight();
  const blobs = await scanNamespace(namespace, election.celestiaHeight, currentHeight);

  const encryptedVotes: string[] = [];
  const usedNullifiers = new Set<string>();

  for (const blob of blobs) {
    const decoded = decodeBlobData<unknown>(blob);
    const vote = validateVoteBlob(decoded, electionId);
    if (!vote.ok) continue;

    if (usedNullifiers.has(vote.data.nullifier)) continue;
    usedNullifiers.add(vote.data.nullifier);
    encryptedVotes.push(vote.data.encrypted_vote);
  }

  const results = await tallyVotes(encryptedVotes, election.encryptionPrivkey);
  const candidates = JSON.parse(election.candidates) as string[];
  for (const candidate of candidates) {
    if (results[candidate] === undefined) results[candidate] = 0;
  }

  const tallyBlob: TallyBlob = {
    type: 'tally',
    election_id: electionId,
    results,
    total_votes: encryptedVotes.length,
    decryption_key: election.encryptionPrivkey,
    nullifiers: Array.from(usedNullifiers),
    tallied_at: new Date().toISOString(),
  };

  const validated = validateTallyBlob(tallyBlob, electionId);
  if (!validated.ok) {
    return NextResponse.json({ error: `Invalid tally blob: ${validated.error}` }, { status: 500 });
  }

  const submitted = await submitBlob(namespace, validated.data);

  return NextResponse.json({
    success: true,
    election_id: electionId,
    celestia_height: submitted.height,
    blob_commitment: submitted.commitment.toString('base64'),
    total_votes: encryptedVotes.length,
    results,
  });
}
