# Deployment and rollback

## Existing identity

- Repository: `operatoruplift/rwa-lens`, branch `main`.
- Vercel project: `rwa-lens`, project ID `prj_d4qey6ZyzUl5rJpg7pnMQp87Rq12`.
- Canonical production: https://rwalensonsolana.vercel.app
- Also preserved: https://rwa-lens-omega.vercel.app
- Independent Supabase project: `skpzggvbnuipdqhtwmbw` (`rwa-lens`).
- Prior production deployment: `dpl_cWXV13Dhp8HWS3XJ6n75LzEd5pEK`,
  https://rwa-lens-mvbfcc980-operatoruplift.vercel.app (baseline commit `c5fa4dd`).

The user's current task explicitly authorizes deployment. This project has no
runtime dependency on Lotline and no Lotline tables or credentials are used.

## Verified application release

Application commit `a3e1b386fa762bb87ae894dab47cae7ca6c64b94` was automatically
built by the existing GitHub-to-Vercel integration. Deployment
`dpl_5dhCMrvc3RRWR83vDPYT6QP1FrCV` is Ready at
https://rwa-lens-79mz5m9zi-operatoruplift.vercel.app. The canonical and secondary
aliases both resolved to that release. CI and hosted read/browser checks passed;
see `rwa-demo-evidence.md` for actual run links and receipts. Evidence-only
follow-up commits may produce another deployment with identical application code.

## Release procedure

1. Inspect `git status`, preserve unrelated work, run lint/typecheck/unit tests.
2. Run `npm run build`, then `npm run test:e2e` against `next start`.
3. Review changes and commit/push to the existing repository. Verify the GitHub
   deterministic workflow on the release commit.
4. Deploy the linked Vercel project using `vercel --prod --yes` if the repository
   push does not already produce the intended production release. Verify the
   production alias points to the new Ready deployment.
5. Exercise `/` and `/rwa`, live USDY inspection, fixture timeline, JSON/CSV
   export, invalid input, optional endpoints, security headers and mobile views.
6. Run `node scripts/verify-live.mjs` and the deliberately separate hosted-read
   GitHub workflow; preserve receipts and actual outcomes.

Never publish `.env.local`, production pull files, cookies, API keys or wallet
signatures. Vercel sensitive values cannot be pulled; do not overwrite them
with `[SENSITIVE]` placeholders. Preserve existing production RPC/cluster settings.

## Configuration presence

The existing production project contains `RWA_CLUSTER`, `RWA_RPC_URL`,
`RWA_REPORTS_ENABLED`, `RWA_METADATA_ALLOWED_HOSTS`, `RATE_LIMIT_SECRET`,
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
The Supabase URL was verified to belong to the independent RWA Lens project.
Only configuration presence and provider hostname are disclosed, never secrets.

Wallet authentication/cloud reports additionally require the dedicated names in
`.env.example`, an exact application origin, strong session secret, and the
additive durable-store migration. Do not enable an incompletely configured flow.
The custom wallet cookie is not a Supabase authenticated JWT. Do not re-use the
legacy UUID `owner_id` table as though a base58 wallet address were `auth.uid()`.

## Rollback

Use Vercel's production rollback to the prior known Ready deployment (or
`vercel rollback <deployment-url>` from the linked project). Confirm both
canonical aliases, then rerun the guest/fixture smoke check. If needed, revert
the release commit with a new Git commit; do not reset or force-push main.

New durable auth tables/functions are additive and can remain unused during an
application rollback. Keep `RWA_REPORTS_ENABLED=false` until their configuration
and live owner-isolation checks are complete. Preserve report records; avoid
rolling back by dropping populated tables. See migration comments for forward
repair. Existing read rate-limiter storage is preserved.

## API compatibility

The previous live request `{cluster,mint,owner?}` is accepted through an explicit
schema migration to `mode: "live"`. New fixture requests are strict
`{mode:"fixture",fixtureId,scenario}` objects. The earlier mixture of invented
fixture mint/owner fields is intentionally rejected; those fields could otherwise
misrepresent synthetic observations as live identity. The browser uses the new
contract. Report creation now accepts `{request: <inspection request>}` and the
server regenerates the observation; uploaded observation JSON is rejected.
