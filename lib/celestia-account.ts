import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';

export type CelestiaAccount = {
  mnemonic: string;
  address: string;
};

export async function createCelestiaAccount(): Promise<CelestiaAccount> {
  const wallet = await DirectSecp256k1HdWallet.generate(24, { prefix: 'celestia' });
  const [account] = await wallet.getAccounts();
  const mnemonic = wallet.mnemonic;

  return {
    mnemonic,
    address: account.address,
  };
}

export async function getCelestiaAddressFromMnemonic(mnemonic: string): Promise<string> {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: 'celestia' });
  const [account] = await wallet.getAccounts();
  return account.address;
}

export async function getMochaAddressBalance(address: string): Promise<{
  currency: string;
  spendable: string;
  delegated: string;
  unbonding: string;
}> {
  const res = await fetch(`https://api-mocha.celenium.io/v1/address/${encodeURIComponent(address)}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Balance lookup failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as {
    balance?: { currency?: string; spendable?: string; delegated?: string; unbonding?: string };
  };

  if (!json.balance?.currency) {
    throw new Error('Balance payload missing');
  }

  return {
    currency: json.balance.currency,
    spendable: json.balance.spendable ?? '0',
    delegated: json.balance.delegated ?? '0',
    unbonding: json.balance.unbonding ?? '0',
  };
}

export function getMochaFaucetUrl(address: string): string {
  return `https://mocha.celenium.io/faucet?address=${encodeURIComponent(address)}`;
}
