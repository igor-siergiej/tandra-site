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

| Concern                   | Choice                                                                        |
| ------------------------- | ----------------------------------------------------------------------------- |
| Runtime / package manager | Bun                                                                           |
| Framework                 | Astro 7 (static output)                                                       |
| UI                        | Astro components, Tailwind v4, Bricolage Grotesque + Montserrat (self-hosted) |
| Lint / format             | Oxlint + Oxfmt via `@imapps/oxc-config`                                       |
| Hooks                     | Husky + lint-staged + commitlint (Conventional Commits)                       |
| Release                   | semantic-release                                                              |
| Dead code                 | Fallow                                                                        |
| CI                        | GitHub Actions (`.github/workflows`)                                          |
| Infra                     | Terraform (`infra/`) — S3 + CloudFront + GitHub OIDC, no servers              |

## Commands

```bash
bun run dev            # dev server, :4321
bun run build          # static build -> dist/
bun run preview        # preview the static build
bun run lint           # read-only Oxlint (warnings fail) + Oxfmt check
bun run lint:fix       # safe lint fixes, then formatting
bun run format         # formatting only, writes supported files
bun run format:check   # read-only formatting check
bun run test           # vitest
bun run test:e2e       # playwright
```

Dev server needs no env, but every build (dev included) fetches the recipe pages from the app's public
Discover API, so it needs network access. `bun run test:e2e` is offline: Playwright starts a local fixture
Discover API (`e2e/support/discover-api.ts`, `:4322`), builds the site against it with `DISCOVER_API_URL` and
previews the result on `:4323`, so it neither needs app.tandra.uk nor collides with a dev server on `:4321`
(override with `E2E_DISCOVER_PORT` / `E2E_SITE_PORT`). With `E2E_BASE_URL` set it targets that deployed site instead.
CI also runs `bunx astro sync`, `tsc --noEmit` and
`bun run typecheck` (`astro check`). Vitest covers `src/**/*.test.ts`; Playwright covers `e2e/*.spec.ts`
(`@smoke` specs also run against production after a deploy).

Factory configuration is tracked in `jott-config.json` on `main` so both new card
worktrees and trusted-base shipping stages read the same project settings.

### Tooling requirements and coverage

Use Bun **1.4.4 or newer** (`packageManager` pins 1.4.4) and Node.js **22.22.0 or newer**
(Astro's minimum; verified with Node 24.22.1). Install with `bun install --frozen-lockfile`.
Node must be on `PATH`: Oxlint's JavaScript configuration and shared anti-slop plugin run through Node,
not Bun's experimental Node compatibility.

Both `oxlint.config.mjs` and `.oxfmtrc.mjs` import the published **`@imapps/oxc-config` 7.0.1**
presets, not local copies. Its registry peer ranges are `oxlint` / `@oxlint/plugins >=1.90.0 <2`
and `oxfmt >=0.75.0 <1`; we pin **1.93.0 / 1.93.0 / 0.78.0**, respectively, from that release's
package metadata. When upgrading, inspect `bun info @imapps/oxc-config` or `npm view @imapps/oxc-config`
and use its current peer requirements rather than README version examples.

`lint` never writes. `lint:fix` runs two safe Oxlint fix passes because native `prefer-const`
and shared anti-slop spacing fixes can overlap, then runs Oxfmt; remaining diagnostics fail the command.
`format` does not fix lint errors. Run `format:check` twice after formatting to check stability.
Husky's existing pre-commit hook runs lint-staged: JavaScript/TypeScript files get lint fixes and
formatting, Astro files get lint fixes only, and supported data/style/document files get formatting.
Both lint CI jobs already run `bun run lint`, so they now check both shared presets.

Project-specific single-declarator, const/template and equality rules remain enabled; the source
exceptions for unused variables, explicit `any` and non-null assertions, and test `any` exceptions remain.
The shared formatter preserves four-space code, two-space JSON, single quotes, semicolons, ES5 trailing
commas and import sorting; YAML stays two-space.

Coverage is not a substitute for `astro check`:

- Oxlint checks JS/TS and extracts **Astro frontmatter and script blocks**, but does **not** lint Astro
  template expressions or HTML/accessibility semantics. Astro import organization remains unsupported.
- Oxfmt checks JS/TS, JSON, CSS, Markdown, YAML and other built-in supported formats. **Astro formatting
  is disabled by default** in Oxfmt 0.78 and is not enabled here: its optional Astro parser requires
  `@astrojs/compiler-rs` and a separate opt-in. An explicit Astro-only format command reports no targets.
  Edit Astro templates manually and use `bun run typecheck` and the existing Playwright specs.
- Oxlint does not lint CSS/JSON/Markdown; former CSS at-rule / `!important` and HTML-ID lint exceptions
  have no equivalent coverage here. Terraform/HCL, images and generated lockfiles are not formatter targets.
- `dist/`, `.astro/`, dependency trees, test reports, Terraform caches and factory artifacts are excluded.
  Oxfmt also respects `.gitignore`; pipeline-owned workflows, `jott-config.json` and the frozen
  `src/lib/tooling.test.ts` are excluded from rewriting. They are not generated app source.
- `CHANGELOG.md` is generated and committed by semantic-release (see `.releaserc.json`) with `*` bullets,
  so it is excluded from Oxfmt; formatting it would make the next release fail `bun run lint`.
- CI lint jobs set up Node 22.22.0 (`actions/setup-node`) alongside Bun, so Oxlint's JS config runs on
  the required Node version.

## Environment

| Name                                                                           | Where                         | Purpose                                                                                                                                    |
| ------------------------------------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `SITE_URL`                                                                     | `.env` / GitHub repo variable | Astro `site` (canonical, OG, sitemap). Unset falls back to `http://localhost:4321`.                                                        |
| `DISCOVER_API_URL`                                                             | `.env` (optional)             | Origin of the public Discover API the recipe pages are built from. Unset falls back to `https://app.tandra.uk`.                            |
| `S3_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`, `AWS_DEPLOY_ROLE_ARN`, `AWS_REGION` | GitHub repo variables         | Deploy job in `ci-cd.yml` (from `terraform output`).                                                                                       |
| `AWS_TERRAFORM_ROLE_ARN`                                                       | GitHub repo variable          | `terraform.yml` plan/apply.                                                                                                                |
| `CLOUDFLARE_API_TOKEN`                                                         | GitHub repo secret            | `terraform.yml` plan/apply: the `tandra.uk` records in `infra/dns.tf` and `infra/acm.tf`. Scope: Zone:Read + DNS:Edit on `tandra.uk` only. |

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

## Credits

UI skeleton adapted from
[leoMirandaa/shadcn-landing-page](https://github.com/leoMirandaa/shadcn-landing-page)
(MIT).
