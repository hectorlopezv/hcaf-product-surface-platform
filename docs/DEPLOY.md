# Deployment Guide

The PoC deploys as **one API service** (Docker → Railway) and **three static Vite apps** (Vercel). All steps are optional until you configure repository secrets.

## Prerequisites

- [Railway](https://railway.app) account (API)
- [Vercel](https://vercel.com) account (frontends)
- GitHub repository secrets (see below)

## Environment variables

Copy [.env.example](../.env.example) for local development. For production, set:

### API (Railway)

| Variable | Example |
|----------|---------|
| `PORT` | `3001` (Railway sets automatically) |
| `CORS_ORIGIN` | `https://your-operator-console.vercel.app` |
| `OPERATOR_CONSOLE_URL` | Vercel URL for operator console |
| `CONFIG_TOOL_URL` | Vercel URL for config tool |
| `ANALYTICS_URL` | Vercel URL for analytics |

### Frontends (Vercel — per project)

| Variable | Example |
|----------|---------|
| `VITE_API_URL` | `https://your-api.up.railway.app` |
| `VITE_WS_URL` | `https://your-api.up.railway.app` |
| `VITE_OPERATOR_CONSOLE_URL` | operator console URL |
| `VITE_CONFIG_TOOL_URL` | config tool URL |
| `VITE_ANALYTICS_URL` | analytics URL |

## GitHub Actions secrets

| Secret | Used for |
|--------|----------|
| `RAILWAY_TOKEN` | API deploy via Railway CLI |
| `VERCEL_TOKEN` | Frontend deploy via Vercel CLI |
| `VERCEL_ORG_ID` | Vercel team/org scope |
| `VERCEL_OPERATOR_CONSOLE_PROJECT_ID` | Operator console project |
| `VERCEL_CONFIG_TOOL_PROJECT_ID` | Config tool project |
| `VERCEL_ANALYTICS_PROJECT_ID` | Analytics project |

If secrets are missing, the deploy workflow **skips** that step with a notice (CI still passes).

## Manual deploy

### API (Docker)

From repository root:

```bash
docker build -f apps/api/Dockerfile -t hcaf-api .
docker run -p 3001:3001 --env-file .env hcaf-api
```

### API (Railway CLI)

```bash
npm install -g @railway/cli
railway login
railway link
railway up --service hcaf-api
```

### Frontends (Vercel CLI)

```bash
cd apps/operator-console && npx vercel deploy --prod
cd apps/config-tool && npx vercel deploy --prod
cd apps/analytics && npx vercel deploy --prod
```

Each Vercel project should use the `vercel.json` in its app directory (monorepo-aware install/build commands).

## Automated deploy

On push to `main`, after a successful build:

1. `.github/workflows/deploy.yml` builds the monorepo
2. Deploys API to Railway when `RAILWAY_TOKEN` is set
3. Deploys each frontend to Vercel when `VERCEL_TOKEN` and project IDs are set

See workflow file for exact commands.
