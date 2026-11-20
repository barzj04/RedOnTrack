/**
 * Vercel serverless function: POST /api/analyze  { prompt: string } -> { text: string }
 *
 * Keeps the Gemini key on the server. Set GEMINI_API_KEY (and optionally
 * GEMINI_MODEL) in the Vercel project settings, then build the front end with
 * VITE_AI_PROXY_URL=/api/analyze.
 */

interface Req {
  method?: string;
  body?: { prompt?: unknown };
}

interface Res {
  status(code: number): Res;
  json(body: unknown): void;
}

const MAX_PROMPT_CHARS = 4000;

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY is not set on the server' });

  const prompt = req.body?.prompt;
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_PROMPT_CHARS) {
    return res.status(400).json({ error: 'Invalid prompt' });
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    },
  );

  if (!upstream.ok) {
    return res.status(upstream.status).json({ error: `Gemini error ${upstream.status}` });
  }

  const data = await upstream.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
  return res.status(200).json({ text });
}
