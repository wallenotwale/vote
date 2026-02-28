import { createCelestiaAccount, getMochaFaucetUrl } from '../lib/celestia-account';

async function main() {
  const { address, mnemonic } = await createCelestiaAccount();
  console.log(JSON.stringify({
    warning: 'Save mnemonic securely now. This script prints it once.',
    address,
    mnemonic,
    faucet_url: getMochaFaucetUrl(address),
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
