# Architecture

RedOnTrack is a single-page React app. Logic that does not need React lives in `services/` as plain TypeScript, so it can be unit-tested and later moved to a backend without touching the UI.

```text
pages ──> components ──> hooks ──> services ──> storage (localStorage)
                                       └──> Gemini (proxy or direct) / offline rules
```

## Layers

| Layer | Folder | Responsibility |
| --- | --- | --- |
| Pages | `src/pages` | One screen each. Compose components, hold page-only UI state. |
| Components | `src/components` | Reusable UI. `IncidentWorkspace` is shared by the Incidents and Archive pages. |
| Hooks | `src/hooks` | React state on top of services: `useAuth` (context, `ProtectedRoute`), `useIncidents`, `useAccidentAnalytics`. |
| Services | `src/services` | Pure logic: auth, incidents, analytics, AI, exports, storage, feed renderer. |
| Domain | `src/domain` | Shared types (`FootageFolder`, `AnalysisReport`, `UserSession`, `Permission`, ...). |

## Key flows

### Authentication and roles
`authService` hashes passwords (salted SHA-256 via Web Crypto), stores accounts, the current session and the access log, and counts failed attempts. Each role maps to a list of permissions:

| Permission | Admin | Operator | Viewer |
| --- | :-: | :-: | :-: |
| `incident:edit`, `incident:save`, `incident:export` | ✓ | ✓ | |
| `ai:run`, `footage:capture` | ✓ | ✓ | |
| `logs:view` | ✓ | | |

`ProtectedRoute` sends signed-out users to `/login` and blocks routes that need a permission the user lacks. Components call `can(permission)` to hide buttons.

### Incident analysis
`aiService.analyseIncident()` picks an engine:

1. `VITE_AI_PROXY_URL` set → POST the prompt to the proxy (`api/analyze.ts`), which holds the key.
2. `VITE_GEMINI_API_KEY` set → call Gemini from the browser (development only).
3. Neither → `analyseOffline()`, a rule-based analyser.

The offline analyser matches the remarks against six incident categories (trespass, platform edge, unattended item, crowding, slip/fall, equipment fault), adjusts the risk score for night-time and peak hours, and returns the same four sections as the Gemini prompt. If Gemini fails, the offline result is returned with a notice. Reports are stored on the incident (`FootageFolder.analysis`) so they persist and appear in exports.

### Camera feeds
`CCTVFeed` shows either a `<video>` (when the camera has a `videoUrl`) or `SimulatedFeed`, which draws a procedurally generated platform scene on a canvas with `feedRenderer.ts`. Both expose the same handle (`snapshot`, `startRecording`, `stopRecording`), so full-screen capture works with either source. The simulated feed runs at 15 fps and pauses when off-screen or when the tab is hidden.

### Storage
`storageService` wraps localStorage in try/catch with an in-memory fallback, so the app still works when storage is blocked. All keys are versioned (`rot_*_v1`).

## Testing

`src/__tests__` covers the services: time-slot filtering, seed data, analytics maths, the offline analyser's categories and severity, authentication (login, lockout, sign-up role, logout, permissions, no plain-text passwords) and exports. Run `npm test`.

## Moving to production

| Concern | Replace | With |
| --- | --- | --- |
| Accounts and sessions | `authService` | Firebase Auth / Supabase Auth / Keycloak |
| Incidents, access log | `storageService` calls in `incidentService` and `authService` | A database API (Supabase, Firestore, PostgreSQL) |
| Camera feeds | `SimulatedFeed` | HLS/WebRTC stream from the camera NVR in `CCTVFeed` |
| Analysis input | Text prompt | Prompt plus key video frames sent to a vision model through the proxy |
