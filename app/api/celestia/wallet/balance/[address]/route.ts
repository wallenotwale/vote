import { NextResponse } from 'next/server';
import { getMochaAddressBalance, getMochaFaucetUrl } from '@/lib/celestia-account';

function isAdminAuthorized(request: Request): boolean {
  const configured = process.env.ADMIN_API_KEY;
  if (!configured) return false;
  const provided = request.headers.get('x-admin-api-key');
  return provided === configured;
}

export async function GET(
  request: Request,
  { params }: { params: { address: string } },
) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const balance = await getMochaAddressBalance(params.address);
    return NextResponse.json({
      address: params.address,
      balance,
      faucet_url: getMochaFaucetUrl(params.address),
      funded: Number(balance.spendable) > 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
