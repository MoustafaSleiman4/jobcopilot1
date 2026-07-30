# JobCopilot

An AI job-search copilot for Saudi Arabia, the UAE, and the wider Gulf market — bilingual (Arabic/English, full RTL), resume builder/enhancer, job matching with one-click/smart apply, an application tracker, and an AI chatbot assistant. Subscription: Free / Pro at $9.99 per month or $99.90 per year.

See `jobcopilot-plan.md` (in the parent folder / project docs) for the full product and technical plan, including the payments and hosting strategy.

## Stack

- Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind CSS v4
- next-intl for `/en` and `/ar` routing with full RTL support
- Supabase (Postgres + Auth + Storage) — see `supabase/schema.sql`
- Billing: provider-agnostic layer (`lib/billing`), Lemon Squeezy primary, Stripe alternative
- AI: Claude API for resume enhancement and the chatbot (`app/api/chat`, `app/api/resume/enhance`)
- Jobs: live public Greenhouse job-board API + curated Gulf demo listings as fallback (`app/api/jobs/search`)

## Local development

```bash
npm install
cp .env.example .env.local   # fill in values as you connect real services
npm run dev
```

The app runs at http://localhost:3000 and redirects to `/en` or `/ar`. Everything renders and is clickable without any keys configured — auth, billing, and AI features fall back to clear "not configured yet" / demo states so you can see the whole product before wiring up real accounts.

## Connecting real services

### 1. Supabase (auth + database) — free

1. Create a project at https://supabase.com (free tier, no forced expiry).
2. Project Settings → API → copy the Project URL and anon public key into `.env.local` as `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. SQL Editor → paste and run `supabase/schema.sql`. This creates the tables and Row Level Security policies.
4. SQL Editor → paste and run `supabase/storage-setup.sql`. This creates the private `resumes` storage bucket and policies that resume uploads need — without it, uploading a resume fails.
5. Auth → Providers → enable email/password (and Google, if you want that login option).

### 2. Billing

Pick one (see the plan doc's payments section for why Lebanon in particular needs care here):

- **Lemon Squeezy** (default, `BILLING_PROVIDER=lemonsqueezy`): create a store, two variants ($9.99/mo and $99.90/yr), and fill in `LEMONSQUEEZY_*` in `.env.local`. Point the store's webhook at `/api/billing/webhook`.
- **Stripe** (`BILLING_PROVIDER=stripe`): create the two Prices, fill in `STRIPE_*`, point the webhook at the same URL.

Switching providers later is a one-line env change (`lib/billing/index.ts`) — no UI or route changes needed.

### 3. AI features

Set `ANTHROPIC_API_KEY` in `.env.local` to turn on real resume enhancement and the chatbot. Without it, both features return clearly-labeled demo responses so the UI is still fully demoable.

## Deploying online for free

**Recommended: Vercel (frontend + serverless API routes) + Supabase (already free from step 1 above).**

1. Push this repo to GitHub (or GitLab/Bitbucket).
2. Go to https://vercel.com, sign up free, "Import Project", select the repo. Vercel auto-detects Next.js — no config needed.
3. In the Vercel project's Environment Variables, paste in everything from your `.env.local`.
4. Deploy. You'll get a free `*.vercel.app` URL immediately; a custom domain can be attached later for free (you just need to own the domain).

This combination has no forced 30-day resets and no "sleeps after 15 minutes" cold starts, unlike the free tiers of Render/Railway (see the plan doc's hosting section for the comparison). If you'd rather I do this deployment directly, connect a GitHub account/repo and a Vercel API token and let me know — I can run the deploy from here.

## Project structure

```
app/[locale]/          Localized pages (/en, /ar): landing, pricing, login, signup, dashboard/*
app/api/                Route handlers: chat, resume/enhance, jobs/search, billing/*
components/             Shared UI (Navbar, Footer, DashboardShell, ChatWidget, forms, pricing cards)
lib/supabase/           Browser + server Supabase clients
lib/billing/            Provider-agnostic billing interface + Lemon Squeezy/Stripe implementations
i18n/                   next-intl routing/config
messages/               en.json / ar.json translation catalogs
supabase/schema.sql     Database schema + Row Level Security policies
```

## Known limitations of this MVP (see plan doc §8 for the roadmap)

- Job search currently reads a handful of public Greenhouse company boards plus a curated Gulf fallback list — broaden this with a paid job-aggregator API (or more Greenhouse/Lever/Ashby boards) before relying on it for real coverage.
- "One-click apply" only appears where a source technically supports it; everything else is a smart, pre-filled deep link — by design (see plan doc §4 on why real auto-submit bots aren't used).
- Auth/billing/AI all gracefully no-op until you add the relevant keys above; nothing is silently broken, but nothing is "live" until then either.
