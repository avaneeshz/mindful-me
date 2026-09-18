# mindful-me — Git & Deployment Workflow

This is the required workflow for every change to this repository, human or agent. It exists so production never sees untested code or a database write it wasn't meant to get. It is not a suggestion — **there is no direct merge, push, or commit to `main`, ever**, except the two exits this file names explicitly (the `develop → main` release PR, and a hotfix under **Emergencies**).

## Branch → environment map

| Branch | Vercel deployment | Supabase project | Purpose |
|---|---|---|---|
| `main` | Production (`mindful-me-nu.vercel.app` and the other production domains) | `mindful-me` (prod, `vhaynkgnqcbejiojvujg`) | What real users see. |
| `develop` | Preview, permanently aliased to `mindful-me-git-develop-avaneesh3.vercel.app` | `mindful-me-test` (`iawbubbywkcxwvzyjaar`) | Integration/staging — where merged features soak together before a release. |
| `feature/*` | Preview, auto-aliased to `mindful-me-git-<branch-name>-avaneesh3.vercel.app` | Test project (if the Preview env var scope has been widened past `develop`), otherwise local-only mode | Where a single change is built and proven. |

`develop` and `feature/*` preview URLs sit behind Vercel Authentication — only people on the `avaneesh3` Vercel team can open them. Only the production domain is public.

Never edit environment variables so that a Preview scope (or "Production and Preview" combined) resolves to the production Supabase project — that combined scope was the exact root cause of an incident where `develop` briefly pointed at production data. Production and Preview must always carry separate, independently-scoped values.

## The loop

### 1. Cut the feature branch from `develop` — never from `main`

```bash
git checkout develop
git pull origin develop
git checkout -b feature/short-description
```

If a branch was accidentally cut from `main`, rebase it onto `develop` before doing anything else — don't build on top of a stale base.

### 2. Build and test on the feature branch

- Local dev needs no backend at all (the app's local-first design means zero `.env` still works) — fine for pure UI work.
- If the change needs a schema change, add one migration file to `supabase/migrations/` (`YYYYMMDDHHMMSS_description.sql`, following the existing files' naming) and apply it to the **test** Supabase project only. Never touch the production project from a feature branch.
- Point the branch's `.env` or its own preview deployment at the test project's credentials to exercise real backend/RLS behavior before it ever reaches `develop`.
- Run the project's own gates before opening a PR: `npm run typecheck && npm test && npm run build`.
- Reconcile the change against `CLAUDE.md` and `.claude/agents/full-stack-engineer.md`'s Non-negotiable Product Rules — a change that fails one of those isn't done, whatever the tests say.

### 3. Open a PR into `develop`, not `main`

- Title and description explain what changed and why, per the repo's usual commit-message conventions.
- Get it reviewed (self-review with `/code-review` counts) before merging.
- Merge into `develop`. Its preview deployment rebuilds automatically against the test project.

### 4. Let `develop` soak

`develop` is where multiple merged features run together against real (test) data flows before anyone commits to a release. Don't rush a promotion to `main` the same day a feature lands — give feature interactions a chance to surface.

### 5. Promote `develop` → `main` — the release

Do these in order. Skipping the order is how live traffic breaks mid-deploy.

1. **Migrate production's schema first.** Apply the same migration file(s) already proven against the test project to the **production** Supabase project (`vhaynkgnqcbejiojvujg`), before the new code goes live. New code must never reach production before the schema it depends on does.
2. **Non-additive schema changes (rename, drop, signature change) use expand–contract, never a single step:**
   - This release: add the new shape; ship code that works with both old and new.
   - A later release, once nothing depends on the old shape: drop it in its own migration.
   - A same-release destructive migration can 500 real requests mid-deploy — production traffic is live while the migration runs.
3. **Open a real PR: `develop` → `main`.** No force-push, no fast-forward that skips review — keep a diff someone can actually read before it goes live.
4. **Merge.** This triggers the production Vercel deployment, which builds against the production Supabase project.
5. **Smoke-test production immediately after merge.** If something's wrong, use Vercel's deployment history to roll back to the previous production build rather than rushing a fix forward.

## Hard rules

- No branch other than `main` ever deploys to the production Supabase project. If a Vercel env var change would blur that line, stop and ask before saving it.
- No feature branch is ever cut from `main`.
- No migration is "done" until it has been applied to **both** projects — test as part of the feature, production as the first step of the release that ships it. Don't let one lag the other.
- No destructive schema change ships in the same release as the code that stops needing the old shape — expand this release, contract a later one.
- Never commit a secret, API key, or connection string to either environment's config. The Supabase anon/publishable key is the one exception — it's designed to be public (see `app/.env.example`); every real permission boundary lives in row-level security, not in keeping that key secret.

## Emergencies

A genuine production hotfix (something actively broken for real users, unrelated to work in flight on `develop`) may branch from `main` and merge back to `main` directly — but it must also be merged (or cherry-picked) into `develop` immediately after, so `develop` never silently drifts behind what's actually running in production. This is the only exception to "cut from `develop`, merge to `develop` first" in this whole document, and it should be rare enough that reaching for it feels notable, not routine.
