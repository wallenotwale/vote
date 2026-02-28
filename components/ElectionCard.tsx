import Link from 'next/link';

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

function statusBadge(start: string, end: string) {
  const now = Date.now();
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (now < s)
    return { label: 'Upcoming', cls: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30' };
  if (now <= e)
    return { label: 'Open', cls: 'text-green-400 bg-green-400/10 border-green-400/30' };
  return { label: 'Closed', cls: 'text-gray-400 bg-gray-400/10 border-gray-400/30' };
}

export default function ElectionCard({ election }: { election: ElectionSummary }) {
  const { label, cls } = statusBadge(election.voting_start, election.voting_end);

  return (
    <Link
      href={`/election/${election.election_id}`}
      className="block border border-gray-800 rounded-lg p-4 hover:border-gray-600 hover:bg-gray-900 transition-colors group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="font-medium text-gray-100 group-hover:text-white text-sm leading-snug">
          {election.title}
        </span>
        <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full border ${cls}`}>
          {label}
        </span>
      </div>
      <div className="text-xs text-gray-500 space-y-0.5">
        <p>{election.candidates.length} candidates</p>
        <p>Block {election.celestia_height} &middot; ns {election.namespace.slice(0, 12)}...</p>
      </div>
    </Link>
  );
}
