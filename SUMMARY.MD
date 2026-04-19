# Project Summary

## Overview

This repository is a prototype recipe storage web application built with:

- `React`
- `TypeScript`
- `Vite`

The app is currently a single-page client application with one small Vite-backed server-side import endpoint. It is designed around five top-level user views:

- `Cookbook`
- `Recipe`
- `Planner`
- `Shopping List`
- `Import`

The prototype began as a seeded recipe browser and has since grown into a lightweight recipe manager with:

- imported local recipe data from text files
- recipe detail and note-taking
- meal planning
- shopping list generation
- ingredient exclusion when planning
- ingredient scaling
- URL-based recipe import using embedded recipe metadata

The current UI and runtime logic all live inside a fairly compact codebase.

## Top-Level Structure

Important top-level directories and files:

- [package.json](/home/martin/Dropbox/codex_test/saffron_clone/package.json)
  Defines the Vite scripts and current dependencies.
- [vite.config.ts](/home/martin/Dropbox/codex_test/saffron_clone/vite.config.ts)
  Vite config plus the custom import API middleware.
- [src](/home/martin/Dropbox/codex_test/saffron_clone/src)
  Main application code.
- [public](/home/martin/Dropbox/codex_test/saffron_clone/public)
  Static assets, including the fallback recipe placeholder image.
- [source_recipes](/home/martin/Dropbox/codex_test/saffron_clone/source_recipes)
  Text-based source recipe library imported at build/runtime.
- [source_images](/home/martin/Dropbox/codex_test/saffron_clone/source_images)
  Local images linked by some recipe source files.
- [scripts/fill-recipe-images.mjs](/home/martin/Dropbox/codex_test/saffron_clone/scripts/fill-recipe-images.mjs)
  Utility script used to populate image fields in recipe sources.

## Main Runtime Files

### [src/main.tsx](/home/martin/Dropbox/codex_test/saffron_clone/src/main.tsx)

Standard React entry point. It mounts the app and imports global CSS.

### [src/App.tsx](/home/martin/Dropbox/codex_test/saffron_clone/src/App.tsx)

This is the primary application file and currently contains:

- top-level app state
- view switching
- cookbook search and filtering
- recipe detail rendering
- planner logic
- shopping list generation
- import view logic
- ingredient scaling helpers
- planner ingredient picker modal

The app is not yet split into smaller components. Most interactive product behavior is centralized here.

### [src/App.css](/home/martin/Dropbox/codex_test/saffron_clone/src/App.css)

Main component-level styling. This file handles:

- the app shell
- tabs
- recipe cards
- planner cards
- recipe detail layout
- ingredient picker modal
- import view layout
- responsive adjustments

### [src/index.css](/home/martin/Dropbox/codex_test/saffron_clone/src/index.css)

Global visual foundation. This sets the broader page look and CSS variables.

### [src/recipes.ts](/home/martin/Dropbox/codex_test/saffron_clone/src/recipes.ts)

This file is the core data-model and local recipe parsing layer. It:

- defines the `Ingredient` and `Recipe` types
- loads all text recipes from `source_recipes/**/*.txt`
- parses recipe source files into structured recipe objects
- infers shopping aisles from ingredient text
- splits ingredients into `amount` and `item`
- generates stable IDs for recipes
- exposes `buildImportedRecipe()` for URL-imported recipes

### [src/recipeImport.ts](/home/martin/Dropbox/codex_test/saffron_clone/src/recipeImport.ts)

This file contains the URL import extraction logic. It:

- fetches external recipe pages server-side
- parses `application/ld+json`
- finds `schema.org/Recipe` nodes
- extracts title, author, source, image, tags, ingredients, steps, time, summary, and servings
- normalizes text and some numeric formatting
- decodes HTML entities before text is stored

This file is the importer’s primary intelligence layer.

### [src/recipeApi.ts](/home/martin/Dropbox/codex_test/saffron_clone/src/recipeApi.ts)

This provides a small API endpoint mounted into the Vite dev and preview server:

- `POST /api/import-recipe`

Responsibilities:

- read JSON request body
- validate that a URL was provided
- call `importRecipeFromUrl()`
- return structured JSON or a structured error

