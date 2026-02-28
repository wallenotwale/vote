import { NextResponse } from 'next/server';
import { createZkpassportRequest } from '@/lib/zkpassport-requests';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const created = await createZkpassportRequest(params.id);
    return NextResponse.json({
      election_id: created.electionId,
      scope: created.electionId,
      request_id: created.requestId,
      verification_url: created.url,
      notes:
        'Use the verification URL to complete identity proof in ZKPassport. This page will poll for proof and auto-fill when available.',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('NEXT_PUBLIC_ZKPASSPORT_DOMAIN') ? 500 : 502;
    return NextResponse.json(
      { error: `Failed to create ZKPassport request: ${msg}` },
      { status },
    );
  }
}
