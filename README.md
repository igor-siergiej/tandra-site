# Tandra Site

Landing site for [Tandra](https://github.com/igor-siergiej/tandra),
a shared shopping-list and recipe PWA. Static Astro output on S3 + CloudFront, live at https://tandra.uk, scaffolded from
[content-website-template](https://github.com/igor-siergiej/content-website-template).

The app itself is a separate deployment; this repo only serves the marketing pages.

## Architecture

Diagram: [docs/diagrams/architecture.excalidraw](docs/diagrams/architecture.excalidraw)
(open in excalidraw.com or the VS Code Excalidraw extension).

Visitor → CloudFront (OAC) → private S3 bucket holding `dist/`. The page's CTAs link to the
app at `https://tandra.uk`, which is deployed separately. Infra detail and
bootstrap steps: [infra/README.md](infra/README.md).

## Stack

| Concern | Choice |
|---------|--------|
| Runtime / package manager | Bun |
| Framework | Astro 7 (static output) |
| UI | Astro components, Tailwind v4, Bricolage Grotesque + Montserrat (self-hosted) |
| Lint / format | Biome |
| Hooks | Husky + lint-staged + commitlint (Conventional Commits) |
| Release | semantic-release |
| Dead code | Fallow |
| CI | GitHub Actions (`.github/workflows`) |
| Infra | Terraform (`infra/`) — S3 + CloudFront + GitHub OIDC, no servers |

## Commands

```bash
bun run dev            # dev server, :4321
bun run build          # static build -> dist/
bun run preview        # preview the static build
bun run lint           # biome check
bun run test           # vitest
bun run test:e2e       # playwright
```

Dev server needs no env, but every build (dev included) fetches the recipe pages from the app's public
Discover API, so it needs network access. `bun run test:e2e` serves the existing `dist/` via `bun run preview`,
so run `bun run build` first. CI also runs `bunx astro sync`, `tsc --noEmit` and
`bun run typecheck` (`astro check`). Vitest covers `src/**/*.test.ts`; Playwright covers `e2e/*.spec.ts`
(`@smoke` specs also run against production after a deploy).

## Environment

| Name | Where | Purpose |
|------|-------|---------|
| `SITE_URL` | `.env` / GitHub repo variable | Astro `site` (canonical, OG, sitemap). Unset falls back to `http://localhost:4321`. |
| `DISCOVER_API_URL` | `.env` (optional) | Origin of the public Discover API the recipe pages are built from. Unset falls back to `https://app.tandra.uk`. |
| `S3_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`, `AWS_DEPLOY_ROLE_ARN`, `AWS_REGION` | GitHub repo variables | Deploy job in `ci-cd.yml` (from `terraform output`). |
| `AWS_TERRAFORM_ROLE_ARN` | GitHub repo variable | `terraform.yml` plan/apply. |
| `CLOUDFLARE_API_TOKEN` | GitHub repo secret | `terraform.yml` plan/apply: the `tandra.uk` records in `infra/dns.tf` and `infra/acm.tf`. Scope: Zone:Read + DNS:Edit on `tandra.uk` only. |

## Analytics

Production pages load the self-hosted Umami tracker from `https://app.tandra.uk/pulse/p.js`
(`siteConfig.analytics`) and report to their own Umami website, "Tandra site", separate from the
app's. Clicks through to the app show up in the app's website with `tandra.uk` as the referrer.
It is only rendered when `SITE_URL` is on `tandra.uk`, and
`data-domains` stops it sending from any other host. CTAs carry `data-umami-event`
(`open_app`, `try_without_account`, `view_code`, `report_issue`) with a `placement` property
(`nav`, `hero`, `open-source`, `footer`). Umami's heatmap recorder
(`https://app.tandra.uk/pulse/recorder.js`) records click positions and scroll depth; it only sends once the
tracker has a session. It is ~60 KB of script that cost ~3 s of main-thread time on Lighthouse's throttled phone,
so it loads on the visitor's first scroll, tap or key press rather than with the page. The e2e specs set
`localStorage['umami.disabled']` so the live smoke run isn't counted. Instance setup:
`umami/README.md` in the `foundry` repo.

## CI / deploy

- `pull-request.yml`: lint, test (+ typecheck), e2e (Chromium), Fallow audit.
- `ci-cd.yml` (push to `main`, nightly at 03:23 UTC, manual): lint + test → build → semantic-release (pushes only)
  and deploy. Deploy assumes `gha-deploy` via OIDC, `aws s3 sync`s `dist/` in four passes (`_astro/*` immutable,
  `images/*` 1h, `recipe/*` cached by CloudFront for a day with `s-maxage`, everything else no-cache), then
  invalidates `/*`. The nightly run is what refreshes the recipe pages.
- `lighthouse.yml`: after every successful CI/CD run, Lighthouse CI (mobile profile, throttled 4G) runs 3 times on
  `/`, `/recipe/` and one recipe page of the live site and fails below performance 90 or SEO 95
  (`lighthouserc.json`). Reports go to LHCI's temporary public storage; the links are in the job log.
- `terraform.yml`: `infra/**` PRs from this repo get a plan comment; pushes to `main` apply.

## Status

- Infra follows the same split as `portfolio` in the shared AWS account: own state bucket
  `tandra-site-tfstate-777799876926`, own site bucket, own `tandra-site-gha-*` OIDC roles,
  and it reuses the account's existing GitHub OIDC provider.
- The site serves `tandra.uk` and `www.`: ACM cert in us-east-1, validated and pointed
  at CloudFront by DNS-only (grey cloud) CNAMEs in the Cloudflare `tandra.uk` zone. The app lives
  at `app.tandra.uk` (foundry Dokploy). The CloudFront function sends old app deep links (the app
  lived on `tandra.uk` before it moved) and returning users (the `tandra_app` cookie the app sets
  on `tandra.uk`) there; `/?home` always shows this page.
  `public/sw.js` replaces the service worker the app registered on this origin before it moved.
- Keystatic and the blog scaffolding were removed: the landing page is hand-written.
- `/recipe/` and `/recipe/<slug>/` are static pages built from the first 50 recipes of the app's public Discover
  API (`src/lib/discover.ts`), with Recipe JSON-LD, the source credit and licence, and an "Add to my list" link to
  the recipe in the app. They live under `/recipe/`, not `/recipes/`, because the CloudFront function still sends
  `/recipes/*` (an old app deep link) to the app. A failed API call fails the build, so a deploy never drops them.
- App screenshots in `src/assets/screens` are captured from the live app on a phone-sized viewport (390x844 @3x),
  signed in as the `samtandra` demo account (lists shared with `alextandra` and `jotandra`). Each has a `-dark`
  twin captured in the app's dark theme; `Phone.astro` serves it when the visitor's system is in dark mode.
- The homepage's demo clips (`public/clips/{import,plan,shop}.{webm,mp4,webp}`, shown by `Clip.astro`) are recorded
  from the live app as the same `samtandra` account (Bitwarden `creds.smoke.tandra`) on a 390x844 @2x phone, then
  encoded. Every change a clip makes is undone afterwards, so the account stays as the screenshots expect.
  Each clip must stay under 30 s and each video under 2 MiB; `build.sh` fails otherwise.

  ```sh
  TANDRA_DEMO_USER=samtandra TANDRA_DEMO_PASSWORD=… bun content/clips/record.ts   # all three, or name some
  content/clips/build.sh                                                           # needs ffmpeg and jq
  ```

  `record.ts` writes timed frames to `content/clips/raw/` (gitignored); commit only the files in `public/clips/`.

## Credits

UI skeleton adapted from
[leoMirandaa/shadcn-landing-page](https://github.com/leoMirandaa/shadcn-landing-page)
(MIT).
