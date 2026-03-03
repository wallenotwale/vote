import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCastVoteRequest,
  parseCreateElectionRequest,
  validateElectionConfigBlob,
  validateVoteBlob,
} from '../lib/validation';
import { verifyCreatorZkpassport, verifyZkpassportProof } from '../lib/zkpassport';

test('parseCreateElectionRequest accepts valid payload', () => {
  const res = parseCreateElectionRequest({
    title: 'Mayor Election',
    description: 'City-wide election',
    candidates: ['Alice', 'Bob'],
    voting_start: '2026-03-01T00:00:00Z',
    voting_end: '2026-03-02T00:00:00Z',
    zkpassport_proof: {
      proof: 'mock:alice',
    },
  });

  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.data.title, 'Mayor Election');
    assert.deepEqual(res.data.candidates, ['Alice', 'Bob']);
    assert.deepEqual(res.data.zkpassport_proof, { proof: 'mock:alice' });
  }
});

test('parseCreateElectionRequest rejects extra fields', () => {
  const res = parseCreateElectionRequest({
    title: 'Mayor Election',
    candidates: ['Alice', 'Bob'],
    voting_start: '2026-03-01T00:00:00Z',
    voting_end: '2026-03-02T00:00:00Z',
    zkpassport_proof: { proof: 'mock:alice' },
    unexpected: true,
  });

  assert.equal(res.ok, false);
});

test('parseCastVoteRequest requires proof and validates payload', () => {
  const valid = parseCastVoteRequest({
    election_id: 'e1',
    encrypted_vote: Buffer.from('cipher').toString('base64'),
    zkpassport_proof: {
      proof: 'mock:alice',
      vkey_hash: 'mock-vkey',
      version: 'mock-v1',
    },
  });
  assert.equal(valid.ok, true);

  const invalid = parseCastVoteRequest({
    election_id: 'e1',
    nullifier: 'zzzz',
    encrypted_vote: 'not-base64$$$',
  });
  assert.equal(invalid.ok, false);
});

test('validateElectionConfigBlob rejects malformed config blob', () => {
  const malformed = {
    type: 'election_config',
    version: 1,
    election_id: 'e1',
    title: 't',
    description: 'd',
    candidates: ['only-one'],
    created_at: 'bad-date',
    voting_start: '2026-03-02T00:00:00Z',
    voting_end: '2026-03-01T00:00:00Z',
    creator_nullifier: 'abc123',
  };

  const res = validateElectionConfigBlob(malformed, 'e1');
  assert.equal(res.ok, false);
});

test('validateVoteBlob accepts valid vote blob', () => {
  const blob = {
    type: 'vote',
    election_id: 'e1',
    nullifier: 'a1b2c3d4e5f6a7b8',
    encrypted_vote: Buffer.from('cipher').toString('base64'),
    timestamp: '2026-03-01T00:00:00Z',
  };

  const res = validateVoteBlob(blob, 'e1');
  assert.equal(res.ok, true);
});

test('verifyCreatorZkpassport derives creator-scoped nullifier in mock mode', async () => {
  const originalMock = process.env.MOCK_ZKPASSPORT;
  process.env.MOCK_ZKPASSPORT = 'true';

  const res = await verifyCreatorZkpassport({ proof: 'mock:alice' });
  assert.equal(res.ok, true);
  if (res.ok) {
    // Same user should always get same creator nullifier (different from voting nullifier)
    const res2 = await verifyCreatorZkpassport({ proof: 'mock:alice' });
    assert.equal(res2.ok, true);
    if (res2.ok) {
      assert.equal(res.scopedNullifier, res2.scopedNullifier);
    }

    // Verify it's different from voting nullifier (different scope)
    const voteRes = await verifyZkpassportProof('election-1', { proof: 'mock:alice' });
    assert.equal(voteRes.ok, true);
    if (voteRes.ok) {
      assert.notEqual(res.scopedNullifier, voteRes.scopedNullifier);
    }
  }

  process.env.MOCK_ZKPASSPORT = originalMock;
});

test('verifyCreatorZkpassport requires proof', async () => {
  const res = await verifyCreatorZkpassport(undefined as any);
  assert.equal(res.ok, false);
});

test('parseCreateElectionRequest requires zkpassport_proof', () => {
  const res = parseCreateElectionRequest({
    title: 'Mayor Election',
    candidates: ['Alice', 'Bob'],
    voting_start: '2026-03-01T00:00:00Z',
    voting_end: '2026-03-02T00:00:00Z',
  });

  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.ok(res.error.includes('zkpassport_proof'));
  }
});
