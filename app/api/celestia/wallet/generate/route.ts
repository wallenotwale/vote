import { NextResponse } from 'next/server';
import { createCelestiaAccount, getMochaFaucetUrl } from '@/lib/celestia-account';

function isAdminAuthorized(request: Request): boolean {
  const configured = process.env.ADMIN_API_KEY;
  if (!configured) return false;
  const provided = request.headers.get('x-admin-api-key');
  return provided === configured;
}

export async function POST(request: Request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const account = await createCelestiaAccount();

  return NextResponse.json({
    warning: 'Save this mnemonic securely now. The server does not persist it.',
    address: account.address,
    mnemonic: account.mnemonic,
    faucet_url: getMochaFaucetUrl(account.address),
  });
}
