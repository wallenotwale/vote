'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CreateElectionRequest, CreateElectionResponse } from '@/lib/types';

export default function CreateElectionForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [candidatesRaw, setCandidatesRaw] = useState('Alice\nBob\nCharlie');
  const [votingStart, setVotingStart] = useState('');
  const [votingEnd, setVotingEnd] = useState('');
  const [mockUserId, setMockUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const candidates = candidatesRaw
      .split('\n')
      .map((c) => c.trim())
      .filter(Boolean);

    if (candidates.length < 2) {
      setError('Enter at least 2 candidates (one per line)');
      return;
    }

    // For mock mode, require a mock user ID
    // In production, this would be replaced by actual ZKPassport verification
    if (!mockUserId.trim()) {
      setError('ZKPassport verification required. Enter your mock user ID for testing.');
      return;
    }

    setLoading(true);

    const body: CreateElectionRequest = {
      title,
      description,
      candidates,
      voting_start: new Date(votingStart).toISOString(),
      voting_end: new Date(votingEnd).toISOString(),
      zkpassport_proof: {
        proof: `mock:${mockUserId.trim()}`,
      },
    };

    try {
      const res = await fetch('/api/election', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? 'Unknown error');
        return;
      }

      const data = json as CreateElectionResponse;
      router.push(`/election/${data.election_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500';
  const labelClass = 'block text-xs font-medium text-gray-400 mb-1';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelClass}>Title *</label>
        <input
          className={inputClass}
          placeholder="Board of Directors 2026"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </div>

      <div>
        <label className={labelClass}>Description</label>
        <textarea
          className={`${inputClass} resize-y`}
          rows={2}
          placeholder="Optional description..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div>
        <label className={labelClass}>Candidates * (one per line)</label>
        <textarea
          className={`${inputClass} resize-y font-mono`}
          rows={4}
          value={candidatesRaw}
          onChange={(e) => setCandidatesRaw(e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Voting starts *</label>
          <input
            type="datetime-local"
            className={inputClass}
            value={votingStart}
            onChange={(e) => setVotingStart(e.target.value)}
            required
          />
        </div>
        <div>
          <label className={labelClass}>Voting ends *</label>
          <input
            type="datetime-local"
            className={inputClass}
            value={votingEnd}
            onChange={(e) => setVotingEnd(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3">
        <label className={`${labelClass} text-blue-400`}>
          ZKPassport Verification (Mock Mode) *
        </label>
        <p className="text-xs text-gray-500 mb-2">
          In production, this would trigger a ZKPassport verification flow.
          For testing, enter any unique identifier.
        </p>
        <input
          className={inputClass}
          placeholder="your-unique-id"
          value={mockUserId}
          onChange={(e) => setMockUserId(e.target.value)}
          required
        />
      </div>

      {error && (
        <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
      >
        {loading ? 'Posting to Celestia...' : 'Create Election'}
      </button>
    </form>
  );
}
