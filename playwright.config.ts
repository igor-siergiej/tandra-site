import { defineConfig } from '@playwright/test';

// The live smoke run points E2E_BASE_URL at the deployed site; there is no local server to start then.
const live = Boolean(process.env.E2E_BASE_URL);
const baseURL = live ? (process.env.E2E_BASE_URL as string) : 'http://localhost:4321';

export default defineConfig({
    testDir: './e2e',
    // `ASTRO_PREVIEW_BACKGROUND=1` opts out of Astro 7.2+'s agent-detected auto-
    // background mode. Without it, `astro preview` forks and the parent process exits
    // before Playwright can health-check it, so every run reports "Process exited early".
    ...(live
        ? {}
        : {
              webServer: {
                  command: 'bun run preview',
                  url: 'http://localhost:4321',
                  reuseExistingServer: !process.env.CI,
                  env: {
                      ...process.env,
                      ASTRO_PREVIEW_BACKGROUND: '1',
                  },
              },
          }),
    use: {
        baseURL,
    },
});
