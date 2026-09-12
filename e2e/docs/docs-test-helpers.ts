// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** The built docs site, shared by every spec that reads it off disk. */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Where `npm run docs:build` puts the site. */
export const DIST_DIR = join(
  __dirname,
  "..",
  "..",
  "docs",
  ".vitepress",
  "dist",
);

/** The canonical origin the built pages and sitemap use. */
export const SITE_URL = "https://producer-pal.org";

/**
 * List every page URL in the built sitemap.
 * @returns the sitemap's absolute page URLs
 */
export function parseSitemap(): string[] {
  const sitemapPath = join(DIST_DIR, "sitemap.xml");
  const xml = readFileSync(sitemapPath, "utf-8");
  const urls = Array.from(
    xml.matchAll(/<loc>(.*?)<\/loc>/g),
    (match) => match[1],
  ).filter((url): url is string => url != null);

  if (urls.length === 0) {
    throw new Error(
      `No URLs found in sitemap at ${sitemapPath}. ` +
        `Build the docs with 'npm run docs:build' first.`,
    );
  }

  return urls;
}
