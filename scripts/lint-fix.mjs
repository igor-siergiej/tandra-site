import { spawnSync } from 'node:child_process';

const files = process.argv.slice(2);
const args = ['-c', 'oxlint.config.mjs', '--fix', '--deny-warnings', ...(files.length ? files : ['.'])];

// Native prefer-const and JS-plugin spacing edits can overlap. The second pass
// applies the spacing edit left behind by the first; its status is authoritative.
for (let pass = 0; pass < 2; pass++) {
    const result = spawnSync('oxlint', args, { stdio: 'inherit' });

    if (result.error) throw result.error;

    if (result.status !== 0 && result.status !== 1) process.exit(result.status ?? 1);

    if (pass === 1) process.exit(result.status);
}
