import { NextResponse } from 'next/server';
import {
  cleanupExpiredZkpassportRequests,
  getZkpassportRequestStats,
  getZkpassportRequestTtlHours,
  listZkpassportRequests,
} from '@/lib/zkpassport-requests';

function isAdminAuthorized(request: Request): boolean {
  const configured = process.env.ADMIN_API_KEY;
  if (!configured) return false;
  const provided = request.headers.get('x-admin-api-key');
  return provided === configured;
}

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return parsed;
}

function asIsoOrUndefined(value: string | null): string | undefined {
  if (!value) return undefined;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return undefined;
  return new Date(time).toISOString();
}

export async function GET(request: Request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const runCleanup = searchParams.get('cleanup') === 'true';

  const ttlHours = getZkpassportRequestTtlHours();
  const statsBefore = await getZkpassportRequestStats();
  const deleted = runCleanup ? await cleanupExpiredZkpassportRequests(ttlHours) : 0;
  const statsAfter = runCleanup ? await getZkpassportRequestStats() : statsBefore;

  const limit = Math.min(parsePositiveInt(searchParams.get('limit'), 25), 100);
  const offset = parsePositiveInt(searchParams.get('offset'), 0);
  const electionId = searchParams.get('election_id') ?? undefined;
  const status = searchParams.get('status') ?? undefined;
  const updatedFrom = asIsoOrUndefined(searchParams.get('updated_from'));
  const updatedTo = asIsoOrUndefined(searchParams.get('updated_to'));

  const requests = await listZkpassportRequests({
    electionId,
    status,
    updatedFrom,
    updatedTo,
    limit,
    offset,
  });

  return NextResponse.json({
    ok: true,
    ttl_hours: ttlHours,
    cleanup: {
      requested: runCleanup,
      deleted,
    },
    stats: statsAfter,
    filters: {
      election_id: electionId,
      status,
      updated_from: updatedFrom,
      updated_to: updatedTo,
      limit,
      offset,
    },
    requests,
  });
}
