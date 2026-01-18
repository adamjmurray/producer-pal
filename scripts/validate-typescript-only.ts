#!/usr/bin/env node
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

/**
 * Check a directory for JavaScript files that should be TypeScript
 * @param dir - Directory to check
 * @param excludePaths - Paths to exclude from the search
 * @returns Array of found JS files, or empty array if none
 */
function findJsFiles(dir: string, excludePaths: string[] = []): string[] {
  const excludeArgs = excludePaths.map((p) => `! -path "*/${p}/*"`).join(" ");
  const cmd = `find ${dir} -type f \\( -name "*.js" -o -name "*.jsx" -o -name "*.cjs" -o -name "*.mjs" \\) ${excludeArgs}`;

  try {
    const result = execSync(cmd, {
      cwd: rootDir,
      encoding: "utf8",
    }).trim();

    return result ? result.split("\n").filter(Boolean) : [];
  } catch (e) {
    const error = e as Error & { status?: number; stdout?: string };

    // find returns non-zero when no matches - treat as empty result
    if (error.status === 0 || error.stdout?.trim() === "") {
      return [];
    }

    throw error;
  }
}

// Check both webui/ and scripts/ directories
const directories = [
  { name: "webui", excludes: ["node_modules"] },
  { name: "scripts", excludes: ["chat-lib"] },
];

let hasViolations = false;

for (const { name, excludes } of directories) {
  const files = findJsFiles(name, excludes);

  if (files.length > 0) {
    hasViolations = true;
    console.error(`\n❌ JavaScript files found in ${name}/ directory\n`);
    console.error(
      `The ${name} directory must contain only TypeScript files.\n`,
    );
    console.error("Found the following violations:\n");

    for (const file of files) {
      console.error(`  - ${file}`);
    }

    console.error(
      "\nPlease convert these files to TypeScript or remove them.\n",
    );
  } else {
    console.log(`✓ No JavaScript files found in ${name}/`);
  }
}

if (hasViolations) {
  process.exit(1);
}
