# Pantry Pages chat API

This is a small JSON API for the existing shared Cookbook, Planner and Shopping views. It uses the same app state and recipe IDs as the browser. No separate account, database or recipe library is needed.

## Enable access

1. Deploy the app and set `PANTRY_API_TOKEN` on the Pantry Pages Railway service to a new random secret (for example, generate 32 random bytes with `openssl rand -hex 32` in your own terminal). The API is disabled without this setting. Leave browser credentials unchanged.
2. In the chat agent's runtime, set `PANTRY_API_URL` to the app origin (e.g. `https://pantry-pages-production.up.railway.app`) and `PANTRY_API_TOKEN` to the matching secret using its private environment configuration. Don't paste the token into a chat, a command argument or a committed file. Reload the runtime environment if needed.
3. In this repository run `node scripts/pantry.mjs search lentils` or `node scripts/pantry.mjs shopping` from the agent runtime. The client uses HTTPS in production and refuses redirects. An agent with terminal access can call the client directly; this is not an installed MCP server.

Use a single app process with the existing persistent `DATA_DIR`. Restart Railway with a new secret to rotate the token, or remove it to disable the API. To see chat changes in an already-open browser tab, reload it. A stale tab cannot silently overwrite newer data; if prompted, copy unsaved edits before reloading.

## Routes

Base path: `/api/v1`. Supply `Authorization: Bearer <token>`. Write bodies use `Content-Type: application/json`.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/recipes?q=lentils&limit=20&offset=0` | Search the built-in and saved recipes by title, ingredients, tags, author, source or section. Returns summaries and pagination. |
| GET | `/recipes/:id` | Full recipe, including ingredients, method, and saved notes. |
| POST | `/recipes` | Create a recipe and return it with its ID. |
| GET | `/planner` | Read the current shared plan and ingredient exclusions. |
| PUT | `/planner/:id` | Add a recipe or update its exclusions. Omitted exclusions preserve existing ones. |
| DELETE | `/planner/:id` | Remove that recipe from the plan, not from the Cookbook. |
| GET | `/shopping` | Read `toCheck`, `needToBuy` grouped by aisle, and `bought`. New planned ingredients appear in `toCheck`, just like in the UI. |

To create a recipe, pass a JSON file to `node scripts/pantry.mjs create <recipe.json>`. The body needs `title`, `ingredients` (one ingredient line per string), and `steps` (one step per string). Optional fields: `author`, `source`, `section`, `tags` (array), `time`, `servings`, and `summary`. Each successful POST creates a new recipe; after a timeout, search before retrying. To plan it, use `node scripts/pantry.mjs plan-add <id>` with the returned ID. The API also accepts `excludedIngredientKeys` on planner PUT, using `<item>__<amount>` from the recipe details. An empty array clears exclusions.

The token grants access only to these endpoints, not to browser sessions or to the full-state endpoint. There is no recipe deletion, full-state replacement, or external URL fetching through this API.

## Local test

The production-style server (`npm start`) exposes the chat API; Vite preview does not. `npx tsx tests/chatApi.test.ts` starts a disposable server and uses temporary data and tokens, without touching Railway or the local app data.
