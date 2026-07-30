# JobCopilot — Product & Technical Plan

*Prepared for Moustafa — v1, July 30, 2026*

## 1. Vision

A bilingual (Arabic/English) job-search copilot targeting the Gulf market (KSA, UAE, and wider MENA), where users can build/upload/enhance a resume, get matched to real job openings, apply with one click where the source allows it, track every application, and get help from an AI assistant along the way — funded by a $9.99/month or $99.90/year subscription.

## 2. Feature Set

### Core (MVP)
- Registration/login (email+password, Google OAuth), verified email, password reset
- Resume upload (PDF/DOCX parsing) + from-scratch builder + AI "enhance" (rewrite bullets, tailor to a job description, ATS keyword check)
- Job search: aggregated listings, filters (location, salary, remote, industry), Arabic/English job titles
- 1-click apply where the source supports programmatic submission; otherwise a pre-filled "smart apply" that deep-links to the source with the tailored resume/cover letter ready to attach
- Application tracker (kanban: saved → applied → interview → offer → rejected)
- AI chatbot assistant: answers registered users' job-search questions (resume feedback, interview prep, "why am I not getting responses," market/salary questions) using their profile as context
- Subscription billing: Free tier (limited applications/month) + Pro $9.99/mo or $99.90/yr
- Bilingual UI (Arabic RTL / English LTR) with a Gulf-inspired visual theme

### Attractive "why people upgrade" features (matches what leading products in this space offer)
- AI cover letter generator per job
- Mock interview practice (AI-driven Q&A, scored feedback)
- Hiring-manager/recruiter contact lookup for follow-ups
- Salary/offer negotiation guidance
- LinkedIn profile optimization tips
- Daily automated matching digest (email/WhatsApp)
- Multi-resume versions per target role/industry

## 3. Payments — Important Constraint

You said payouts need to land in a **Lebanese USD bank account**. This affects provider choice a lot, so here are the researched facts, not assumptions:

