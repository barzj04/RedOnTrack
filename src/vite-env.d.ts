/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL of a server-side proxy that holds the Gemini key (recommended). */
  readonly VITE_AI_PROXY_URL?: string;
  /** Gemini key used directly from the browser. Local development only. */
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_GEMINI_MODEL?: string;
  /** 'memory' for embedded hosts that own the URL; defaults to hash routing. */
  readonly VITE_ROUTER?: 'hash' | 'memory';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