This avoids browser-side CORS and lets the app import remote recipe pages through the local dev server.

## Data Sources

The project currently has two recipe data sources.

### 1. Local text recipe library

Local source recipes live in [source_recipes](/home/martin/Dropbox/codex_test/saffron_clone/source_recipes).

These are imported with:

```ts
import.meta.glob('../source_recipes/**/*.txt', {
  query: '?raw',
  import: 'default',
  eager: true,
})
```

That means:

- recipe source files are bundled into the frontend build
- the browser gets the full recipe library at runtime
- the library is static at build time

The text file format supports fields like:

- `Title`
- `Description`
- `Source`
- `Original URL`
- `Yield`
- `Prep`
- `Cook`
- `Total`
- `Cookbook`
- `Section`
- `Tags`
- `Image`
- `Ingredients`
- `Instructions`

For cookbook exports, one file may contain multiple recipes separated by `---`.

### 2. URL-based imported recipes

Imported recipes are not persisted to disk yet. They are:

- fetched on demand through `/api/import-recipe`
- converted to the same app recipe shape as local recipes
- appended to in-memory React state

This means imported recipes survive only as long as the current browser session.

## Current State Model

Most state lives in [src/App.tsx](/home/martin/Dropbox/codex_test/saffron_clone/src/App.tsx).

Important state values:

- `recipeLibrary`
  The active recipe collection shown in the UI. Starts from imported text files and can be extended with URL imports.
- `activeView`
  One of `cookbook`, `recipe`, `planner`, `shopping`, or `import`.
- `selectedSection`
  The cookbook section filter.
- `selectedRecipeId`
  The current recipe being viewed.
- `search`
  Cookbook search input.
- `plannedRecipesState`
  Flat list of planned recipes and excluded ingredient keys.
- `recipeNotes`
  Per-recipe user notes stored in memory.
- `ingredientPickerOpen`
  Whether the planner ingredient exclusion modal is open.
- `ingredientSelection`
  Which ingredients are excluded for the currently edited planned recipe.
- `pickerRecipeId`
  Which recipe the ingredient picker currently targets.
- `recipeScale`
  Active scale factor for the recipe detail ingredient list.
- `importUrl`
  URL currently entered in the import screen.
- `importError`
  Import failure message.
- `importStatus`
  `idle` or `loading`.
- `lastImportedRecipeTitle`
  Used for import success feedback.

## App Views

### Cookbook View

Purpose:

- browse recipes
- filter by section
- search across title, author, source, section, tags, and ingredient names

Behavior:

- recipe cards are clickable across the whole card
- keyboard support exists via `Enter` and `Space`
- each card includes `Open recipe` and `Add to meal plan`
- broken or missing images fall back to the placeholder image

### Recipe View

Purpose:

- show one selected recipe in detail
- display summary, ingredients, method, notes
- add recipe directly to planner
- scale ingredient quantities visually

Behavior:

- uses in-memory `recipeScale`
- scaling options are currently `0.5x`, `1x`, `2x`, and `3x`
- scaling is visual only and does not mutate underlying recipe data
- notes are editable and stored in React state only

### Planner View

Purpose:

- maintain a flat list of recipes to make

Behavior:

- recipes are not attached to dates or days anymore
- cards show image, summary, metadata
- hovering or focusing reveals a preview containing summary and ingredients
- users can remove individual planned recipes
- users can clear the entire plan

### Shopping List View

Purpose:

- derive groceries from planned recipes

Behavior:

- built entirely from planner state
- excluded ingredients do not appear
- items are grouped by inferred aisle
- there is no ingredient deduplication/merging logic yet
- shopping checkboxes are UI-only and not persisted

### Import View

Purpose:

- create a recipe from a remote URL

Behavior:

- sends the URL to `/api/import-recipe`
- converts the returned payload into the local `Recipe` shape
- adds the imported recipe to `recipeLibrary`
- switches directly to the new recipe detail view

The seeded default import URL is the Guardian sweetcorn hiyashi recipe used during initial development.

## Planner Model

Planner entries use this shape:

```ts
type PlannedRecipe = {
  recipeId: string
  excludedIngredientKeys: string[]
}
```

