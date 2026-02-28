import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { elections } from '@/db/schema';
import { decodeBlobData, getHeight, namespaceFromHex, scanNamespace } from '@/lib/celestia';
import { validateTallyBlob } from '@/lib/validation';
import type { TallyBlob } from '@/lib/types';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const electionId = params.id;

  const election = await db.query.elections.findFirst({
    where: eq(elections.id, electionId),
  });

  if (!election) {
    return NextResponse.json({ error: 'Election not found' }, { status: 404 });
  }

  const namespace = namespaceFromHex(election.namespace);
  const currentHeight = await getHeight();
  const blobs = await scanNamespace(namespace, election.celestiaHeight, currentHeight);

  let latestTally: TallyBlob | null = null;

  for (const blob of blobs) {
    const decoded = decodeBlobData<unknown>(blob);
    const validated = validateTallyBlob(decoded, electionId);
    if (!validated.ok) continue;
    latestTally = validated.data;
  }

  if (!latestTally) {
    return NextResponse.json({ error: 'Results not available yet' }, { status: 404 });
  }

  return NextResponse.json({
    election_id: electionId,
    namespace: election.namespace,
    tally: latestTally,
    scanned_height_start: election.celestiaHeight,
    scanned_height_end: currentHeight,
  });
}
