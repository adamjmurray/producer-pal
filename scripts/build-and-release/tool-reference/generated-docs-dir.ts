// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Where the docs site's generated markdown partials go. Shared by the
// generators that write them; the directory itself is gitignored.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const GENERATED_DOCS_DIR = path.join(HERE, "../../../docs/_generated");

/**
 * Write one generated partial, creating the output directory if needed.
 * @param filename - File name within docs/_generated
 * @param content - Markdown to write
 * @returns Nothing; resolves once the file is on disk
 */
export async function writeDocPartial(
  filename: string,
  content: string,
): Promise<void> {
  await fs.mkdir(GENERATED_DOCS_DIR, { recursive: true });
  await fs.writeFile(path.join(GENERATED_DOCS_DIR, filename), content);
}