Excluded ingredients are tracked using a derived key:

```ts
${ingredient.item}__${ingredient.amount}
```

That is simple and practical for a prototype, but it has some limits:

- two identical ingredients in the same recipe could collide
- changes to amount formatting would change the exclusion key

## Ingredient Parsing

Ingredient parsing is shared by local recipes and URL-imported recipes after import conversion.

The parser in [src/recipes.ts](/home/martin/Dropbox/codex_test/saffron_clone/src/recipes.ts) tries to split an ingredient into:

- `amount`
- `item`
- `aisle`

Supported quantity patterns include:

- integers
- decimals
- vulgar fractions like `½`
- simple fractions like `1/2`
- mixed numbers like `4 1/2`
- ranges
- standard units like `g`, `kg`, `ml`, `l`, `tsp`, `tbsp`, `cups`, etc.
- dimension formats like `2 cm x 2 cm piece`

If parsing fails, the full ingredient line is preserved as the `item` and `amount` is left empty.

This is important: the system prefers partial structure over destructive parsing.

## Ingredient Scaling

Scaling logic lives in [src/App.tsx](/home/martin/Dropbox/codex_test/saffron_clone/src/App.tsx).

It currently:

- parses numeric tokens from the amount string
- scales them by the selected multiplier
- formats the result back into a readable string
- supports fractions and mixed fractions

Examples that scale reasonably:

- `1` -> `1/2` at `0.5x`
- `4 tbsp` -> `2 tbsp` at `0.5x`
- `600 g` -> `300 g` at `0.5x`
- `4 1/2 tsp` -> `2 1/4 tsp` at `0.5x`

Limitations:

- only the parsed numeric portion is scaled
- semantic cooking language like `to taste` is untouched
- text-heavy ingredient formats may still be awkward after scaling

## Aisle Inference

Shopping list grouping is heuristic. `inferAisle()` in [src/recipes.ts](/home/martin/Dropbox/codex_test/saffron_clone/src/recipes.ts) maps ingredient text into one of several aisle buckets:

- `Produce`
- `Spices`
- `Baking`
- `Pasta & Rice`
- `Grains & Beans`
- `Dairy & Chilled`
- `Canned & Jarred`
- `Condiments`
- `Nuts & Seeds`
- fallback `Pantry`

This is keyword-based and intentionally approximate.

## Recipe Import Pipeline

The URL import flow is:

1. User opens the `Import` tab.
2. User pastes a URL.
3. The app posts to `POST /api/import-recipe`.
4. Vite middleware receives the request in [src/recipeApi.ts](/home/martin/Dropbox/codex_test/saffron_clone/src/recipeApi.ts).
5. `importRecipeFromUrl()` in [src/recipeImport.ts](/home/martin/Dropbox/codex_test/saffron_clone/src/recipeImport.ts) fetches the page server-side.
6. The HTML is scanned for `application/ld+json`.
7. The extractor flattens graphs and selects the first `Recipe` node it can find.
8. Structured fields are normalized into `ImportedRecipePayload`.
9. The frontend converts that payload into the app’s `Recipe` type via `buildImportedRecipe()`.
10. The imported recipe is appended to `recipeLibrary` in memory and opened in the recipe view.

## Vite Server Integration

The Vite config in [vite.config.ts](/home/martin/Dropbox/codex_test/saffron_clone/vite.config.ts) registers a custom plugin named `recipe-import-api`.

It hooks into:

- `configureServer`
- `configurePreviewServer`

That means the import route works in:

- `npm run dev`
- `vite preview`

It is not yet a standalone production backend.

## Assets

Key public assets:

- [public/recipe-placeholder.svg](/home/martin/Dropbox/codex_test/saffron_clone/public/recipe-placeholder.svg)
  Used as the fallback image when a recipe has no image or an image request fails.

Images can come from:

- local `source_images/...`
- remote imported image URLs
- the placeholder SVG

## External Dependency Notes

The main non-default runtime dependency added for import logic is:

- `cheerio`

It is used in [src/recipeImport.ts](/home/martin/Dropbox/codex_test/saffron_clone/src/recipeImport.ts) to:

