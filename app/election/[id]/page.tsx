import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { ElectionResponse } from '@/lib/types';

interface Props {
  params: { id: string };
}

async function fetchElection(id: string): Promise<ElectionResponse | null> {
  try {
    const url = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/election/${id}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json() as Promise<ElectionResponse>;
  } catch {
    return null;
  }
}

function electionStatus(start: string, end: string): { label: string; color: string } {
  const now = Date.now();
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (now < s) return { label: 'Upcoming', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30' };
  if (now <= e) return { label: 'Voting Open', color: 'text-green-400 bg-green-400/10 border-green-400/30' };
  return { label: 'Closed', color: 'text-gray-400 bg-gray-400/10 border-gray-400/30' };
}

export default async function ElectionPage({ params }: Props) {
  const election = await fetchElection(params.id);

  if (!election) notFound();

  const data = election.config ?? election.db_data;
  const candidates =
    election.config?.candidates ?? (election.db_data?.candidates ?? []);
  const status = electionStatus(
    election.db_data.voting_start,
    election.db_data.voting_end,
  );

  return (
    <div className="space-y-8 max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-purple-400 hover:text-purple-300 text-sm mb-2 inline-block">
            &larr; All Elections
          </Link>
          <h1 className="text-2xl font-bold text-white">{election.db_data.title}</h1>
          {election.config?.description && (
            <p className="text-gray-400 mt-1 text-sm">{election.config.description}</p>
          )}
        </div>
        <span
          className={`shrink-0 text-xs font-medium px-3 py-1 rounded-full border ${status.color}`}
        >
          {status.label}
        </span>
      </div>

      <div className="border border-gray-800 rounded-lg p-5 space-y-4 bg-gray-900">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Candidates</h2>
        <ul className="space-y-2">
          {candidates.map((c: string) => (
            <li key={c} className="flex items-center gap-3 text-gray-200">
              <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
              {c}
            </li>
          ))}
        </ul>
      </div>

      <div className="border border-gray-800 rounded-lg p-5 space-y-3 bg-gray-900 text-sm">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Timeline</h2>
        <div className="grid grid-cols-2 gap-2 text-gray-400">
          <span>Voting opens</span>
          <span className="text-gray-200">{new Date(election.db_data.voting_start).toLocaleString()}</span>
          <span>Voting closes</span>
          <span className="text-gray-200">{new Date(election.db_data.voting_end).toLocaleString()}</span>
          <span>Created</span>
          <span className="text-gray-200">{new Date(election.db_data.created_at).toLocaleString()}</span>
        </div>
      </div>

      <div className="border border-gray-800 rounded-lg p-5 space-y-3 bg-gray-900 text-sm">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Celestia DA</h2>
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-gray-400">
          <span>Namespace</span>
          <span className="text-gray-200 break-all font-mono text-xs">{election.namespace}</span>
          <span>Block height</span>
          <span className="text-gray-200">{election.celestia_height}</span>
          <span>Config on-chain</span>
          <span className={election.config ? 'text-green-400' : 'text-yellow-500'}>
            {election.config ? 'Verified' : 'Lumina node offline (showing DB data)'}
          </span>
        </div>
      </div>

      <div className="border border-gray-800 rounded-lg p-5 bg-gray-900 flex flex-wrap gap-3 items-center">
        {status.label === 'Voting Open' && (
          <Link
            href={`/election/${params.id}/vote`}
            className="inline-block bg-purple-600 hover:bg-purple-500 text-white font-semibold px-5 py-2 rounded-lg transition-colors text-sm"
          >
            Vote Now
          </Link>
        )}
        <Link
          href={`/election/${params.id}/verify`}
          className="inline-block border border-gray-700 hover:border-gray-600 text-gray-200 px-5 py-2 rounded-lg transition-colors text-sm"
        >
          Open Verify Dashboard
        </Link>
      </div>
    </div>
  );
}
