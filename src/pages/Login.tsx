import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { BRANDING } from '../constants';
import { useAuth } from '../hooks/useAuth';
import { authService } from '../services';

const inputClass =
  'w-full px-5 py-3.5 bg-zinc-50 border border-zinc-200 rounded-2xl outline-none focus:ring-4 focus:ring-red-500/10 focus:bg-white focus:border-red-300 transition-all text-sm font-medium';
const labelClass = 'text-[10px] font-black text-zinc-500 uppercase tracking-widest mono ml-2';

const Login: React.FC = () => {
  const { user, login, signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={from} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = mode === 'login' ? await login(employeeId, password) : await signup(name, employeeId, password);
    setBusy(false);
    if (result.ok) navigate(from, { replace: true });
    else setError(result.error);
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'signup' : 'login');
    setError(null);
    setPassword('');
  };

  const fillDemo = (id: string, pw: string) => {
    setMode('login');
    setEmployeeId(id);
    setPassword(pw);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-[0.04]" aria-hidden>
        <div className="absolute top-0 left-1/4 w-px h-full bg-black" />
        <div className="absolute top-0 left-2/4 w-px h-full bg-black" />
        <div className="absolute top-0 left-3/4 w-px h-full bg-black" />
        <div className="absolute top-1/4 left-0 w-full h-px bg-black" />
        <div className="absolute top-2/4 left-0 w-full h-px bg-black" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="flex flex-col items-center mb-8 text-center">
          <img src={BRANDING.logoUrl} alt="" className="w-20 h-20 object-contain mb-4" />
          <h1 className="text-4xl font-black tracking-tighter text-gray-900 uppercase italic">
            RedOn<span className="text-red-600">Track</span>
          </h1>
          <p className="text-[10px] font-bold tracking-[0.4em] text-zinc-400 uppercase mono mt-2">Station Authority Portal</p>
        </div>

        <div className="bg-white border border-zinc-100 rounded-[32px] shadow-2xl shadow-zinc-200/60 p-6 sm:p-10">
          <h2 className="text-xl font-black uppercase italic tracking-tighter text-gray-800 mb-6">
            {mode === 'login' ? 'Sign in' : 'Staff enrolment'}
          </h2>

          <form onSubmit={submit} className="space-y-4" noValidate>
            {mode === 'signup' && (
              <div className="space-y-1.5">
                <label htmlFor="name" className={labelClass}>
                  Full name
                </label>
                <input id="name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="employeeId" className={labelClass}>
                Employee ID
              </label>
              <input
                id="employeeId"
                inputMode="numeric"
                autoComplete="username"
                maxLength={8}
                required
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value.replace(/\D/g, ''))}
                className={`${inputClass} mono`}
                placeholder="8 digits"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className={labelClass}>
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                placeholder={mode === 'signup' ? 'At least 8 characters' : ''}
              />
            </div>

            {error && (
              <p role="alert" className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full mt-2 py-4 bg-red-600 text-white font-black uppercase text-sm rounded-2xl hover:bg-red-700 disabled:opacity-60 transition-colors shadow-lg shadow-red-600/20"
            >
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          {mode === 'signup' && (
            <p className="mt-4 text-[11px] text-zinc-500">New accounts start with the read-only Viewer role.</p>
          )}

          <div className="mt-6 text-center">
            <button onClick={switchMode} className="text-red-600 font-black uppercase text-xs hover:underline">
              {mode === 'login' ? 'New staff? Create an account' : 'Already registered? Sign in'}
            </button>
          </div>
        </div>

        {/* Demo accounts */}
        <div className="mt-6 bg-zinc-50 border border-zinc-200 rounded-2xl p-5">
          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mono mb-3">Demo accounts · tap to fill</p>
          <div className="grid gap-2">
            {authService.DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.id}
                onClick={() => fillDemo(a.id, a.password)}
                className="flex items-center justify-between gap-3 text-left bg-white border border-zinc-200 hover:border-red-300 rounded-xl px-4 py-2.5 transition-colors"
              >
                <span>
                  <span className="block text-xs font-bold text-gray-900">{authService.ROLE_LABELS[a.role]}</span>
                  <span className="block text-[10px] text-zinc-500">{a.name}</span>
                </span>
                <span className="text-[10px] mono text-zinc-600 text-right">
                  {a.id}
                  <br />
                  {a.password}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
