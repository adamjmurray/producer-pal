#!/usr/bin/env node
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

try {
  // Find any .js, .jsx, .cjs, or .mjs files in webui/ (excluding node_modules)
  const result = execSync(
    'find webui -type f \\( -name "*.js" -o -name "*.jsx" -o -name "*.cjs" -o -name "*.mjs" \\) ! -path "*/node_modules/*"',
    {
      cwd: rootDir,
      encoding: "utf8",
    },
  ).trim();

  if (result) {
    const files = result.split("\n").filter(Boolean);

    console.error("\n❌ JavaScript files found in webui/ directory\n");
    console.error(
      "The webui directory must contain only TypeScript files (.ts/.tsx).\n",
    );
    console.error("Found the following violations:\n");
    for (const file of files) console.error(`  - ${file}`);
    console.error(
      "\nPlease convert these files to TypeScript or remove them.\n",
    );
    process.exit(1);
  }

  console.log(
    "✓ No JavaScript files found in webui/ - TypeScript-only requirement satisfied",
  );
} catch (e) {
  const error = e as Error & { status?: number; stdout?: string };

  // If find returns no results, execSync throws but we want to treat that as success
  if (error.status === 0 || error.stdout?.trim() === "") {
    console.log(
      "✓ No JavaScript files found in webui/ - TypeScript-only requirement satisfied",
    );
  } else {
    console.error("Error checking for JavaScript files:", error.message);
    process.exit(1);
  }
}
