# Deployment

The build is a static site (`npm run build` → `dist/`). It uses hash routing (`/#/analysis`), so any static host works without rewrite rules.

## GitHub Pages (automatic, free)

The repo includes `.github/workflows/deploy.yml`.

1. Push the code to the `main` branch on GitHub.
2. Open the repo's **Settings > Pages** and set **Source** to **GitHub Actions**.
3. The workflow runs the tests, builds the site and publishes it at `https://<username>.github.io/<repo>/`. Every later push to `main` redeploys.

The analysis uses the offline engine on Pages, since Pages has no server for the Gemini proxy.

## Vercel (recommended, includes the AI proxy)

1. Push the repo to GitHub.
2. In Vercel, **Add New → Project** and import the repo. Vercel detects Vite automatically (build `npm run build`, output `dist`).
3. Optional, for Gemini analysis: in **Settings → Environment Variables** add
   - `GEMINI_API_KEY` = your key from Google AI Studio (server only)
   - `VITE_AI_PROXY_URL` = `/api/analyze`
4. Deploy. `api/analyze.ts` is deployed as a serverless function, so the key never reaches the browser.

## Netlify / GitHub Pages / any static host

Run `npm run build` and upload `dist/`. On these hosts the app uses the offline analyser unless you deploy your own proxy and set `VITE_AI_PROXY_URL` to its URL before building.

For GitHub Pages:

```bash
npm run build
npx gh-pages -d dist
```

## Single-file build for embedded hosts

`npm run build:artifact` writes `dist-artifact/` with the logo inlined and in-memory routing (for hosts such as a claude.ai artifact that control the page URL). The published demo was made from this build with the CSS and JS inlined into one HTML page.

## Never do this

Do not set `VITE_GEMINI_API_KEY` on a public deployment. Anything starting with `VITE_` is bundled into the JavaScript and anyone can read it.
