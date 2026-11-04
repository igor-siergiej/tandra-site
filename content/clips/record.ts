/**
 * Records the landing page's demo clips from the live app at https://app.tandra.uk, signed in as the samtandra demo
 * account (credentials: Bitwarden item `creds.smoke.tandra`).
 *
 *   TANDRA_DEMO_USER=samtandra TANDRA_DEMO_PASSWORD=… bun content/clips/record.ts [import] [plan] [shop]
 *
 * Writes content/clips/raw/<name>.webm (gitignored) plus <name>.json with the seconds to keep and the poster frame;
 * content/clips/build.sh encodes those into public/clips/. The site's screenshots are taken from the same account, so
 * every change a clip makes registers its undo as soon as it happens, and the undo runs (on a separate, unrecorded
 * page) even when the recording fails half way.
 */
import { mkdir, rm } from 'node:fs/promises';
import { type Browser, chromium, type Page } from '@playwright/test';

const APP = 'https://app.tandra.uk';
const RAW = new URL('./raw/', import.meta.url).pathname;
const VIEWPORT = { width: 390, height: 844 };
/** The tandra.uk recipe page the import clip imports: a CC BY-SA Wikibooks recipe, credited on that page. */
const IMPORT_URL = 'https://tandra.uk/recipe/wikibooks-485848/';
const IMPORTED_TITLE = 'Pasta with Budget Bolognese Sauce';
const GROCERIES = 'Groceries';
const PLANNED = [
    { day: 'Monday', recipe: 'Shakshuka I' },
    { day: 'Wednesday', recipe: 'Tacos' },
    { day: 'Friday', recipe: 'Seafood Risotto' },
];
const TICKED = ['Eggs', 'Spinach'];
const ADDED = 'Lemons';

interface Marks {
    /** Seconds into the raw video where the clip starts and ends. */
    start: number;
    end: number;
    /** Seconds into the trimmed clip for the poster frame. */
    poster: number;
}

interface Session {
    /** The recorded phone. */
    page: Page;
    mark: (name: keyof Marks) => void;
    /** Registers an undo, run on its own unrecorded page after the clip, newest first. */
    onCleanUp: (undo: (page: Page) => Promise<void>) => void;
    /** Another phone signed in to the same account, not recorded. */
    newPhone: () => Promise<Page>;
}

/** Video has no cursor, so every tap leaves a short ripple where it landed. */
const showTaps = () => {
    addEventListener(
        'pointerdown',
        (event) => {
            const dot = document.createElement('div');
            Object.assign(dot.style, {
                position: 'fixed',
                left: `${event.clientX - 22}px`,
                top: `${event.clientY - 22}px`,
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: 'rgba(46, 125, 50, 0.35)',
                border: '2px solid rgba(46, 125, 50, 0.7)',
                pointerEvents: 'none',
                zIndex: '2147483647',
                transition: 'transform 0.45s ease-out, opacity 0.45s ease-out',
            });
            document.documentElement.append(dot);
            requestAnimationFrame(() => {
                dot.style.transform = 'scale(1.6)';
                dot.style.opacity = '0';
            });
            setTimeout(() => dot.remove(), 600);
        },
        true
    );
};

/** Smooth scroll by `dy` pixels over roughly `ms`, the way a thumb would. */
const swipe = async (page: Page, dy: number, ms: number) => {
    const steps = Math.max(1, Math.round(ms / 40));
    for (let i = 0; i < steps; i++) {
        await page.mouse.wheel(0, dy / steps);
        await page.waitForTimeout(40);
    }
};

/** Clicks the confirm button if the action opened a confirmation dialog. */
const confirmIfAsked = async (page: Page, name: RegExp) => {
    const confirm = page.getByRole('alertdialog').getByRole('button', { name });
    if (await confirm.isVisible({ timeout: 1500 }).catch(() => false)) await confirm.click();
};

const openRecipes = async (page: Page) => {
    await page.goto(`${APP}/recipes`);
    await page.getByRole('heading', { name: PLANNED[0].recipe, exact: true }).waitFor();
    await page.waitForLoadState('networkidle');
};

