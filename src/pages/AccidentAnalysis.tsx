import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Header, IncidentWorkspace, SectionHeader, StatCard } from '../components';
import { useAccidentAnalytics, useIncidents } from '../hooks';
import { incidentService } from '../services';

const Toggle: React.FC<{ options: [string, string][]; value: string; onChange: (v: string) => void; accent?: boolean }> = ({
  options,
  value,
  onChange,
  accent = false,
}) => (
  <div className="flex bg-zinc-100 p-1 rounded-xl border border-zinc-200" role="group">
    {options.map(([v, label]) => (
      <button
        key={v}
        onClick={() => onChange(v)}
        aria-pressed={value === v}
        className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${
          value === v ? (accent ? 'bg-red-600 text-white shadow' : 'bg-white text-gray-900 shadow-sm') : 'text-zinc-500 hover:text-zinc-800'
        }`}
      >
        {label}
      </button>
    ))}
  </div>
);

const AccidentAnalysis: React.FC = () => {
  const a = useAccidentAnalytics();
  const { incidents, updateRemarks, toggleSave, setAnalysis } = useIncidents();

  const filtered = useMemo(
    () => incidentService.filterIncidents(incidents, a.selectedFilter, a.dimension),
    [incidents, a.selectedFilter, a.dimension],
  );
  const savedCount = incidents.filter((f) => f.saved).length;

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <main className="p-4 sm:p-8 max-w-6xl mx-auto space-y-10">
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          <StatCard
            label={`Total cases (${a.period === 'weekly' ? 'week' : 'month'})`}
            value={a.totalCases}
            trend={a.trend.percentage !== 'n/a' ? `${a.trend.percentage} vs prev.` : undefined}
            trendIsUp={a.trend.isUp}
          />
          <StatCard label="Peak time slot" value={a.peakSlot} />
          <StatCard label="Saved to archive" value={`${savedCount} / ${incidents.length}`} />
        </section>

        {/* Chart */}
        <section className="bg-white rounded-3xl p-5 sm:p-8 border border-zinc-100 shadow-md" aria-label="Incident chart">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-6 gap-4">
            <div>
              <h3 className="text-xl font-black text-gray-900 uppercase tracking-tighter italic">Incident trends</h3>
              <p className="text-[10px] text-zinc-400 mono uppercase tracking-widest">Click a bar to filter the incident list</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Toggle options={[['weekly', 'Weekly'], ['monthly', 'Monthly']]} value={a.period} onChange={(v) => a.setPeriod(v as 'weekly' | 'monthly')} />
              <Toggle accent options={[['day', 'By day'], ['time', 'By time']]} value={a.dimension} onChange={(v) => a.setDimension(v as 'day' | 'time')} />
            </div>
          </div>

          {a.period === 'weekly' && (
            <div className="flex items-center justify-center gap-4 mb-8 pb-6 border-b border-zinc-100">
              <button
                onClick={() => a.setWeekOffset(Math.min(a.maxWeekOffset, a.weekOffset + 1))}
                disabled={a.weekOffset === a.maxWeekOffset}
                aria-label="Previous week"
                className="p-2 rounded-xl border border-zinc-200 hover:border-red-600 hover:text-red-600 disabled:opacity-20"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-black text-zinc-400 mono uppercase tracking-[0.2em] mb-1">
                  {a.weekOffset === 0 ? 'This week' : `${a.weekOffset} week${a.weekOffset > 1 ? 's' : ''} ago`}
                </span>
                <span className="text-xs sm:text-sm font-black text-gray-900 mono px-4 sm:px-6 py-2 bg-zinc-50 rounded-full border border-zinc-100">
                  {a.dateRangeLabel}
                </span>
              </div>
              <button
                onClick={() => a.setWeekOffset(Math.max(0, a.weekOffset - 1))}
                disabled={a.weekOffset === 0}
                aria-label="Next week"
                className="p-2 rounded-xl border border-zinc-200 hover:border-red-600 hover:text-red-600 disabled:opacity-20"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}

          <div className="flex items-end justify-between h-[230px] gap-2 sm:gap-3 relative border-b border-zinc-200 pb-2 pt-8">
            {a.stats.map((stat) => {
              const pct = (stat.value / a.maxValue) * 100;
              const selected = a.selectedFilter === stat.label;
              const peak = stat.value === a.maxValue;
              return (
                <button
                  key={stat.label}
                  onClick={() => a.setSelectedFilter(selected ? null : stat.label)}
                  aria-pressed={selected}
                  aria-label={`${stat.label}: ${stat.value} cases`}
                  className="flex-1 h-full flex flex-col items-center justify-end gap-2 group"
                >
                  <span className={`text-[10px] font-black mono ${selected || peak ? 'text-red-600' : 'text-zinc-500'}`}>{stat.value}</span>
                  <span
                    className={`w-full max-w-[54px] rounded-t-lg transition-all duration-500 ${
                      selected ? 'bg-red-600' : peak ? 'bg-red-400' : 'bg-zinc-200 group-hover:bg-zinc-300'
                    }`}
                    style={{ height: `calc(${pct}% - 2.5rem)`, minHeight: 4 }}
                  />
                  <span className={`text-[10px] font-black uppercase mono ${selected ? 'text-red-600' : 'text-zinc-500'}`}>{stat.label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-[10px] text-zinc-400">
            Chart shows sample counts for demonstration. {a.dimension === 'time' ? 'Time slots are 4-hour blocks (e.g. 08-12 = 08:00 to 11:59).' : ''}
          </p>
        </section>

        {/* Incident list */}
        <section className="space-y-6">
          <SectionHeader
            title="Incident log"
            subtitle={a.selectedFilter ? `Filtered: ${a.selectedFilter} · ${filtered.length} of ${incidents.length}` : `${incidents.length} incidents, newest first`}
            actions={
              <>
                {a.selectedFilter && (
                  <button
                    onClick={() => a.setSelectedFilter(null)}
                    className="text-[10px] font-black text-red-600 bg-red-50 border border-red-100 px-4 py-2.5 rounded-2xl hover:bg-red-100"
                  >
                    Clear filter
                  </button>
                )}
                <Link
                  to="/archive"
                  className="px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-zinc-200 hover:border-red-600 hover:text-red-600"
                >
                  Saved archive →
                </Link>
              </>
            }
          />

          <IncidentWorkspace
            folders={filtered}
            updateRemarks={updateRemarks}
            toggleSave={toggleSave}
            setAnalysis={setAnalysis}
            empty={
              <div className="bg-zinc-50 border-2 border-dashed border-zinc-200 rounded-[32px] p-12 sm:p-20 text-center">
                <h4 className="text-xl font-black text-gray-900 uppercase italic tracking-tighter">No matching incidents</h4>
                <p className="text-xs text-zinc-500 mt-2">No logged incidents fall in “{a.selectedFilter}”.</p>
                <button
                  onClick={() => a.setSelectedFilter(null)}
                  className="mt-6 text-[11px] font-black text-red-600 underline underline-offset-4 uppercase tracking-widest"
                >
                  Clear filter
                </button>
              </div>
            }
          />
        </section>
      </main>
    </div>
  );
};

export default AccidentAnalysis;