- parse HTML
- read JSON-LD blocks
- decode HTML entities
- inspect meta tags for site naming

## Known Behavior and Tradeoffs

### Importer prefers schema over visible page text

This is deliberate for now. The importer prioritizes embedded `Recipe` schema because it is usually more structured and more reliable than scraping page layout.

Consequences:

- imported title may differ from page headline
- imported summary may come from recipe description instead of standfirst
- imported source is usually site-level or schema-level naming

### Time is flattened

The imported app shape stores one `time` string, not structured prep/cook/total fields. This loses detail when pages provide several time components.

### Imported recipes are temporary

URL-imported recipes are not saved back to `source_recipes` or any database.

### Shopping list items are not merged

If two planned recipes both require the same ingredient, the current shopping list will show both lines separately.

### Recipe import depends on access to source HTML

If a publisher blocks requests or returns a paywall/access error, the importer currently fails rather than falling back to another extraction strategy.

### Large bundle size

Because all local text recipes are bundled eagerly into the client, the built JS bundle is relatively large. Vite currently warns about chunk size during production builds.

## Sweetcorn Import Testing Results

The importer was recently tested against multiple sweetcorn recipes from different publishers using separate isolated subagents.

Tested successfully:

- Guardian
- BBC Good Food
- Jamie Oliver
- Minimalist Baker

Findings:

- structure generally matched well across publishers
- BBC Good Food exposed a bug where numeric `recipeYield` was not handled
- Minimalist Baker exposed entity cleanup issues such as `&nbsp;`

Both of those issues were fixed in [src/recipeImport.ts](/home/martin/Dropbox/codex_test/saffron_clone/src/recipeImport.ts).

Additional observed limitation:

- Serious Eats returned an HTTP `402` during testing, so the importer currently fails cleanly on blocked pages but does not recover from them

## Current Development Status

The app is still a prototype, but the current structure is coherent:

- local seed library works
- imported recipes use the same internal recipe type
- planner and shopping flows are connected
- UI supports browsing, reading, planning, and importing

The biggest architectural pressure points at the moment are:

- `App.tsx` is doing too much and should eventually be split into components
- imported recipes are not persisted
- the client bundle includes the entire local recipe library
- import extraction is schema-dependent and not yet layered with fallbacks

## Suggested Next Refactors

If this project keeps growing, the highest-value next structural changes would be:

- split [src/App.tsx](/home/martin/Dropbox/codex_test/saffron_clone/src/App.tsx) into feature components
- move planner and shopping logic into separate hooks or modules
- add persistence for imported recipes and notes
- add a real backend instead of Vite middleware for import
- store structured prep/cook/total time instead of flattening to one string
- add shopping list deduplication and quantity aggregation
- add component tests around the importer and ingredient parsing edge cases

## Quick File Map

- [src/App.tsx](/home/martin/Dropbox/codex_test/saffron_clone/src/App.tsx)
  Main UI and app state.
- [src/App.css](/home/martin/Dropbox/codex_test/saffron_clone/src/App.css)
  Main app styles.
- [src/index.css](/home/martin/Dropbox/codex_test/saffron_clone/src/index.css)
  Global styles.
- [src/recipes.ts](/home/martin/Dropbox/codex_test/saffron_clone/src/recipes.ts)
  Local recipe loading, parsing, ingredient splitting, aisle inference.
- [src/recipeImport.ts](/home/martin/Dropbox/codex_test/saffron_clone/src/recipeImport.ts)
  URL import extraction and normalization.
- [src/recipeApi.ts](/home/martin/Dropbox/codex_test/saffron_clone/src/recipeApi.ts)
  Import API route.
- [vite.config.ts](/home/martin/Dropbox/codex_test/saffron_clone/vite.config.ts)
  Vite config and server middleware registration.
- [scripts/fill-recipe-images.mjs](/home/martin/Dropbox/codex_test/saffron_clone/scripts/fill-recipe-images.mjs)
  Image field population utility.
- [public/recipe-placeholder.svg](/home/martin/Dropbox/codex_test/saffron_clone/public/recipe-placeholder.svg)
  Fallback recipe image.
