import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCastVoteRequest,
  parseCreateElectionRequest,
  validateElectionConfigBlob,
  validateVoteBlob,
} from '../lib/validation';

test('parseCreateElectionRequest accepts valid payload', () => {
  const res = parseCreateElectionRequest({
    title: 'Mayor Election',
    description: 'City-wide election',
    candidates: ['Alice', 'Bob'],
    voting_start: '2026-03-01T00:00:00Z',
    voting_end: '2026-03-02T00:00:00Z',
  });

  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.data.title, 'Mayor Election');
    assert.deepEqual(res.data.candidates, ['Alice', 'Bob']);
  }
});

test('parseCreateElectionRequest rejects extra fields', () => {
  const res = parseCreateElectionRequest({
    title: 'Mayor Election',
    candidates: ['Alice', 'Bob'],
    voting_start: '2026-03-01T00:00:00Z',
    voting_end: '2026-03-02T00:00:00Z',
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
