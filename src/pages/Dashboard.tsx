import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CCTVFeed, Header, NavButton, StatusBadge } from '../components';
import { BRANDING, CAMERA_FEEDS } from '../constants';
import { getCameraFeed } from '../services/cameraService';
import { useAuth, useCurrentTime } from '../hooks';
import { aiService, incidentService } from '../services';

const Dashboard: React.FC = () => {
  const { currentTime } = useCurrentTime();
  const { user, can } = useAuth();
  const [scrollY, setScrollY] = useState(0);
  const navigate = useNavigate();

  const summary = useMemo(() => {
    const incidents = incidentService.loadIncidents();
    return [
      { label: 'Cameras online', value: `${CAMERA_FEEDS.filter((c) => c.status !== 'offline').length}/${CAMERA_FEEDS.length}` },
      { label: 'Incidents logged', value: incidents.length },
      { label: 'Not yet analysed', value: incidents.filter((i) => !i.analysis).length },
      { label: 'Saved to archive', value: incidents.filter((i) => i.saved).length },
    ];
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Scroll animation calculations
  const START_TOP = 32;
  const END_TOP = 32;
  const SCROLL_RANGE = 300;

  const progress = Math.min(scrollY / SCROLL_RANGE, 1);
  const inverseProgress = 1 - progress;
  const floatingOpacity = progress > 0.9 ? Math.max(0, 1 - (progress - 0.9) * 10) : 1;

  const ArrowIcon = (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
  );

  return (
    <div className="min-h-[120vh] bg-white relative">
      <Header hideBranding={progress < 0.98} />

      {/* Floating Logo with Animation */}
      <div
        className="fixed z-[45] pointer-events-none"
        style={{
          top: `calc(${START_TOP}% - (${progress} * (${START_TOP}% - ${END_TOP}px)))`,
          left: `calc(50% - (${progress} * (50% - 130px)))`,
          transform: `translate(-50%, -50%) scale(${1 - progress * 0.75})`,
          opacity: floatingOpacity,
          transition: 'opacity 0.1s ease-out',
        }}
      >
        <div
          className={`flex ${progress > 0.7 ? 'flex-row' : 'flex-col'} items-center gap-6 transition-all duration-300`}
        >
          <div className="relative group">
            <div className="absolute -inset-4 bg-red-600/10 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition duration-1000"></div>
            <div className="relative">
              <div className="w-32 h-32 md:w-44 md:h-44 flex items-center justify-center p-4 rounded-[36px] bg-white border border-zinc-100 shadow-2xl shadow-red-900/10">
                <img
                  src={BRANDING.logoUrl}
                  alt="RedOnTrack Logo"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
          </div>

          <div className={`text-center transition-all ${progress > 0.7 ? 'text-left' : 'text-center'}`}>
            <h1 className="text-3xl md:text-5xl font-black tracking-tighter text-gray-900 uppercase italic leading-none">
              RedOn<span className="text-red-600">Track</span>
            </h1>
            <p
              className="text-[9px] sm:text-[10px] font-bold tracking-[0.2em] sm:tracking-[0.4em] whitespace-nowrap text-zinc-400 uppercase mono mt-2"
              style={{ opacity: inverseProgress }}
            >
              {BRANDING.tagline}
            </p>
          </div>
        </div>
      </div>

      <main className="w-full flex flex-col items-center px-4 space-y-12">
        <div className="h-[260px] md:h-[320px] w-full" />

        {/* Primary Feed */}
        <div className="w-full max-w-4xl px-0 sm:px-4 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="mb-4 flex items-center justify-between gap-4">
            <p className="text-sm text-zinc-500">
              Welcome back, <span className="font-bold text-gray-900">{user?.name}</span>
            </p>
            <StatusBadge text="All systems normal" variant="success" />
          </div>
          <CCTVFeed feed={getCameraFeed('CAM-02')} onClick={() => navigate('/monitoring')} />
          <p className="mt-3 text-center text-[10px] text-zinc-400 mono uppercase tracking-widest">
            Click the feed to open all cameras
          </p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 w-full max-w-4xl sm:px-4">
          {summary.map((s) => (
            <div key={s.label} className="bg-zinc-50 border border-zinc-100 rounded-2xl p-4 sm:p-5">
              <p className="text-[9px] font-black text-zinc-400 mono uppercase tracking-widest">{s.label}</p>
              <p className="text-2xl sm:text-3xl font-black tracking-tighter text-gray-900">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Navigation Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 w-full max-w-4xl sm:px-4">
          <NavButton href="/live" title="Live Detection" description="Run the model on any video or webcam" icon={ArrowIcon} />
          <NavButton href="/analysis" title="Incident Analysis" description="Trends, logs & AI analysis" icon={ArrowIcon} />
          <NavButton
            href="/catalog"
            title="Footage Catalog"
            description="Last 7 days of recordings"
            icon={ArrowIcon}
            className="hover:border-gray-900 hover:text-gray-900"
          />
        </div>

        {/* Status Bar */}
        <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-3 py-5 px-6 sm:px-12 rounded-3xl sm:rounded-full bg-zinc-50 border border-zinc-200 mono text-[10px] text-zinc-500 uppercase tracking-[0.15em] mb-12">
          {can('logs:view') && (
            <Link to="/history" className="flex items-center gap-2 hover:text-red-600 transition-colors">
              <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
              Access log
            </Link>
          )}
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-zinc-400" />
            Station: {BRANDING.station}
          </span>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-zinc-400" />
            AI: {aiService.MODE_LABELS[aiService.activeMode()]}
          </span>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            Demo data
          </span>
          <span className="font-bold text-gray-900">Local time {currentTime}</span>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
