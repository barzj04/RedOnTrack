/**
 * Incident analysis service.
 *
 * Picks the safest available engine:
 *   1. VITE_AI_PROXY_URL  -> server-side proxy holding the Gemini key (recommended)
 *   2. VITE_GEMINI_API_KEY -> Gemini called from the browser (local dev only)
 *   3. neither            -> built-in rule-based analyser (works offline)
 * If Gemini fails (quota, network), it falls back to the rule-based analyser
 * and says so, so a demo never dead-ends on an error.
 */

import type { AnalysisMode, AnalysisReport, FootageFolder, Severity } from '../domain';

const env = import.meta.env;
const PROXY_URL = env.VITE_AI_PROXY_URL?.trim() || '';
const API_KEY = env.VITE_GEMINI_API_KEY?.trim() || '';
const MODEL = env.VITE_GEMINI_MODEL?.trim() || 'gemini-2.5-flash';

export function activeMode(): AnalysisMode {
  if (PROXY_URL) return 'gemini-proxy';
  if (API_KEY) return 'gemini-direct';
  return 'offline-rules';
}

export const MODE_LABELS: Record<AnalysisMode, string> = {
  'gemini-proxy': 'Gemini (server proxy)',
  'gemini-direct': 'Gemini (direct, dev only)',
  'offline-rules': 'Offline rule-based analyser',
};

export function buildPrompt(f: FootageFolder): string {
  return `Act as a railway station safety investigator. Analyse this incident using only the metadata given.

Incident metadata:
- Platform: ${f.platform}
- Time: ${f.time} (${f.day}, ${f.date})
- Staff remarks: "${f.remarks}"
- Camera angles available: ${f.cameras.join(', ')}

Reply in plain text with these four headed sections:
1. ANOMALY DETECTION - likely technical or human factors
2. RISK ASSESSMENT - severity (Low/Medium/High) and impact on operations
3. PREVENTATIVE MEASURES - 3 to 5 specific, practical actions
4. FORENSIC SUMMARY - two or three sentences for the station log

Be concise and professional. Do not invent facts that are not in the metadata.`;
}

// ---------------------------------------------------------------------------
// Rule-based analyser
// ---------------------------------------------------------------------------

interface Rule {
  category: string;
  keywords: RegExp;
  severity: Severity;
  factors: string[];
  measures: string[];
}

const RULES: Rule[] = [
  {
    category: 'Track intrusion / trespass',
    keywords: /\b(?:trespass|track access|unauthori[sz]ed|on the track|climb)/i,
    severity: 'high',
    factors: ['Person entered the track area, risk of being struck by a train or electrocuted', 'Platform ends and track access points may not be physically secured'],
    measures: ['Install or extend platform-end barriers and "No Entry" gates', 'Add intrusion detection (beam break or video analytics) on platform ends, linked to the control room', 'Increase patrols at platform ends during low-staff hours', 'Set a protocol to alert train control to slow or hold trains when an intrusion is detected'],
  },
  {
    category: 'Passenger at platform edge',
    keywords: /\b(?:edge|yellow line|intoxicated|drunk|fell onto|lean)/i,
    severity: 'high',
    factors: ['Passenger crossed the platform safety line, risk of falling or being hit by an arriving train', 'Impaired passenger behaviour reduces awareness of hazards'],
    measures: ['Trigger an automatic PA warning when someone stays past the yellow line', 'Train staff on handling vulnerable or intoxicated passengers', 'Consider half-height platform screen doors on high-risk platforms', 'Keep a security post within sight of the platform edge at night'],
  },
  {
    category: 'Unattended or suspicious item',
    keywords: /\b(?:unattended|luggage|bag|parcel|suspicious|package)/i,
    severity: 'high',
    factors: ['Unidentified item could be a security threat and forces an area evacuation', 'Detection depended on manual observation'],
    measures: ['Use object-left-behind detection on CCTV to flag items after a set time', 'Run regular PA reminders to keep belongings close', 'Review and drill the cordon-and-clear procedure to shorten response time', 'Record time from first sighting to all-clear as a KPI'],
  },
  {
    category: 'Crowding and congestion',
    keywords: /\b(?:congest|crowd|collision|push|stampede|overcrowd)/i,
    severity: 'medium',
    factors: ['Passenger density exceeded safe levels at a pinch point', 'Peak-hour flow is not being actively managed'],
    measures: ['Use crowd-density alerts from CCTV to send staff before it gets critical', 'Mark one-way flow lanes on stairs during peak hours', 'Coordinate with operations to add trains or longer dwell time at peak', 'Deploy platform marshals at known pinch points'],
  },
  {
    category: 'Slip, trip or fall',
    keywords: /\b(?:slip|trip|fell|fall|wet|escalator|stairs)/i,
    severity: 'medium',
    factors: ['Floor condition (wet or uneven) is the likely main cause', 'Escalators and stairs increase the chance of injury'],
    measures: ['Place wet-floor signs during and after cleaning, and clean outside peak hours', 'Fit anti-slip strips on stairs and escalator landings', 'Schedule escalator inspections and log faults', 'Keep a first-aid kit and trained staff near escalators'],
  },
  {
    category: 'Equipment or technical fault',
    keywords: /\b(?:fault|door|signal|power|failure|malfunction|broken|technical)/i,
    severity: 'medium',
    factors: ['Equipment failure, possibly overdue maintenance', 'Fault may leave passengers exposed to the track or delay services'],
    measures: ['Log the fault with asset ID and time in the maintenance system', 'Move the asset to condition-based (predictive) maintenance using sensor data', 'Keep staff at the affected door or area until repaired', 'Review fault history to spot repeat failures'],
  },
];

