import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyZkpassportProof } from '../lib/zkpassport';

test('verifyZkpassportProof derives deterministic scoped nullifier in mock mode', async () => {
  process.env.MOCK_ZKPASSPORT = 'true';

  const one = await verifyZkpassportProof('election-1', {
    proof: 'mock:alice',
    vkey_hash: 'ignored-in-mock',
    version: 'mock-v1',
  });
  const two = await verifyZkpassportProof('election-1', {
    proof: 'mock:alice',
    vkey_hash: 'different',
    version: 'different',
  });

  assert.equal(one.ok, true);
  assert.equal(two.ok, true);
  if (one.ok && two.ok) {
    assert.equal(one.scopedNullifier, two.scopedNullifier);
  }
});

test('verifyZkpassportProof enforces mock proof format in mock mode', async () => {
  process.env.MOCK_ZKPASSPORT = 'true';

  const res = await verifyZkpassportProof('election-1', {
    proof: 'bad-format',
    vkey_hash: 'x',
    version: 'x',
  });

  assert.equal(res.ok, false);
});

test('verifyZkpassportProof requires full proof fields in non-mock mode', async () => {
  process.env.MOCK_ZKPASSPORT = 'false';

  const res = await verifyZkpassportProof('election-1', {
    proof: 'p',
    version: 'v',
  });

  assert.equal(res.ok, false);
});
