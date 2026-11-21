import shared from '@imapps/oxc-config/oxfmt';
import { defineConfig } from 'oxfmt';

export default defineConfig({
    ...shared,
    ignorePatterns: [
        ...shared.ignorePatterns,
        'node_modules/**',
        'dist/**',
        '.astro/**',
        '.factory/**',
        '.tooling-test-*/**',
        'playwright-report/**',
        'test-results/**',
        'infra/.terraform/**',
        // Pipeline-owned specs and workflows are not rewritten by this migration.
        'src/lib/tooling.test.ts',
        '.github/workflows/**',
        'jott-config.json',
        // Generated and committed by semantic-release (see .releaserc.json) with `*` bullets.
        'CHANGELOG.md',
    ],
    overrides: [...shared.overrides, { files: ['**/*.{yml,yaml}'], options: { tabWidth: 2 } }],
});