- **Lemon Squeezy** (merchant-of-record, handles global tax/compliance): explicitly lists Lebanon as an **unsupported country — it cannot even accept payments from Lebanese customers**, let alone pay out there. Not usable for you as the merchant. It does support **UAE and Saudi Arabia** for bank payouts, which matters if you ever incorporate there instead. ([Lemon Squeezy supported countries](https://docs.lemonsqueezy.com/help/getting-started/supported-countries))
- **Stripe**: Lebanon is not one of Stripe's supported account-holder countries, so you cannot open a Stripe account with a Lebanese business/bank address directly.
- **Payoneer**: Lebanon **is** listed as a supported/accepted country ([source](https://worldpopulationreview.com/country-rankings/payoneer-countries)), and Payoneer is what many Lebanese freelancers/founders already use. In practice, because of Lebanon's ongoing capital-control/banking crisis, most people withdraw via Payoneer's prepaid Mastercard or a local exchange-house cash pickup rather than a direct SWIFT deposit into a Lebanese bank — direct USD wires into Lebanese banks can get trapped or haircut ("lollar") under the informal capital controls that have been in place since 2019. This is *not* a Payoneer-specific limitation, it's the state of Lebanese banking, and it can change — verify directly with your bank and with Payoneer support before relying on it.
- **Realistic setup**: incorporate a simple US or UAE entity (e.g., via Stripe Atlas / Firstbase / a UAE free-zone company), use Stripe or Lemon Squeezy as the actual subscription processor tied to that entity, then move funds to yourself via Payoneer (or a UAE bank account, since Lemon Squeezy pays out to UAE) rather than trying to wire subscription revenue straight into a Lebanese bank.

**I'm not a financial or legal advisor** — this is a summary of current provider rules and common practice, not a recommendation on your specific tax/legal setup. Please confirm the mechanics with the provider and, ideally, an accountant familiar with Lebanese banking before going live.

**Engineering approach**: I'll build a **provider-agnostic billing module** (subscribe / cancel / webhook-handle behind one interface) so switching processors later doesn't require rewriting the app — Lemon Squeezy first (best fit for UAE/KSA card acceptance and MoR tax handling), Stripe as a drop-in alternative.

## 4. "Search and apply online for jobs" — how it will actually work

Auto-submitting forms on LinkedIn/Indeed with a browser bot violates those sites' Terms of Service, breaks constantly, and risks getting user accounts banned — so the MVP does **not** do that. Instead:

- **Legitimate ATS APIs** (Greenhouse, Lever, Ashby): thousands of companies publish open job boards via public APIs (e.g. `boards-api.greenhouse.io`) — free, legal, no auth needed, and some support real application submission endpoints. This is the demo data source for the MVP.
- **Job aggregator APIs** (e.g. RapidAPI job-search APIs, Adzuna): broaden coverage beyond ATS-listed roles.
- **Regional boards** (Bayt, GulfTalent, Naukrigulf): no public partner APIs found; for these we show the listing and deep-link to "Apply on Bayt" with the tailored resume ready to attach, rather than scraping/auto-submitting.
- **1-click apply** is only offered where the source technically and legally allows programmatic submission; everywhere else it's "smart apply" (prefilled, one extra click on the source site).

## 5. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind | SSR for SEO on landing/job pages, one codebase for AR/EN |
| i18n | next-intl | Route-based `/en` `/ar`, full RTL support |
| Auth + DB + Storage | Supabase (Postgres + Auth + Storage) | Generous free tier, no forced expiry, built-in auth incl. OAuth |
| Billing | Lemon Squeezy (primary), Stripe (alt) behind one interface | See §3 |
| AI (resume enhance, chatbot, cover letters) | Claude API | Quality + already in your ecosystem |
| Hosting | Vercel (frontend) + Supabase (DB/auth/storage) | Real always-on free tiers, see §6 |

## 6. Hosting — "deploy for free"

Researched current (2026) free-tier reality:

- **Vercel**: frontend-only free tier is genuinely free and always-on (no sleep) for a Next.js app — best fit for the UI.
- **Render**: full free tier exists (web service + Postgres) but the **free Postgres database expires after 30 days** and the free web service **spins down after 15 minutes of inactivity** (~1 min cold-start on next request) — fine for a demo, not for production.
- **Railway**: free tier is just $1 of credit/month after the first month — not enough for sustained uptime.
- **Supabase**: free Postgres+Auth+Storage project with no forced expiry — pairs well with Vercel and avoids Render's 30-day DB reset.

**Recommended free stack**: Next.js on **Vercel** + **Supabase** for DB/auth/storage + Claude API for AI features. This is genuinely free to start, no credit card trap, and easy to upgrade later (custom domain, paid Supabase tier, dedicated billing account) without re-architecting.

**What I need from you to actually deploy it**: a Vercel account and a Supabase project (both free, sign up with GitHub/email), then either connect your GitHub repo or give me a deploy token so I can push it live and hand you the URL.

## 7. Data Model (initial)

- `users` (managed by Supabase Auth) + `profiles` (name, locale, target roles, phone)
- `resumes` (owner, title, content JSON, file_url, is_primary)
- `jobs` (source, external_id, title, company, location, description, apply_url, apply_type)
- `applications` (user_id, job_id, resume_id, status, applied_at, notes)
- `subscriptions` (user_id, provider, plan, status, renews_at)
- `chat_messages` (user_id, role, content, created_at)

## 8. Roadmap

**Phase 1 (this session)**: Scaffold + landing/pricing/auth + resume builder + job search demo (real ATS data) + chatbot widget + billing scaffolding + Supabase schema + deploy configs.
**Phase 2 (needs your accounts/keys)**: Wire real Supabase project, real Lemon Squeezy/Stripe keys, real Claude API key, deploy to Vercel, connect a domain.
**Phase 3**: Broaden job sources, add cover letter generator, mock interview tool, WhatsApp/email digest, hiring-manager lookup.

## 9. Compliance notes

- KSA/UAE have their own personal-data-protection laws (Saudi PDPL, UAE PDPL) — resume/CV data is sensitive personal data; store it in Supabase with row-level security and avoid retaining data longer than needed.
- Do not scrape or auto-submit on sites whose ToS forbid it (LinkedIn, Indeed, most regional boards) — stick to public APIs and deep-linking as described in §4.
