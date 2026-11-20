import React, { useMemo, useState } from 'react';
import { Header, SectionHeader } from '../components';
import type { LoginHistoryEntry } from '../domain';
import { authService, exportService } from '../services';

type SortKey = 'loginTime' | 'signOutTime';

const LoginHistory: React.FC = () => {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'loginTime', asc: false });
  const log = useMemo(() => authService.getAccessLog(), []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = log.filter((e) => `${e.name} ${e.id} ${e.position} ${e.loginTime}`.toLowerCase().includes(q));
    const val = (e: LoginHistoryEntry) => e[sort.key] ?? '9999'; // active sessions sort as newest
    return [...filtered].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * (sort.asc ? 1 : -1));
  }, [log, query, sort]);

  const toggleSort = (key: SortKey) => setSort((s) => ({ key, asc: s.key === key ? !s.asc : false }));
  const arrow = (key: SortKey) => (sort.key === key ? (sort.asc ? '↑' : '↓') : '↕');

  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main className="p-4 sm:p-8 max-w-6xl mx-auto space-y-8">
        <SectionHeader
          title="Access Log"
          subtitle="Every sign-in and sign-out · admin only"
          actions={
            <>
              <input
                type="search"
                placeholder="Search name or ID"
                aria-label="Search access log"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full sm:w-60 px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-2xl outline-none focus:ring-4 focus:ring-red-500/10 focus:border-red-300 text-sm"
              />
              <button
                onClick={() => exportService.downloadAccessLog(rows)}
                className="px-5 py-2.5 rounded-2xl bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-black"
              >
                Export CSV
              </button>
            </>
          }
        />

        <div className="bg-white border border-zinc-100 rounded-[24px] overflow-x-auto shadow-lg shadow-zinc-100/50">
          <table className="w-full text-left min-w-[680px]">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-100 text-zinc-500 mono text-[10px] uppercase tracking-[0.15em]">
                <th className="px-6 py-4">Staff</th>
                <th className="px-6 py-4">Employee ID</th>
                <th className="px-6 py-4">Position</th>
                <th className="px-6 py-4">
                  <button onClick={() => toggleSort('loginTime')} className="uppercase hover:text-red-600">
                    Signed in {arrow('loginTime')}
                  </button>
                </th>
                <th className="px-6 py-4">
                  <button onClick={() => toggleSort('signOutTime')} className="uppercase hover:text-red-600">
                    Signed out {arrow('signOutTime')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.length ? (
                rows.map((e, i) => (
                  <tr key={`${e.id}-${e.loginTime}-${i}`} className="hover:bg-zinc-50/80">
                    <td className="px-6 py-4 text-sm font-bold text-gray-900">{e.name}</td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-black text-red-600 bg-red-50 px-3 py-1 rounded-lg border border-red-100 mono">{e.id}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{e.position}</td>
                    <td className="px-6 py-4 text-xs text-zinc-600 mono">{e.loginTime}</td>
                    <td className="px-6 py-4 text-xs mono">
                      {e.signOutTime ?? <span className="font-bold text-green-600">Still active</span>}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center text-sm text-zinc-400">
                    No entries match “{query}”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
};

export default LoginHistory;
