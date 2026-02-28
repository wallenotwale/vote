import { NextResponse } from 'next/server';
import {
  cleanupExpiredZkpassportRequests,
  getZkpassportRequestStats,
  getZkpassportRequestTtlHours,
} from '@/lib/zkpassport-requests';

function isAdminAuthorized(request: Request): boolean {
  const configured = process.env.ADMIN_API_KEY;
  if (!configured) return false;
  const provided = request.headers.get('x-admin-api-key');
  return provided === configured;
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

  return NextResponse.json({
    ok: true,
    ttl_hours: ttlHours,
    cleanup: {
      requested: runCleanup,
      deleted,
    },
    stats: statsAfter,
  });
}
