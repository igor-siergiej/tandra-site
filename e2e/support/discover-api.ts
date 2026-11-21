/**
 * Local stand-in for the app's public Discover API (`/api/public/discover/*`), so the e2e build renders the
 * `/recipe/` pages without reaching app.tandra.uk. Started by `playwright.config.ts`; the response shapes are
 * the ones `src/lib/discover.ts` declares.
 */
import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';

import type { DiscoverRecipe } from '../../src/lib/discover';

const port = Number(process.env.E2E_DISCOVER_PORT || 4322);

const recipes: DiscoverRecipe[] = [
    {
        id: 'fixture-pancakes',
        slug: 'fixture-pancakes',
        title: 'Fixture pancakes',
        tags: ['breakfast', 'vegetarian'],
        prepTime: 10,
        cookTime: 15,
        servings: 4,
        difficulty: 'easy',
        source: 'wikibooks',
        sourceUrl: 'https://en.wikibooks.org/wiki/Cookbook:Pancake',
        licence: 'CC-BY-SA-4.0',
        attribution: 'Wikibooks Cookbook contributors',
        ingredients: [
            { id: 'flour', name: 'plain flour', quantity: 200, unit: 'g' },
            { id: 'milk', name: 'milk', quantity: 300, unit: 'ml' },
            { id: 'eggs', name: 'eggs', quantity: 2, unit: 'pcs' },
        ],
        instructions: ['Whisk the flour, milk and eggs into a batter.', 'Fry ladlefuls until golden on both sides.'],
    },
    {
        id: 'fixture-tomato-soup',
        slug: 'fixture-tomato-soup',
        title: 'Fixture tomato soup',
        tags: ['soup'],
        prepTime: 15,
        cookTime: 30,
        servings: 2,
        difficulty: 'medium',
        source: 'user',
        sourceUrl: '/discover/fixture-tomato-soup',
        licence: 'CC-BY-SA-4.0',
        attribution: 'A Tandra user',
        publishedBy: 'Fixture cook',
        ingredients: [
            { id: 'tomatoes', name: 'tomatoes', quantity: 6, unit: 'pcs' },
            { id: 'oil', name: 'olive oil', quantity: 1.5, unit: 'tbsp' },
            { id: 'salt', name: 'salt' },
        ],
        instructions: ['Soften the tomatoes in the oil.', 'Simmer for 20 minutes, season and blend.'],
    },
];

type DiscoverListing = { items: Omit<DiscoverRecipe, 'ingredients' | 'instructions'>[] };

const json = (response: ServerResponse, status: number, body: DiscoverRecipe | DiscoverListing | { error: string }) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
};

createServer((request, response) => {
    const { pathname } = new URL(request.url ?? '/', `http://localhost:${port}`);

    if (pathname === '/api/public/discover/recipes') {
        // Summaries only: the site fetches each recipe's detail by slug.
        json(response, 200, {
            items: recipes.map(({ ingredients: _ingredients, instructions: _instructions, ...summary }) => summary),
        });

        return;
    }

    const slug = pathname.match(/^\/api\/public\/discover\/recipes\/([^/]+)$/)?.[1];
    const recipe = recipes.find((candidate) => candidate.slug === (slug && decodeURIComponent(slug)));

    if (recipe) json(response, 200, recipe);
    else json(response, 404, { error: 'not found' });
}).listen(port, '127.0.0.1');
