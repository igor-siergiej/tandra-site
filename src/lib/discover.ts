/**
 * Build-time client for the app's public Discover API (tandra `PublicDiscoveryHandlers`). The recipe pages under
 * `/recipe/` are rendered from it at build time; the nightly CI/CD run rebuilds them so they follow the library.
 *
 * Any failure throws and fails the build: deploying a build without the pages would delete them from the bucket.
 */

const API_BASE = (typeof process !== 'undefined' ? process.env.DISCOVER_API_URL : undefined) || 'https://app.tandra.uk';

/** How many library recipes get a static page: the first page of the public list, newest first. */
const RECIPE_PAGE_COUNT = 50;

/** Shapes mirror `PublicDiscoveryRecipeSummary` / `PublicDiscoveryRecipe` in tandra `packages/types`. */
export interface DiscoverIngredient {
    id: string;
    name: string;
    quantity?: number;
    unit?: string;
}

export interface DiscoverRecipeSummary {
    id: string;
    slug?: string;
    title: string;
    tags: string[];
    /** Minutes. */
    prepTime?: number;
    /** Minutes. */
    cookTime?: number;
    servings?: number;
    difficulty?: 'easy' | 'medium' | 'hard';
    source: 'wikibooks' | 'user';
    sourceUrl: string;
    /** SPDX id, e.g. `CC-BY-SA-4.0`. */
    licence: string;
    attribution: string;
    publishedBy?: string;
}

export interface DiscoverRecipe extends DiscoverRecipeSummary {
    slug: string;
    ingredients: DiscoverIngredient[];
    instructions: string[];
}

const getJson = async <T>(path: string): Promise<T> => {
    const url = `${API_BASE}${path}`;
    const response = await fetch(url, { headers: { accept: 'application/json' } });

    if (!response.ok) throw new Error(`Discover API ${url} answered ${response.status}`);

    // SAFETY: callers select the response DTO for the matching Discover API route above.
    return (await response.json()) as T;
};

let recipes: Promise<DiscoverRecipe[]> | undefined;

const loadRecipes = async (): Promise<DiscoverRecipe[]> => {
    const page = await getJson<{ items: DiscoverRecipeSummary[] }>(
        `/api/public/discover/recipes?pageSize=${RECIPE_PAGE_COUNT}`
    );

    const slugs = page.items.flatMap((item) => (item.slug ? [item.slug] : []));

    return Promise.all(
        slugs.map((slug) => getJson<DiscoverRecipe>(`/api/public/discover/recipes/${encodeURIComponent(slug)}`))
    );
};

/** The recipes that get a page, fetched once per build and shared by the index and the per-recipe pages. */
export const getRecipes = (): Promise<DiscoverRecipe[]> => {
    recipes ??= loadRecipes();

    return recipes;
};

/** Minutes as an ISO 8601 duration for schema.org (`90` → `PT1H30M`). */
export const isoDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const rest = Math.round(minutes % 60);

    return `PT${hours ? `${hours}H` : ''}${rest || !hours ? `${rest}M` : ''}`;
};

/** Minutes for people (`90` → `1 hr 30 min`). */
export const readableDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const rest = Math.round(minutes % 60);

    return [hours && `${hours} hr`, (rest || !hours) && `${rest} min`].filter(Boolean).join(' ');
};

/** Keyed by the fractional part as `toFixed(2)` prints it. */
const FRACTIONS = { '0.25': '¼', '0.33': '⅓', '0.50': '½', '0.67': '⅔', '0.75': '¾' } satisfies Record<string, string>;

const readableQuantity = (quantity: number): string => {
    const whole = Math.floor(quantity);
    // SAFETY: this read-only lookup accepts missing keys; the truthiness check below handles undefined.
    const fraction = FRACTIONS[(quantity - whole).toFixed(2) as keyof typeof FRACTIONS];

    if (fraction) return whole ? `${whole}${fraction}` : fraction;

    return String(Number(quantity.toFixed(2)));
};

/** The app's unit for a plain count; on a recipe page `2 onions` reads better than `2 pcs onions`. */
const COUNT_UNIT = 'pcs';

/** One ingredient as a recipe line: `2 tbsp olive oil`, `½ onion`, `salt`. */
export const ingredientLine = ({ name, quantity, unit }: DiscoverIngredient): string =>
    [quantity !== undefined && quantity > 0 && readableQuantity(quantity), unit !== COUNT_UNIT && unit, name]
        .filter(Boolean)
        .join(' ');

// Both library sources (Wikibooks and user-published) are CC BY-SA 4.0 today.
const LICENCES = {
    'CC-BY-SA-4.0': { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
} satisfies Record<string, { name: string; url: string }>;

/** The licence's name and deed URL, for the credit line and the JSON-LD `license`. Unknown ids show as given. */
// SAFETY: a missing dictionary key yields undefined and takes the unknown-licence fallback.
export const licenceFor = (spdx: string): { name: string; url?: string } =>
    LICENCES[spdx as keyof typeof LICENCES] ?? { name: spdx };
