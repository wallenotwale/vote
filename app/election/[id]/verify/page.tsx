import Link from 'next/link';

interface Props {
  params: { id: string };
  searchParams: { nullifier?: string };
}

async function fetchVerify(id: string, nullifier?: string) {
  const q = nullifier ? `?nullifier=${encodeURIComponent(nullifier)}` : '';
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/verify/${id}${q}`,
    { cache: 'no-store' },
  );
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error ?? 'Failed to load verification data');
  }
  return res.json() as Promise<{
    election_id: string;
    namespace: string;
    vote_blob_count: number;
    unique_nullifier_count: number;
    tally_blob_count: number;
    nullifier_checked: string | null;
    nullifier_included: boolean | null;
    scanned_height_start: number;
    scanned_height_end: number;
  }>;
}

export default async function VerifyPage({ params, searchParams }: Props) {
  let data: Awaited<ReturnType<typeof fetchVerify>> | null = null;
  let error: string | null = null;

  try {
    data = await fetchVerify(params.id, searchParams.nullifier);
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load verification data';
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href={`/election/${params.id}`} className="text-purple-400 hover:text-purple-300 text-sm">
          &larr; Back to Election
        </Link>
        <h1 className="text-2xl font-bold text-white mt-2">Verification Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">
          Verify vote data availability and inclusion for this election namespace.
        </p>
      </div>

      <form className="flex gap-2" action="" method="GET">
        <input
          type="text"
          name="nullifier"
          placeholder="Check nullifier inclusion (hex)"
          defaultValue={searchParams.nullifier ?? ''}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500"
        />
        <button
          type="submit"
          className="bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          Check
        </button>
      </form>

      {error && (
        <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {data && (
        <div className="border border-gray-800 rounded-lg p-5 bg-gray-900 text-sm space-y-2">
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-gray-400">
            <span>Namespace</span>
            <span className="text-gray-200 font-mono text-xs break-all">{data.namespace}</span>
            <span>Scan range</span>
            <span className="text-gray-200">{data.scanned_height_start} → {data.scanned_height_end}</span>
            <span>Vote blobs</span>
            <span className="text-gray-200">{data.vote_blob_count}</span>
            <span>Unique nullifiers</span>
            <span className="text-gray-200">{data.unique_nullifier_count}</span>
            <span>Tally blobs</span>
            <span className="text-gray-200">{data.tally_blob_count}</span>
            <span>Nullifier check</span>
            <span className={data.nullifier_included ? 'text-green-400' : 'text-yellow-400'}>
              {data.nullifier_checked
                ? data.nullifier_included
                  ? 'Included in scanned votes'
                  : 'Not found in scanned votes'
                : 'No nullifier checked'}
            </span>
          </div>
        </div>
      )}

      <div className="text-xs text-gray-500">
        This is scaffolding for full Lumina in-browser sampling UX; current view is server-side namespace scanning.
      </div>
    </div>
  );
}
