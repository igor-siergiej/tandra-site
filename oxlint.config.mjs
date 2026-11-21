import shared from '@imapps/oxc-config/oxlint';
import { defineConfig } from 'oxlint';

export default defineConfig({
    extends: [shared],
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
    ],
    rules: {
        'one-var': ['error', 'never'],
    },
    overrides: [
        ...shared.overrides,
        {
            files: ['src/**/*'],
            rules: {
                'typescript/no-explicit-any': 'off',
                'no-unused-vars': 'off',
                'typescript/no-non-null-assertion': 'off',
            },
        },
    ],
});
