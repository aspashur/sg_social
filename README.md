# GSS Social Media Engagement Dashboard

Live dashboard for Ghana Statistical Service's social media engagement across
Facebook, Instagram, YouTube, LinkedIn, and X. Includes a "Connect Accounts"
panel that pulls real per-post and daily engagement data directly from
Facebook/Instagram/YouTube's APIs in the browser, plus manual entry for
LinkedIn/X (which don't allow direct browser API calls).

## Run locally

```bash
npm install
npm run dev
```

Opens at http://localhost:5173

## Deploy to GitHub Pages (automatic, recommended)

This project is pre-configured for **github.com/aspashur/sg_social**.

1. Make sure the repo exists (create it on GitHub if you haven't yet —
   it can be empty, no need to initialize with a README).
2. From this unzipped folder:

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/aspashur/sg_social.git
   git push -u origin main
   ```

   Git will prompt for GitHub credentials — use a Personal Access Token
   (not your password) if prompted. Create one at
   github.com/settings/tokens if you don't have one.

3. In the repo: **Settings → Pages → Build and deployment → Source**,
   select **GitHub Actions**.
4. The included workflow (`.github/workflows/deploy.yml`) runs automatically
   on this push, builds the app, and publishes it. Watch progress under the
   **Actions** tab.
5. Live URL once it finishes: **https://aspashur.github.io/sg_social/**

Every future `git push` to `main` redeploys automatically — that's your
"live deployer portal."

## Deploy manually instead (gh-pages branch)

```bash
npm install
npm run build
npm run deploy
```

This pushes the built `dist/` folder to a `gh-pages` branch using the
`gh-pages` package. Then set Pages source to the `gh-pages` branch instead
of GitHub Actions.

## Notes on live data

- **Facebook / Instagram / YouTube**: their APIs allow direct browser
  requests (CORS-enabled), so the in-app "Connect Accounts" panel can fetch
  real data with just an API key/access token — no backend required.
- **LinkedIn / X**: both block direct browser API calls. The dashboard
  provides a manual entry form for these; a fully automated connection would
  require a small backend/proxy to hold OAuth credentials.
- API keys/tokens entered in the app are kept in browser memory only (React
  state) — never persisted, committed, or sent anywhere but the platform's
  own API. Do not commit real credentials into this repo.

## Tech stack

Vite, React, Tailwind CSS, Recharts, PapaParse, lucide-react.
