# GulfJobCopilot

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
5. SQL Editor → paste and run `supabase/profile-trigger.sql`. This auto-creates a `profiles` row (with `plan = 'free'`) whenever someone signs up — without it, there's nothing for the app to read a user's plan from.
6. Auth → Providers → enable email/password (and Google, if you want that login option).

**Testing the Pro paywall before real billing is wired up**: resume downloads are gated to `profiles.plan = 'pro'`. To try the unlocked experience yourself, open Table Editor → `profiles`, find your row, and manually change `plan` to `pro`. Once real billing is connected (see below), the webhook keeps this in sync automatically.

### 2. Billing

Pick one (see the plan doc's payments section for why Lebanon in particular needs care here):

- **Lemon Squeezy** (default, `BILLING_PROVIDER=lemonsqueezy`): create a store, two variants ($9.99/mo and $99.90/yr), and fill in `.env.local`:
  - `LEMONSQUEEZY_API_KEY` — Settings → API → create an API key.
  - `LEMONSQUEEZY_STORE_ID` — Settings → General.
  - `LEMONSQUEEZY_MONTHLY_VARIANT_ID` / `LEMONSQUEEZY_YEARLY_VARIANT_ID` — the variant IDs of your two products.
  - `LEMONSQUEEZY_WEBHOOK_SECRET` — Settings → Webhooks → create a webhook pointed at `https://gulfjobcopilot.com/api/billing/webhook`, subscribed to at least `subscription_created`, `subscription_payment_success`, and `subscription_cancelled`. The "Signing secret" you set there is this value — without it, incoming webhooks are accepted (200 OK, so Lemon Squeezy doesn't keep retrying) but silently ignored, since there's no way to verify they're genuine.
- **Stripe** (`BILLING_PROVIDER=stripe`): create the two Prices, fill in `STRIPE_*`, point the webhook at the same URL.

Switching providers later is a one-line env change (`lib/billing/index.ts`) — no UI or route changes needed.

Also set `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API → `service_role`, the secret one — never the anon/publishable key) so the webhook can mark a user's `profiles.plan` as `pro` after a real payment. This is server-only; never prefix it with `NEXT_PUBLIC_`.

### 3. Email notifications (new signups + new payments)

The app can email an admin address whenever someone registers or pays, using [Resend](https://resend.com):

1. Sign up at resend.com (free tier), create an API key, and set `RESEND_API_KEY` in `.env.local` / Vercel.
2. Optionally set `RESEND_FROM_EMAIL` (e.g. `"GulfJobCopilot <notifications@gulfjobcopilot.com>"`) once you've verified a sending domain in Resend; until then it falls back to Resend's sandbox sender.
3. `ADMIN_NOTIFICATION_EMAIL` controls where these land — defaults to `moustafa_sleiman@hotmail.com` if unset.
4. **New payments** are already wired up — `/api/billing/webhook` emails on every `subscription.created`/`subscription.renewed`/`subscription.cancelled` event once the billing webhook above is configured. Nothing extra to do here.
5. **New signups** need one extra step since Supabase, not this app, is what actually knows the moment a user registers: in the Supabase dashboard, go to **Database → Webhooks → Create a new webhook**, table `profiles`, event `Insert`, and point it at `https://gulfjobcopilot.com/api/notify/new-signup`. Add an HTTP header `x-webhook-secret` with a secret value of your choosing, and set that same value as `SUPABASE_WEBHOOK_SECRET` in `.env.local`/Vercel so the route can confirm the request really came from Supabase.

Without `RESEND_API_KEY` set, both notification paths just log what they would have sent — nothing breaks, you just won't get real emails until it's configured.

### 4. AI features

Set `ANTHROPIC_API_KEY` in `.env.local` to turn on real resume enhancement and the chatbot. Without it, both features return clearly-labeled demo responses so the UI is still fully demoable.

Uploading a resume now runs it through a full pipeline: the file is uploaded to Supabase Storage, its text is extracted server-side (PDF via `pdf-parse`, Word via `mammoth`), then rewritten by Claude into a polished, ATS-friendly version shown to the user (viewable/editable for free; the exported PDF is Pro-gated, see below).

### 5. Real job search

Job search calls two legitimate, ToS-compliant sources — never a scraper:

- **Greenhouse's public job board API** — free, no key, already wired up.
- **Jooble** (recommended for real Gulf/Levant coverage): sign up for a free API key at https://jooble.org/api/about and set `JOOBLE_API_KEY` in `.env.local`. Jooble is a licensed aggregator with dedicated coverage for the UAE, Saudi Arabia, Qatar, Kuwait, and Bahrain (and accepts other countries like Lebanon/Jordan/Egypt as free-text locations).

**Why not LinkedIn:** LinkedIn's User Agreement explicitly prohibits scraping/automated data collection, they actively detect and block bots, and there's no public jobs-search API open to third-party apps like this one. Building that would risk the product and the account behind it — so it's intentionally not part of this app. Once you have real hiring volume, the legitimate way to add LinkedIn-sourced jobs is LinkedIn's official Talent/Jobs Partner Program (a paid, approved-partner integration), which could be added the same way as Jooble above.

Without a `JOOBLE_API_KEY`, job search still shows real, live Greenhouse listings plus a curated Gulf/Levant demo list, so the page is never empty.

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
