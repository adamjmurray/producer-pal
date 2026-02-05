#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "../..");

interface DirectoryConfig {
  name: string;
  excludeDirs?: string[];
  excludeFiles?: string[];
}

/**
 * Check a directory for JavaScript files that should be TypeScript
 * @param config - Directory configuration with exclusions
 * @returns Array of found JS files, or empty array if none
 */
function findJsFiles(config: DirectoryConfig): string[] {
  const { name: dir, excludeDirs = [], excludeFiles = [] } = config;
  const excludeDirArgs = excludeDirs.map((p) => `! -path "*/${p}/*"`).join(" ");
  const excludeFileArgs = excludeFiles.map((f) => `! -path "${f}"`).join(" ");
  const excludeArgs = [excludeDirArgs, excludeFileArgs]
    .filter(Boolean)
    .join(" ");
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

// Check webui/, scripts/, and src/ directories
const directories: DirectoryConfig[] = [
  { name: "webui", excludeDirs: ["node_modules"] },
  { name: "scripts", excludeDirs: ["chat-lib"] },
  {
    name: "src",
    excludeFiles: ["*/generated-*-parser.js"],
  },
];

let hasViolations = false;

for (const config of directories) {
  const files = findJsFiles(config);
  const { name } = config;

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
