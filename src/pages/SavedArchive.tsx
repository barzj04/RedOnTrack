import React from 'react';
import { Link } from 'react-router-dom';
import { Header, IncidentWorkspace, SectionHeader } from '../components';
import { useIncidents } from '../hooks';

const SavedArchive: React.FC = () => {
  const { incidents, updateRemarks, toggleSave, setAnalysis } = useIncidents();
  const saved = incidents.filter((f) => f.saved);

  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main className="p-4 sm:p-8 max-w-6xl mx-auto space-y-10">
        <SectionHeader
          title="Saved Archive"
          subtitle={`${saved.length} incident${saved.length === 1 ? '' : 's'} kept for investigation`}
          actions={
            <Link
              to="/analysis"
              className="px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-zinc-200 hover:border-red-600 hover:text-red-600"
            >
              ← All incidents
            </Link>
          }
        />

        <IncidentWorkspace
          folders={saved}
          updateRemarks={updateRemarks}
          toggleSave={toggleSave}
          setAnalysis={setAnalysis}
          empty={
            <div className="bg-zinc-50 border-2 border-dashed border-zinc-200 rounded-[32px] p-12 sm:p-20 text-center">
              <h4 className="text-xl font-black text-gray-900 uppercase italic tracking-tighter">Archive empty</h4>
              <p className="text-xs text-zinc-500 mt-2">No incidents have been saved yet.</p>
              <Link to="/analysis" className="inline-block mt-6 text-[11px] font-black text-red-600 underline underline-offset-4 uppercase tracking-widest">
                Go to incidents
              </Link>
            </div>
          }
        />
      </main>
    </div>
  );
};

export default SavedArchive;
