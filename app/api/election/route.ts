import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { elections } from '@/db/schema';
import { electionNamespace, namespaceToHex, submitBlob } from '@/lib/celestia';
import { generateElectionKeypair } from '@/lib/crypto';
import { parseCreateElectionRequest, validateElectionConfigBlob } from '@/lib/validation';
import type { CreateElectionResponse, ElectionConfigBlob } from '@/lib/types';

export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = parseCreateElectionRequest(rawBody);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { title, description, candidates, voting_start, voting_end } = parsed.data;
  const normalizedDescription = description ?? '';

  const electionId = crypto.randomUUID();
  const namespace = electionNamespace(electionId);
  const namespaceHex = namespaceToHex(namespace);
  const now = new Date().toISOString();
  let publicKey: string;
  let privateKey: string;
  try {
    const kp = await generateElectionKeypair();
    publicKey = kp.publicKey;
    privateKey = kp.privateKey;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Failed to generate election keypair: ${msg}` },
      { status: 500 },
    );
  }

  const configBlob: ElectionConfigBlob = {
    type: 'election_config',
    version: 1,
    election_id: electionId,
    title,
    description: normalizedDescription,
    candidates,
    created_at: now,
    voting_start,
    voting_end,
    encryption_pubkey: publicKey,
  };

  const validatedBlob = validateElectionConfigBlob(configBlob, electionId);
  if (!validatedBlob.ok) {
    return NextResponse.json(
      { error: `Invalid election config blob: ${validatedBlob.error}` },
      { status: 500 },
    );
  }

  let celestiaHeight: number;
  let commitment: Buffer;

  try {
    const result = await submitBlob(namespace, validatedBlob.data);
    celestiaHeight = result.height;
    commitment = result.commitment;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Failed to submit blob to Celestia: ${msg}` },
      { status: 502 },
    );
  }

  await db.insert(elections).values({
    id: electionId,
    title,
    description: normalizedDescription,
    candidates: JSON.stringify(candidates),
    votingStart: voting_start,
    votingEnd: voting_end,
    namespace: namespaceHex,
    celestiaHeight,
    encryptionPubkey: publicKey,
    encryptionPrivkey: privateKey,
    createdAt: now,
  });

  const response: CreateElectionResponse = {
    election_id: electionId,
    namespace: namespaceHex,
    celestia_height: celestiaHeight,
    commitment: commitment.toString('base64'),
    encryption_pubkey: publicKey,
  };

  return NextResponse.json(response, { status: 201 });
}

export async function GET() {
  const rows = await db.query.elections.findMany({
    orderBy: (e, { desc }) => [desc(e.createdAt)],
    limit: 20,
  });

  const list = rows.map((r) => ({
    election_id: r.id,
    title: r.title,
    candidates: JSON.parse(r.candidates) as string[],
    voting_start: r.votingStart,
    voting_end: r.votingEnd,
    namespace: r.namespace,
    celestia_height: r.celestiaHeight,
    created_at: r.createdAt,
  }));

  return NextResponse.json(list);
}
