import { expect, test } from '@playwright/test';

// The production build loads the Umami tracker; the @smoke run against https://tandra.uk must not
// count as a visit. Umami's tracker checks this flag before every send.
test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('umami.disabled', '1'));
});

test('homepage renders the pitch, links to the app and has no console errors @smoke', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');

    await expect(page).toHaveTitle(/Tandra/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/shared shopping list/i);
    await expect(page.getByRole('link', { name: 'Open Tandra' })).toHaveAttribute('href', /^https:\/\//);
    await expect(page.getByRole('link', { name: 'Try it without an account' })).toHaveAttribute(
        'href',
        /^https:\/\/.+\/try$/
    );
    await expect(page.getByRole('heading', { level: 2, name: 'From a link to a list' })).toBeVisible();
    expect(errors).toEqual([]);
});

test('FAQ answers open on click', async ({ page }) => {
    await page.goto('/');

    const question = page.getByText('Does it work without signal in the shop?');
    await question.click();

    await expect(page.getByText(/tick items off with no connection/)).toBeVisible();
});

test('demo clips load on demand, never autoplay, and both sources resolve', async ({ page, request }) => {
    await page.goto('/');

    const videos = page.getByRole('region', { name: 'See it in use' }).locator('video');
    await expect(videos).toHaveCount(3);

    for (const name of ['import', 'plan', 'shop']) {
        const video = page.locator(`video[poster="/clips/${name}.webp"]`);
        await expect(video).toHaveAttribute('preload', 'metadata');
        await expect(video).toHaveAttribute('controls', '');
        await expect(video).not.toHaveAttribute('autoplay');
        expect(await video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);

        const sources = await video
            .locator('source')
            .evaluateAll((els) => els.map((el) => [el.getAttribute('src'), el.getAttribute('type')]));
        expect(sources).toEqual([
            [`/clips/${name}.webm`, 'video/webm'],
            [`/clips/${name}.mp4`, 'video/mp4'],
        ]);
        for (const path of [`/clips/${name}.webm`, `/clips/${name}.mp4`, `/clips/${name}.webp`]) {
            const response = await request.get(path);
            expect(response.status(), path).toBe(200);
            expect((await response.body()).length, path).toBeLessThanOrEqual(2 * 1024 * 1024);
        }
    }
});
