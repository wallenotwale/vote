import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { elections } from '@/db/schema';
import { getBlobs, decodeBlobData, namespaceFromHex } from '@/lib/celestia';
import { validateElectionConfigBlob } from '@/lib/validation';
import type { ElectionConfigBlob, ElectionResponse } from '@/lib/types';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const { id } = params;

  const row = await db.query.elections.findFirst({
    where: eq(elections.id, id),
  });

  if (!row) {
    return NextResponse.json({ error: 'Election not found' }, { status: 404 });
  }

  const namespace = namespaceFromHex(row.namespace);

  let configBlob: ElectionConfigBlob | null = null;
  try {
    const blobs = await getBlobs(namespace, row.celestiaHeight);
    for (const b of blobs) {
      const decoded = decodeBlobData<unknown>(b);
      const validated = validateElectionConfigBlob(decoded, id);
      if (validated.ok) {
        configBlob = validated.data;
        break;
      }
    }
  } catch {
    // Celestia node unavailable — return DB data only
  }

  const response: ElectionResponse = {
    election_id: row.id,
    namespace: row.namespace,
    celestia_height: row.celestiaHeight,
    config: configBlob,
    db_data: {
      title: row.title,
      candidates: JSON.parse(row.candidates) as string[],
      voting_start: row.votingStart,
      voting_end: row.votingEnd,
      encryption_pubkey: row.encryptionPubkey,
      created_at: row.createdAt,
    },
  };

  return NextResponse.json(response);
}
