import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { elections } from '@/db/schema';
import { decodeBlobData, getHeight, namespaceFromHex, scanNamespace } from '@/lib/celestia';
import { validateTallyBlob, validateVoteBlob } from '@/lib/validation';

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const electionId = params.id;
  const nullifier = new URL(request.url).searchParams.get('nullifier')?.toLowerCase() ?? null;

  const election = await db.query.elections.findFirst({
    where: eq(elections.id, electionId),
  });

  if (!election) {
    return NextResponse.json({ error: 'Election not found' }, { status: 404 });
  }

  const currentHeight = await getHeight();
  const blobs = await scanNamespace(namespaceFromHex(election.namespace), election.celestiaHeight, currentHeight);

  let voteBlobCount = 0;
  let tallyBlobCount = 0;
  const uniqueNullifiers = new Set<string>();

  for (const blob of blobs) {
    const decoded = decodeBlobData<unknown>(blob);
    const vote = validateVoteBlob(decoded, electionId);
    if (vote.ok) {
      voteBlobCount += 1;
      uniqueNullifiers.add(vote.data.nullifier);
      continue;
    }

    const tally = validateTallyBlob(decoded, electionId);
    if (tally.ok) tallyBlobCount += 1;
  }

  return NextResponse.json({
    election_id: electionId,
    namespace: election.namespace,
    vote_blob_count: voteBlobCount,
    unique_nullifier_count: uniqueNullifiers.size,
    tally_blob_count: tallyBlobCount,
    nullifier_checked: nullifier,
    nullifier_included: nullifier ? uniqueNullifiers.has(nullifier) : null,
    scanned_height_start: election.celestiaHeight,
    scanned_height_end: currentHeight,
  });
}
