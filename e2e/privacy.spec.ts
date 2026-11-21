import { expect, type Page, test } from '@playwright/test';

// See homepage.spec.ts: keeps the @smoke run against https://tandra.uk out of Umami.
test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('umami.disabled', '1'));
});

const section = (page: Page, id: string) => page.locator(`section[aria-labelledby="${id}"]`);

const row = (page: Page, id: string, name: RegExp) => section(page, id).getByRole('row', { name });

const LOCAL_STORAGE_KEYS = [
    'tandra:config',
    'tandra:lastSeenVersion',
    'tandra:guest-mode',
    'tandra:sign-out-pending',
    'tandra.voiceKeepListening',
    'tandra.groupByAisle',
    'theme',
    'unitSystem',
    'pwa-update-notified-at',
];

test('the notice describes the current auth stack and no longer mentions kivo @smoke', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy notice' })).toBeVisible();

    // kivo was replaced by Better Auth; nothing about the old auth service may survive in the notice.
    await expect(page.getByText(/kivo/i)).toHaveCount(0);

    const credentials = row(page, 'what', /Account credentials/);
    await expect(credentials).toContainText('Better Auth');
    await expect(credentials).toContainText('argon2id');
    // Password accounts get a placeholder address, never a real one.
    await expect(credentials).toContainText('users.invalid');

    const sessions = row(page, 'what', /Session telemetry/);
    await expect(sessions).toContainText('Better Auth');
    await expect(sessions).toContainText(/CF-Connecting-IP|client IP/i);
});

test('Google sign-in is listed as a processor and as a data source @smoke', async ({ page }) => {
    await page.goto('/privacy');

    const processor = row(page, 'processors', /^Google \(sign-in\)/);
    await expect(processor).toContainText('email address');
    await expect(processor).toContainText(/Standard Contractual Clauses|SCC/i);

    const source = row(page, 'what', /Google sign-in details/);
    await expect(source).toContainText('Google');
    await expect(source).toContainText(/never sees the Google password/i);
});

// Standing guard: the browser does the speech-to-text and fal.ai only ever sees the text. The wording
// was already correct, so this test passes on the old notice too — it exists to keep it that way.
test('voice input is transcribed by the browser and fal.ai only receives text @smoke', async ({ page }) => {
    await page.goto('/privacy');

    const audio = row(page, 'what', /Voice audio/);
    await expect(audio).toContainText(/browser’s speech service/i);

    const speech = row(page, 'processors', /speech service/i);
    await expect(speech).toContainText(/speech-to-text/i);

    const fal = row(page, 'processors', /^fal\.ai/);
    await expect(fal).toContainText('text only, no audio');
    await expect(fal).not.toContainText(/speech-to-text/i);
});

test('the storage table lists the Better Auth session cookie and the local storage the app uses @smoke', async ({
    page,
}) => {
    await page.goto('/privacy');
    const storage = section(page, 'storage');

    const cookie = storage.getByRole('row', { name: /better-auth\.session_token/ });
    await expect(cookie).toContainText('Strictly necessary cookie');
    await expect(cookie).toContainText('httpOnly');
    await expect(storage).not.toContainText(/kivo/i);

    for (const key of LOCAL_STORAGE_KEYS) {
        await expect(storage.getByRole('row', { name: new RegExp(`^${key}\\b`) })).toHaveCount(1);
    }

    // The table is the whole device-storage inventory: a key the app no longer writes, or one it now
    // writes that the notice has not caught up with, has to fail here rather than sit unnoticed.
    await expect(storage.getByRole('row').filter({ hasText: 'localStorage' })).toHaveCount(
        LOCAL_STORAGE_KEYS.length + 1
    );

    // Keys the app no longer writes.
    await expect(storage).not.toContainText('tandra.voiceAck');
    await expect(storage).not.toContainText('release-notes-seen');
});

test('the notice is dated after the auth rewrite', async ({ page }) => {
    await page.goto('/privacy');

    const updated = await page.locator('.updated').textContent();
    const date = updated?.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
    if (!date) throw new Error(`no last-updated date in "${updated ?? ''}"`);
    // A notice that predates the Better Auth / Google rewrite would still describe the old stack.
    expect(date.localeCompare('2026-10-24')).toBeGreaterThanOrEqual(0);
});
