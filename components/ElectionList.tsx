'use client';

import { useEffect, useState } from 'react';
import ElectionCard from './ElectionCard';

interface ElectionSummary {
  election_id: string;
  title: string;
  candidates: string[];
  voting_start: string;
  voting_end: string;
  namespace: string;
  celestia_height: number;
  created_at: string;
}

export default function ElectionList() {
  const [elections, setElections] = useState<ElectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/election')
      .then((r) => r.json())
      .then((data) => setElections(data as ElectionSummary[]))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-gray-500 text-sm">Loading elections...</p>;
  }
  if (error) {
    return <p className="text-red-400 text-sm">Error: {error}</p>;
  }
  if (elections.length === 0) {
    return (
      <p className="text-gray-500 text-sm border border-gray-800 rounded-lg p-4">
        No elections yet. Create one to get started.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {elections.map((e) => (
        <ElectionCard key={e.election_id} election={e} />
      ))}
    </div>
  );
}
