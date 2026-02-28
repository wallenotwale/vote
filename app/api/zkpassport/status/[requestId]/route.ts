import { NextResponse } from 'next/server';
import { getZkpassportRequest } from '@/lib/zkpassport-requests';

export async function GET(
  _request: Request,
  { params }: { params: { requestId: string } },
) {
  const state = getZkpassportRequest(params.requestId);
  if (!state) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }

  return NextResponse.json({
    request_id: state.requestId,
    election_id: state.electionId,
    status: state.status,
    verification_url: state.url,
    verified: state.verified,
    unique_identifier: state.uniqueIdentifier,
    proof: state.proof,
    error: state.error,
    created_at: state.createdAt,
    updated_at: state.updatedAt,
  });
}