const importClip = async ({ page, mark, onCleanUp }: Session) => {
    await openRecipes(page);
    mark('start');
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Add recipe' }).click();
    await page.waitForTimeout(900);
    await page.getByRole('button', { name: /Import from a link/ }).click();
    await page.waitForTimeout(700);
    const link = page.getByRole('textbox', { name: 'Recipe Link' });
    await link.click();
    await link.pressSequentially(IMPORT_URL, { delay: 25 });
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Import recipe from link' }).click();
    await page.getByRole('heading', { name: 'Ingredients' }).waitFor({ timeout: 60_000 });
    mark('poster');
    await page.waitForTimeout(1800);
    await swipe(page, 700, 1600);
    await page.waitForTimeout(1800);
    await swipe(page, 600, 1400);
    await page.waitForTimeout(1500);
    onCleanUp(async (phone) => {
        await openRecipes(phone);
        await phone.getByRole('heading', { name: IMPORTED_TITLE }).first().click();
        await phone.getByRole('button', { name: 'Delete recipe' }).click();
        await phone.getByRole('alertdialog').getByRole('button', { name: 'Delete Recipe' }).click();
        await phone.waitForURL(`${APP}/recipes`);
    });
    await page.getByRole('button', { name: 'Create Recipe' }).last().click();
    await page.getByRole('heading', { name: IMPORTED_TITLE }).first().waitFor();
    await page.waitForTimeout(2800);
    mark('end');
};

const openMealPlanNextWeek = async (page: Page) => {
    await page.goto(`${APP}/meal-plan`);
    await page.getByRole('button', { name: 'Next week' }).click();
    await page.getByRole('button', { name: `Plan a recipe for ${PLANNED[0].day}` }).waitFor();
};

const planClip = async ({ page, mark, onCleanUp }: Session) => {
    await page.goto(`${APP}/meal-plan`);
    await page.getByRole('button', { name: 'Next week' }).waitFor();
    await page.waitForLoadState('networkidle');
    mark('start');
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Next week' }).click();
    await page.waitForTimeout(1200);
    for (const { day, recipe } of PLANNED) {
        await page.getByRole('button', { name: `Plan a recipe for ${day}` }).click();
        await page.waitForTimeout(900);
        onCleanUp(async (phone) => {
            await openMealPlanNextWeek(phone);
            const remove = phone
                .getByRole('region', { name: new RegExp(`^${day} `) })
                .getByRole('button', { name: `Remove ${recipe}` });
            if (await remove.isVisible({ timeout: 3000 }).catch(() => false)) {
                await remove.click();
                await confirmIfAsked(phone, /remove/i);
                await remove.waitFor({ state: 'detached' });
            }
        });
        await page.getByRole('dialog').getByRole('button', { name: recipe, exact: true }).click();
        await page.waitForTimeout(1300);
    }
    mark('poster');
    await page.getByRole('button', { name: 'Shop for this week' }).click();
    await page.waitForTimeout(2200);
    await page.getByRole('dialog').getByRole('combobox', { name: 'Add to list' }).selectOption({ label: GROCERIES });
    await page.waitForTimeout(1200);
    await swipe(page, 500, 1500);
    await page.waitForTimeout(2000);
    mark('end');
};

const openGroceries = async (page: Page) => {
    await page.goto(APP);
    await page.getByRole('button', { name: new RegExp(`^${GROCERIES} `) }).click();
    await page.getByRole('button', { name: `${TICKED[0]} ${TICKED[0]}` }).waitFor();
    await page.waitForLoadState('networkidle');
};

const shopClip = async ({ page, mark, onCleanUp, newPhone }: Session) => {
    await openGroceries(page);
    // Someone at home, on another phone signed in to the same household list.
    const home = await newPhone();
    await openGroceries(home);
    mark('start');
    await page.waitForTimeout(1500);
    for (const item of TICKED) {
        await page.getByRole('button', { name: `${item} ${item}` }).click();
        onCleanUp(async (phone) => {
            await openGroceries(phone);
            await phone.getByRole('button', { name: `${item} ${item}` }).click();
            await phone.waitForTimeout(1000);
        });
        await page.waitForTimeout(1400);
    }
    onCleanUp(async (phone) => {
        await openGroceries(phone);
        await phone.getByRole('button', { name: `Delete ${ADDED}` }).click();
        await confirmIfAsked(phone, /delete/i);
        await phone.getByRole('button', { name: `${ADDED} ${ADDED}` }).waitFor({ state: 'detached' });
    });
    await home.locator('button:has(svg.lucide-plus)').first().click();
    await home.getByRole('searchbox', { name: 'Enter item name...' }).fill(ADDED);
    await home.getByRole('button', { name: 'Add Item' }).click();
    const added = page.getByRole('button', { name: `${ADDED} ${ADDED}` });
    await added.waitFor({ timeout: 15_000 });
    mark('poster');
    await page.waitForTimeout(2200);
    await added.click();
    await page.waitForTimeout(2200);
    mark('end');
};

