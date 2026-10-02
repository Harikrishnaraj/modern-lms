import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Playwright's own Node process doesn't load .env.local the way `next
// build`/`next start` does, but the setup/teardown specs need
// SUPABASE_SERVICE_ROLE_KEY to create/delete a test user via the admin API.
// In CI there is no .env.local: the values come from repository secrets as
// real environment variables, which always win over the file.
export function loadEnvLocal() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.resolve(here, "../../../.env.local");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    if (!line.includes("=") || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (value && !(key in process.env)) process.env[key] = value;
  }
}
