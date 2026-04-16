#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Generates resolved markdown files for download from the docs site.
 *
 * Reads each docs .md file, expands include directives (<<< code snippets
 * and @include markdown partials), strips frontmatter, and writes to
 * docs/public/markdown/ for static serving.
 */

import { existsSync, readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, "..");
const DOCS_DIR = path.join(PROJECT_ROOT, "docs");
const OUTPUT_DIR = path.join(DOCS_DIR, "public/markdown");

/**
 * Resolve all include directives in markdown content.
 *
 * @param content - Raw markdown content
 * @param fileDir - Directory of the source markdown file
 * @returns Markdown with includes expanded
 */
function resolveIncludes(content: string, fileDir: string): string {
  // Resolve <<< code snippet includes
  // Pattern: <<< path/to/file{lang} or <<< path/to/file
  content = content.replaceAll(
    /^<<<\s+(.+?)(?:{(\w+)})?\s*$/gm,
    (_match, filePath: string, lang: string | undefined) => {
      const resolvedPath = path.resolve(fileDir, filePath.trim());

      if (!existsSync(resolvedPath)) {
        return `<!-- File not found: ${filePath} -->`;
      }

      const fileContent = readFileSync(resolvedPath, "utf-8");
      const extension = lang ?? path.extname(resolvedPath).slice(1);

      return `\`\`\`${extension}\n${fileContent.trimEnd()}\n\`\`\``;
    },
  );

  // Resolve <!--@include: path--> markdown includes
  content = content.replaceAll(
    /<!--@include:\s*(.+?)-->/g,
    (_match, filePath: string) => {
      const resolvedPath = path.resolve(fileDir, filePath.trim());

      if (!existsSync(resolvedPath)) {
        return `<!-- File not found: ${filePath} -->`;
      }

      return readFileSync(resolvedPath, "utf-8").trimEnd();
    },
  );

  return content;
}

/**
 * Strip YAML frontmatter from markdown content.
 *
 * @param content - Markdown content possibly starting with frontmatter
 * @returns Content without frontmatter
 */
function stripFrontmatter(content: string): string {
  return content.replace(/^---\n[\S\s]*?\n---\n*/, "");
}

/**
 * Generate resolved markdown files for all docs pages.
 */
async function main(): Promise<void> {
  const allFiles = await fs.readdir(DOCS_DIR, { recursive: true });
  const files = allFiles
    .filter(
      (f) =>
        f.endsWith(".md") &&
        !f.startsWith("_generated") &&
        !f.startsWith("node_modules") &&
        !f.startsWith("public") &&
        !f.startsWith(".vitepress"),
    )
    .map(String);

  await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  let count = 0;

  for (const file of files) {
    const sourcePath = path.join(DOCS_DIR, file);
    const content = await fs.readFile(sourcePath, "utf-8");
    const fileDir = path.dirname(sourcePath);

    const resolved = stripFrontmatter(resolveIncludes(content, fileDir));
    const outputPath = path.join(OUTPUT_DIR, file);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, resolved);
    count++;
  }

  console.log(`Generated ${count} markdown files in docs/public/markdown/`);
}

await main();