const SCENARIOS: Record<string, (session: Session) => Promise<void>> = {
    import: importClip,
    plan: planClip,
    shop: shopClip,
};

const signIn = async (browser: Browser) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto(`${APP}/login`);
    await page.getByLabel('Username').fill(process.env.TANDRA_DEMO_USER ?? '');
    await page.getByLabel('Password').fill(process.env.TANDRA_DEMO_PASSWORD ?? '');
    await page.getByRole('button', { name: 'Login' }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    const state = await context.storageState();
    await context.close();
    return state;
};

/**
 * Captures the page with Chrome's screencast at device-pixel size. Playwright's recordVideo captures at CSS-pixel
 * size, which is too soft for a 2x display. Frames only arrive when something changes, so each keeps its timestamp.
 */
const startCapture = async (page: Page, dir: string) => {
    await mkdir(dir, { recursive: true });
    const frames: { file: string; at: number }[] = [];
    const writes: Promise<number>[] = [];
    const cdp = await page.context().newCDPSession(page);
    cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
        const file = `frame-${String(frames.length).padStart(5, '0')}.jpg`;
        frames.push({ file, at: metadata.timestamp ?? Date.now() / 1000 });
        writes.push(Bun.write(`${dir}/${file}`, Buffer.from(data, 'base64')));
        cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 92,
        maxWidth: VIEWPORT.width * 2,
        maxHeight: VIEWPORT.height * 2,
    });
    return async () => {
        await cdp.send('Page.stopScreencast');
        await Promise.all(writes);
        return frames;
    };
};

const record = async (browser: Browser, name: string, scenario: (session: Session) => Promise<void>) => {
    const storageState = await signIn(browser);
    const newPhone = async () => {
        const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, storageState });
        // Keep the recordings out of the app's Umami stats.
        await context.addInitScript(() => localStorage.setItem('umami.disabled', '1'));
        return context.newPage();
    };

    const page = await newPhone();
    await page.context().addInitScript(showTaps);
    const dir = `${RAW}${name}`;
    await rm(dir, { recursive: true, force: true });
    const stopCapture = await startCapture(page, dir);
    const marks: Partial<Marks> = {};
    const undos: ((page: Page) => Promise<void>)[] = [];
    let failure: unknown;
    try {
        await scenario({
            page,
            mark: (key) => {
                marks[key] = Date.now() / 1000;
            },
            onCleanUp: (undo) => undos.unshift(undo),
            newPhone,
        });
    } catch (error) {
        failure = error;
    }
    const frames = await stopCapture();
    await page.context().close();

    for (const undo of undos) {
        const phone = await newPhone();
        try {
            await undo(phone);
        } catch (error) {
            console.error(`!! ${name}: a clean-up step failed; check the demo account by hand.`, error);
        }
        await phone.context().close();
    }
    if (failure) throw failure;

    // ffmpeg concat list: each frame holds until the next one arrived. The last frame is listed twice, as the concat
    // demuxer ignores the final entry's duration.
    const last = frames.at(-1);
    if (!last) throw new Error(`${name}: no frames captured`);
    const list = frames.map((frame, i) => {
        const next = frames[i + 1];
        return `file '${frame.file}'\nduration ${next ? (next.at - frame.at).toFixed(3) : '0.040'}`;
    });
    await Bun.write(`${dir}/frames.txt`, `${list.join('\n')}\nfile '${last.file}'\n`);

    const first = frames[0].at;
    const { start = first, end = last.at, poster = start } = marks;
    const result: Marks = { start: start - first, end: end - first, poster: poster - start };
    await Bun.write(`${RAW}${name}.json`, `${JSON.stringify(result)}\n`);
    console.log(`${name}: ${(end - start).toFixed(1)} s, ${frames.length} frames`, result);
};

if (!process.env.TANDRA_DEMO_USER || !process.env.TANDRA_DEMO_PASSWORD) {
    throw new Error('Set TANDRA_DEMO_USER and TANDRA_DEMO_PASSWORD (Bitwarden: creds.smoke.tandra).');
}
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENARIOS);
await mkdir(RAW, { recursive: true });
const browser = await chromium.launch();
try {
    for (const name of names) {
        const scenario = SCENARIOS[name];
        if (!scenario) throw new Error(`Unknown clip "${name}"; expected one of ${Object.keys(SCENARIOS).join(', ')}`);
        await record(browser, name, scenario);
    }
} finally {
    await browser.close();
}
