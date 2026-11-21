import { expect, test } from '@playwright/test';

// See homepage.spec.ts: keeps the @smoke run against https://tandra.uk out of Umami.
test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('umami.disabled', '1'));
});

test('a library recipe has its own page with Recipe JSON-LD, credit and a link into the app @smoke', async ({
    page,
}) => {
    await page.goto('/recipe/');
    await expect(page.getByRole('heading', { level: 1, name: 'Recipes' })).toBeVisible();
    const cards = page.getByRole('main').getByRole('listitem').getByRole('link');
    expect(await cards.count()).toBeGreaterThan(0);

    const first = cards.first();
    const href = await first.getAttribute('href');
    expect(href).toMatch(/^\/recipe\/[^/]+\/$/);
    await first.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));

    const title = await page.getByRole('heading', { level: 1 }).textContent();
    const schemas = await page
        .locator('script[type="application/ld+json"]')
        .evaluateAll((nodes) => nodes.map((node) => JSON.parse(node.textContent ?? '{}')));
    const recipe = schemas.find((schema) => schema['@type'] === 'Recipe');
    expect(recipe).toMatchObject({ name: title?.trim(), license: expect.stringMatching(/^https:\/\//) });
    expect(recipe.recipeIngredient.length).toBeGreaterThan(0);
    expect(recipe.recipeInstructions.length).toBeGreaterThan(0);

    await expect(page.getByRole('heading', { level: 2, name: 'Ingredients' })).toBeVisible();
    await expect(page.locator('a[rel="license"]')).toHaveAttribute('href', recipe.license);
    await expect(page.getByRole('link', { name: 'Add to my list' })).toHaveAttribute(
        'href',
        /^https:\/\/app\.tandra\.uk\/discover\/[^/]+$/
    );
    // Importers read og:image as the dish's photo; the site default would put the landing page in someone's recipe.
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(0);
});

test('the comparison table sits before the FAQ and links to it', async ({ page }) => {
    await page.goto('/?home');

    const table = page.getByRole('table', { name: /How Tandra compares/ });
    await expect(table.getByRole('columnheader')).toHaveText(['Tandra', 'AnyList', 'Bring!', 'Paprika 3']);
    await expect(
        table
            .getByRole('row', { name: /Open source/ })
            .getByRole('cell')
            .first()
    ).toHaveText('Yes');

    await page.getByRole('link', { name: 'questions below' }).click();
    await expect(page).toHaveURL(/#faq$/);
    await expect(page.getByRole('heading', { level: 2, name: 'Questions' })).toBeInViewport();
});
