'use client';

import { FormEvent, useMemo, useState } from 'react';

type AdminStatusResponse = {
  ok: boolean;
  ttl_hours: number;
  cleanup: { requested: boolean; deleted: number };
  stats: { total: number; byStatus: Record<string, number> };
  filters: {
    election_id?: string;
    status?: string;
    updated_from?: string;
    updated_to?: string;
    limit: number;
    offset: number;
  };
  requests: Array<{
    requestId: string;
    electionId: string;
    status: string;
    updatedAt: string;
    createdAt: string;
    verified?: boolean;
    error?: string;
  }>;
  error?: string;
};

const STATUS_OPTIONS = ['', 'created', 'request_received', 'generating_proof', 'completed', 'rejected', 'error'];

export default function ZkpassportAdminPage() {
  const [apiKey, setApiKey] = useState('');
  const [electionId, setElectionId] = useState('');
  const [status, setStatus] = useState('');
  const [updatedFrom, setUpdatedFrom] = useState('');
  const [updatedTo, setUpdatedTo] = useState('');
  const [limit, setLimit] = useState('25');
  const [offset, setOffset] = useState('0');
  const [loading, setLoading] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdminStatusResponse | null>(null);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (electionId.trim()) p.set('election_id', electionId.trim());
    if (status) p.set('status', status);
    if (updatedFrom) p.set('updated_from', new Date(updatedFrom).toISOString());
    if (updatedTo) p.set('updated_to', new Date(updatedTo).toISOString());
    p.set('limit', limit || '25');
    p.set('offset', offset || '0');
    return p.toString();
  }, [electionId, status, updatedFrom, updatedTo, limit, offset]);

  async function fetchStatus(runCleanup = false) {
    if (!apiKey.trim()) {
      setError('Admin API key is required');
      return;
    }

    setError(null);
    if (runCleanup) {
      setCleanupLoading(true);
    } else {
      setLoading(true);
    }

    try {
      const qs = new URLSearchParams(queryString);
      if (runCleanup) qs.set('cleanup', 'true');

      const res = await fetch(`/api/zkpassport/admin/status?${qs.toString()}`, {
        headers: {
          'x-admin-api-key': apiKey.trim(),
        },
      });
      const json = (await res.json()) as AdminStatusResponse;

      if (!res.ok) {
        throw new Error(json.error ?? `Request failed (${res.status})`);
      }

      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin status');
    } finally {
      setLoading(false);
      setCleanupLoading(false);
    }
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    await fetchStatus(false);
  }

  const card = 'border border-gray-800 rounded-lg p-4 bg-gray-900';
  const input =
    'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">ZKPassport Admin</h1>
        <p className="text-sm text-gray-400 mt-1">Inspect request lifecycle, filter records, and run cleanup.</p>
      </div>

      <form onSubmit={onSubmit} className={`${card} space-y-4`}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-400 mb-1">Admin API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className={input}
              placeholder="x-admin-api-key"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Election ID</label>
            <input value={electionId} onChange={(e) => setElectionId(e.target.value)} className={input} />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={input}>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt || 'Any'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Updated From</label>
            <input type="datetime-local" value={updatedFrom} onChange={(e) => setUpdatedFrom(e.target.value)} className={input} />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Updated To</label>
            <input type="datetime-local" value={updatedTo} onChange={(e) => setUpdatedTo(e.target.value)} className={input} />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Limit</label>
            <input value={limit} onChange={(e) => setLimit(e.target.value)} className={input} />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Offset</label>
            <input value={offset} onChange={(e) => setOffset(e.target.value)} className={input} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={loading || cleanupLoading}
            className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 text-white text-sm font-medium px-4 py-2 rounded"
          >
            {loading ? 'Loading...' : 'Load Status'}
          </button>

          <button
            type="button"
            onClick={() => fetchStatus(true)}
            disabled={loading || cleanupLoading}
            className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700/60 text-white text-sm font-medium px-4 py-2 rounded"
          >
            {cleanupLoading ? 'Running cleanup...' : 'Run Cleanup + Refresh'}
          </button>
        </div>
      </form>

      {error && <div className="text-red-300 text-sm border border-red-500/40 bg-red-500/10 rounded-lg p-3">{error}</div>}

      {data && (
        <>
          <section className={card}>
            <h2 className="text-sm font-semibold text-gray-200 mb-2">Overview</h2>
            <p className="text-sm text-gray-300">Total requests: {data.stats.total}</p>
            <p className="text-sm text-gray-300">TTL: {data.ttl_hours} hours</p>
            <p className="text-sm text-gray-300">
              Cleanup deleted: {data.cleanup.deleted} {data.cleanup.requested ? '(this run)' : ''}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(data.stats.byStatus).map(([k, v]) => (
                <span key={k} className="text-xs bg-gray-800 border border-gray-700 px-2 py-1 rounded text-gray-200">
                  {k}: {v}
                </span>
              ))}
            </div>
          </section>

          <section className={card}>
            <h2 className="text-sm font-semibold text-gray-200 mb-3">Requests</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs text-left text-gray-300">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400">
                    <th className="py-2 pr-3">Request ID</th>
                    <th className="py-2 pr-3">Election</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Verified</th>
                    <th className="py-2 pr-3">Updated</th>
                    <th className="py-2 pr-3">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {data.requests.map((r) => (
                    <tr key={r.requestId} className="border-b border-gray-800 align-top">
                      <td className="py-2 pr-3 font-mono break-all">{r.requestId}</td>
                      <td className="py-2 pr-3 font-mono break-all">{r.electionId}</td>
                      <td className="py-2 pr-3">{r.status}</td>
                      <td className="py-2 pr-3">{typeof r.verified === 'boolean' ? String(r.verified) : '-'}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{new Date(r.updatedAt).toLocaleString()}</td>
                      <td className="py-2 pr-3 text-red-300 break-all">{r.error || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