const GENERIC_RULE: Rule = {
  category: 'General safety incident',
  keywords: /.*/,
  severity: 'low',
  factors: ['Not enough detail in the remarks to identify a clear cause'],
  measures: ['Add more detail to the incident remarks (who, what, sequence of events)', 'Review the footage from all listed cameras', 'Check whether similar incidents happened at the same place or time'],
};

const SEVERITY_SCORE: Record<Severity, number> = { low: 3, medium: 6, high: 8 };

export function analyseOffline(f: FootageFolder, now: Date = new Date()): AnalysisReport {
  const rule = RULES.find((r) => r.keywords.test(f.remarks)) ?? GENERIC_RULE;
  const hour = Number(f.time.split(':')[0]);
  const isNight = hour >= 22 || hour < 6;
  const isPeak = (hour >= 7 && hour < 9) || (hour >= 17 && hour < 20);

  const factors = [...rule.factors];
  let score = SEVERITY_SCORE[rule.severity];
  if (isNight) {
    factors.push(`Happened at ${f.time}, a low-staffing period, so response may be slower`);
    score += 1;
  }
  if (isPeak) {
    factors.push(`Happened at ${f.time}, during peak hours, so more passengers were exposed`);
    score += 1;
  }
  score = Math.min(score, 10);
  const severity: Severity = score >= 8 ? 'high' : score >= 5 ? 'medium' : 'low';

  const cams =
    f.cameras.length > 1
      ? `${f.cameras.length} camera angles (${f.cameras.join(', ')}) are available; cross-check them to confirm the sequence of events.`
      : `Only one camera angle (${f.cameras[0]}) covers this event; check if more coverage is needed here.`;

  const text = [
    '1. ANOMALY DETECTION',
    `Category: ${rule.category}`,
    ...factors.map((x) => `- ${x}`),
    `- ${cams}`,
    '',
    '2. RISK ASSESSMENT',
    `Severity: ${severity.toUpperCase()} (risk score ${score}/10)`,
    `- Location: ${f.platform}, ${f.day} ${f.date} at ${f.time}`,
    `- ${severity === 'high' ? 'Immediate risk to life. Needs follow-up within 24 hours.' : severity === 'medium' ? 'Risk of injury or service disruption. Review within the week.' : 'Low immediate risk. Monitor for repeats.'}`,
    '',
    '3. PREVENTATIVE MEASURES',
    ...rule.measures.map((m, i) => `${i + 1}. ${m}`),
    '',
    '4. FORENSIC SUMMARY',
    `On ${f.day} ${f.date} at ${f.time}, a ${rule.category.toLowerCase()} incident was recorded at ${f.platform}. Staff remarks: "${f.remarks}" Rated ${severity} severity; footage from ${f.cameras.join(', ')} should be kept for the investigation record.`,
  ].join('\n');

  return {
    text,
    mode: 'offline-rules',
    generatedAt: now.toISOString(),
    severity,
    category: rule.category,
  };
}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

function friendlyError(status: number, body: string): string {
  if (status === 429 || /quota/i.test(body)) return 'Gemini quota exceeded';
  if (status === 400 && /API_KEY_INVALID|API key not valid/i.test(body)) return 'Gemini API key is invalid';
  if (status === 403) return 'Gemini access denied';
  return `Gemini request failed (HTTP ${status})`;
}

async function callProxy(prompt: string): Promise<string> {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(friendlyError(res.status, body));
  const data = JSON.parse(body) as { text?: string };
  if (!data.text) throw new Error('Empty response from AI proxy');
  return data.text;
}

async function callGeminiDirect(prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(friendlyError(res.status, body));
  const data = JSON.parse(body);
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('');
  if (!text) throw new Error('Gemini returned no text (possibly blocked by safety filters)');
  return text;
}

function severityFromText(text: string): Severity | undefined {
  const m = /severity[^a-z]*(low|medium|high)/i.exec(text);
  return m ? (m[1].toLowerCase() as Severity) : undefined;
}

export async function analyseIncident(f: FootageFolder): Promise<AnalysisReport> {
  const mode = activeMode();
  if (mode === 'offline-rules') return analyseOffline(f);

  try {
    const prompt = buildPrompt(f);
    const text = mode === 'gemini-proxy' ? await callProxy(prompt) : await callGeminiDirect(prompt);
    return { text, mode, generatedAt: new Date().toISOString(), severity: severityFromText(text) };
  } catch (err) {
    const fallback = analyseOffline(f);
    return { ...fallback, notice: `${(err as Error).message}. Showing the offline analysis instead.` };
  }
}
