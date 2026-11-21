import { defineConfig } from '@playwright/test';

// The live smoke run points E2E_BASE_URL at the deployed site; there is no local server to start then.
const live = Boolean(process.env.E2E_BASE_URL);

// The local run builds and previews on its own ports, so a dev server already on :4321 can neither block it nor
// serve it pages built without the fixture data below.
const discoverPort = Number(process.env.E2E_DISCOVER_PORT || 4322);
const sitePort = Number(process.env.E2E_SITE_PORT || 4323);
const discoverUrl = `http://127.0.0.1:${discoverPort}`;
const baseURL = process.env.E2E_BASE_URL || `http://localhost:${sitePort}`;

export default defineConfig({
    testDir: './e2e',
    webServer: live
        ? undefined
        : [
              {
                  // The recipe pages are rendered at build time from the app's public Discover API. This local
                  // fixture keeps the run independent of app.tandra.uk and of the library's current contents.
                  command: 'bun e2e/support/discover-api.ts',
                  url: `${discoverUrl}/api/public/discover/recipes`,
                  reuseExistingServer: !process.env.CI,
                  env: { ...process.env, E2E_DISCOVER_PORT: String(discoverPort) },
              },
              {
                  command: `bun run build && bun run preview -- --port ${sitePort}`,
                  url: baseURL,
                  reuseExistingServer: !process.env.CI,
                  // Covers the build as well as the server start.
                  timeout: 300_000,
                  env: {
                      ...process.env,
                      DISCOVER_API_URL: discoverUrl,
                      // `ASTRO_PREVIEW_BACKGROUND=1` opts out of Astro 7.2+'s agent-detected auto-
                      // background mode. Without it, `astro preview` forks and the parent process exits
                      // before Playwright can health-check it, so every run reports "Process exited early".
                      ASTRO_PREVIEW_BACKGROUND: '1',
                  },
              },
          ],
    use: {
        baseURL,
    },
});
