'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { encryptVote } from '@/lib/crypto';
import type {
  CastVoteRequest,
  CastVoteResponse,
  ElectionResponse,
} from '@/lib/types';

function isVotingOpen(start: string, end: string): boolean {
  const now = Date.now();
  return now >= new Date(start).getTime() && now <= new Date(end).getTime();
}

export default function VotePage() {
  const params = useParams<{ id: string }>();
  const electionId = params.id;

  const [election, setElection] = useState<ElectionResponse | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState('');
  const [proof, setProof] = useState({ proof: '', vkey_hash: '', version: '' });
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CastVoteResponse | null>(null);
  const [requestingProof, setRequestingProof] = useState(false);
  const [verificationUrl, setVerificationUrl] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [requestStatus, setRequestStatus] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch(`/api/election/${electionId}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(json.error ?? 'Failed to load election');
        }
        return res.json() as Promise<ElectionResponse>;
      })
      .then((data) => {
        setElection(data);
        const first = (data.config?.candidates ?? data.db_data.candidates)[0] ?? '';
        setSelectedCandidate(first);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load election');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [electionId]);

  const candidates = useMemo(
    () => election?.config?.candidates ?? election?.db_data.candidates ?? [],
    [election],
  );
  const encryptionPubkey = election?.config?.encryption_pubkey ?? election?.db_data.encryption_pubkey ?? null;
  const votingOpen = election
    ? isVotingOpen(election.db_data.voting_start, election.db_data.voting_end)
    : false;

  async function startZkpassportRequest() {
    setError(null);
    setRequestingProof(true);
    try {
      const res = await fetch(`/api/zkpassport/request/${electionId}`);
      const json = (await res.json()) as {
        error?: string;
        verification_url?: string;
        request_id?: string;
      };
      if (!res.ok || !json.verification_url || !json.request_id) {
        throw new Error(json.error ?? 'Failed to create verification request');
      }
      setVerificationUrl(json.verification_url);
      setRequestId(json.request_id);
      setRequestStatus('created');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create verification request');
    } finally {
      setRequestingProof(false);
    }
  }

  useEffect(() => {
    if (!requestId) return;

    let cancelled = false;
    const terminal = new Set(['completed', 'rejected', 'error']);

    const tick = async () => {
      try {
        const res = await fetch(`/api/zkpassport/status/${requestId}`, { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as {
          status?: string;
          error?: string;
          proof?: { proof?: string; vkey_hash?: string; version?: string };
        };
        if (cancelled) return;

        if (json.status) setRequestStatus(json.status);

        if (json.proof?.proof && json.proof?.vkey_hash && json.proof?.version) {
          setProof({
            proof: json.proof.proof,
            vkey_hash: json.proof.vkey_hash,
            version: json.proof.version,
          });
        }

        if (json.status === 'error' && json.error) {
          setError(json.error);
        }

        if (json.status && terminal.has(json.status)) {
          return;
        }

        setTimeout(tick, 2000);
      } catch {
        if (!cancelled) setTimeout(tick, 3000);
      }
    };

    tick();
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!election) {
      setError('Election data not loaded');
      return;
    }
    if (!votingOpen) {
      setError('Voting is not currently open for this election');
      return;
    }
    if (!selectedCandidate) {
      setError('Select a candidate');
      return;
    }
    if (!encryptionPubkey) {
      setError('Election encryption key is unavailable');
      return;
    }
    if (!proof.proof || !proof.vkey_hash || !proof.version) {
      setError('ZKPassport proof, vkey hash, and version are required');
      return;
    }

    setSubmitting(true);
    try {
      const encryptedVote = await encryptVote(selectedCandidate, encryptionPubkey);
      const body: CastVoteRequest = {
        election_id: election.election_id,
        encrypted_vote: encryptedVote,
        zkpassport_proof: proof,
      };

      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as CastVoteResponse | { error?: string };

      if (!res.ok) {
        setError(('error' in json && json.error) || 'Vote submission failed');
        return;
      }

      setSuccess(json as CastVoteResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vote submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500';
  const labelClass = 'block text-xs font-medium text-gray-400 mb-1';

  if (loading) {
    return <p className="text-gray-400 text-sm">Loading election...</p>;
  }

  if (error && !election) {
    return (
      <div className="space-y-3">
        <Link href={`/election/${electionId}`} className="text-purple-400 hover:text-purple-300 text-sm">
          &larr; Back to Election
        </Link>
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href={`/election/${electionId}`} className="text-purple-400 hover:text-purple-300 text-sm">
          &larr; Back to Election
        </Link>
        <h1 className="text-2xl font-bold text-white mt-2">Cast Vote</h1>
        <p className="text-gray-400 text-sm mt-1">
          Your vote choice is encrypted client-side. Nullifier is derived server-side from your proof scope.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 border border-gray-800 rounded-lg p-5 bg-gray-900">
        <div className="border border-gray-700 rounded-lg p-3 bg-gray-800/50 space-y-2">
          <p className="text-xs text-gray-300">
            Step 1: Start a ZKPassport verification request (scope = this election).
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={startZkpassportRequest}
              disabled={requestingProof}
              className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700/50 text-white text-xs font-medium px-3 py-1.5 rounded"
            >
              {requestingProof ? 'Creating request...' : 'Create ZKPassport Request'}
            </button>
            {verificationUrl && (
              <a
                href={verificationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-purple-300 underline"
              >
                Open verification link
              </a>
            )}
          </div>
          {requestId && <p className="text-[11px] text-gray-400">Request ID: {requestId}</p>}
          {requestStatus && (
            <p className="text-[11px] text-gray-400">
              Status: {requestStatus}
              {requestStatus === 'completed' ? ' (proof synced)' : ''}
            </p>
          )}
        </div>

        <div>
          <label className={labelClass}>Candidate</label>
          <div className="space-y-2">
            {candidates.map((candidate) => (
              <label key={candidate} className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
                <input
                  type="radio"
                  name="candidate"
                  value={candidate}
                  checked={selectedCandidate === candidate}
                  onChange={(ev) => setSelectedCandidate(ev.target.value)}
                  className="accent-purple-500"
                />
                {candidate}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Proof (auto-fills after verification)</label>
            <input
              className={inputClass}
              value={proof.proof}
              onChange={(ev) => setProof((p) => ({ ...p, proof: ev.target.value }))}
              placeholder="mock:alice (when MOCK_ZKPASSPORT=true)"
              required
            />
          </div>
          <div>
            <label className={labelClass}>VKey Hash</label>
            <input
              className={inputClass}
              value={proof.vkey_hash}
              onChange={(ev) => setProof((p) => ({ ...p, vkey_hash: ev.target.value }))}
              required
            />
          </div>
          <div>
            <label className={labelClass}>Version</label>
            <input
              className={inputClass}
              value={proof.version}
              onChange={(ev) => setProof((p) => ({ ...p, version: ev.target.value }))}
              required
            />
          </div>
        </div>

        {!votingOpen && (
          <div className="text-yellow-300 text-sm bg-yellow-400/10 border border-yellow-400/30 rounded-lg px-3 py-2">
            Voting is not currently open for this election.
          </div>
        )}

        {error && (
          <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {success && (
          <div className="text-green-300 text-sm bg-green-400/10 border border-green-400/30 rounded-lg px-3 py-2 space-y-1">
            <p>Vote posted successfully.</p>
            <p>Celestia height: {success.celestia_height}</p>
            <p className="break-all">Commitment: {success.blob_commitment}</p>
            <p className="break-all">Receipt ID: {success.receipt.receipt_id}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !votingOpen}
          className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
        >
          {submitting ? 'Encrypting + posting vote...' : 'Encrypt & Submit Vote'}
        </button>
      </form>
    </div>
  );
}
