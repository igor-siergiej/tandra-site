import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixtures: string[] = [];

const excluded = {
    '.git': true,
    '.factory': true,
    '.astro': true,
    node_modules: true,
    dist: true,
    'playwright-report': true,
    'test-results': true,
    src: true,
    e2e: true,
    public: true,
    infra: true,
    docs: true,
} satisfies Record<string, true>;

// Keep real package scripts, configs and any tooling helpers, but isolate the input
// from app diagnostics. No lint/fix/format command may write into the real checkout.
function toolingFixture() {
    const directory = mkdtempSync(join(root, '.tooling-test-'));
    fixtures.push(directory);

    for (const entry of readdirSync(root)) {
        if (Object.hasOwn(excluded, entry) || entry.startsWith('.tooling-test-')) continue;
        cpSync(join(root, entry), join(directory, entry), { recursive: true });
    }

    symlinkSync(join(root, 'node_modules'), join(directory, 'node_modules'), 'dir');
    mkdirSync(join(directory, 'src'), { recursive: true });
    writeFileSync(join(directory, 'src/probe.ts'), 'export const answer = 42;\n');

    return directory;
}

function command(directory: string, script: 'lint' | 'lint:fix' | 'format') {
    const result = spawnSync('bun', ['run', script], {
        cwd: directory,
        encoding: 'utf8',
        timeout: 30_000,
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });

    return {
        status: result.status,
        output: `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ?? ''}`,
    };
}

function succeeds(directory: string, script: 'lint' | 'lint:fix' | 'format') {
    const result = command(directory, script);
    expect(result.status, `${script}\n${result.output}`).toBe(0);
}

afterEach(() => {
    for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

describe('shared Oxc tooling commands', () => {
    it('checks formatting without writes, fixes lint separately, and leaves generated files untouched', () => {
        const directory = toolingFixture();
        succeeds(directory, 'lint:fix');
        succeeds(directory, 'format');

        const generated = 'this is deliberately not valid TypeScript {{{\n';

        for (const folder of ['dist', '.astro']) {
            mkdirSync(join(directory, folder), { recursive: true });
            writeFileSync(join(directory, folder, 'generated.ts'), generated);
        }

        succeeds(directory, 'lint');

        const markdownPath = join(directory, 'TOOLING-PROBE.md');
        const unformatted = '| Command | Effect |\n|---|---|\n|lint|check|\n';
        writeFileSync(markdownPath, unformatted);
        const formattingCheck = command(directory, 'lint');
        expect(
            formattingCheck.status,
            `lint must reject unformatted Markdown, not just check TypeScript\n${formattingCheck.output}`
        ).not.toBe(0);
        expect(readFileSync(markdownPath, 'utf8')).toBe(unformatted);
        succeeds(directory, 'format');
        expect(readFileSync(markdownPath, 'utf8')).not.toBe(unformatted);
        succeeds(directory, 'lint');

        const probePath = join(directory, 'src/probe.ts');
        writeFileSync(probePath, 'export function answer() {\n    let value = 42;\n    return value;\n}\n');
        succeeds(directory, 'format');
        const beforeLint = readFileSync(probePath, 'utf8');
        expect(beforeLint).toMatch(/\blet value\b/);
        const lintCheck = command(directory, 'lint');
        expect(lintCheck.status, lintCheck.output).not.toBe(0);
        expect(lintCheck.output).toMatch(/prefer-const|useConst/);
        expect(readFileSync(probePath, 'utf8')).toBe(beforeLint);
        succeeds(directory, 'lint:fix');
        expect(readFileSync(probePath, 'utf8')).toMatch(/\bconst value\b/);
        succeeds(directory, 'lint');

        for (const folder of ['dist', '.astro']) {
            expect(readFileSync(join(directory, folder, 'generated.ts'), 'utf8')).toBe(generated);
        }
    }, 120_000);

    it('reports shared anti-slop diagnostics and stays clean on a second format check after correction', () => {
        const directory = toolingFixture();
        succeeds(directory, 'lint:fix');
        const probePath = join(directory, 'src/probe.ts');
        writeFileSync(
            probePath,
            'export const doubled = [1, 2, 3].filter((value) => value > 1).map((value) => value * 2);\n'
        );
        succeeds(directory, 'format');
        const beforeLint = readFileSync(probePath, 'utf8');
        const lintCheck = command(directory, 'lint');
        expect(lintCheck.output, 'lint must load the shared anti-slop plugin').toMatch(
            /anti-slop(?:\/|\()no-array-filter-map/
        );
        expect(lintCheck.status, lintCheck.output).not.toBe(0);
        expect(readFileSync(probePath, 'utf8')).toBe(beforeLint);

        writeFileSync(
            probePath,
            'export const doubled = [1, 2, 3].flatMap((value) => (value > 1 ? [value * 2] : []));\n'
        );
        succeeds(directory, 'lint:fix');
        succeeds(directory, 'format');
        succeeds(directory, 'lint');
        const formatted = readFileSync(probePath, 'utf8');
        succeeds(directory, 'format');
        expect(readFileSync(probePath, 'utf8')).toBe(formatted);
        succeeds(directory, 'lint');
    }, 120_000);
});
