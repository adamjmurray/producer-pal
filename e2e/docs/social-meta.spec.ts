// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { DIST_DIR, parseSitemap, SITE_URL } from "./docs-test-helpers.ts";

const SOCIAL_IMAGE = `${SITE_URL}/producer-pal-social-card.png`;

/**
 * Read every `<meta>` tag in a built page, keyed by its `property` or `name`.
 * Values are arrays so the tests can catch duplicate tags — two og:titles make
 * the preview a coin flip.
 * @param html the page's built HTML
 * @returns each meta key mapped to every content value found for it
 */
function readMetaTags(html: string): Map<string, string[]> {
  const tags = new Map<string, string[]>();

  for (const [, attrs] of html.matchAll(/<meta\s([^>]*)>/g)) {
    if (attrs == null) continue;

    const key =
      /(?:property|name)="([^"]+)"/.exec(attrs)?.[1] ??
      /(?:property|name)='([^']+)'/.exec(attrs)?.[1];
    const content =
      /content="([^"]*)"/.exec(attrs)?.[1] ??
      /content='([^']*)'/.exec(attrs)?.[1];

    if (key == null || content == null) continue;

    tags.set(key, [...(tags.get(key) ?? []), content]);
  }

  return tags;
}

/**
 * Read the canonical URL from a built page.
 * @param html the page's built HTML
 * @returns the canonical href, or undefined when the page has none
 */
function readCanonical(html: string): string | undefined {
  const link = /<link\s[^>]*rel="canonical"[^>]*>/.exec(html)?.[0];

  return link == null ? undefined : /href="([^"]+)"/.exec(link)?.[1];
}

/**
 * Map a site URL to the HTML file the build produced for it.
 * @param absoluteUrl a sitemap URL
 * @returns the absolute path of the built HTML file
 */
function toDistPath(absoluteUrl: string): string {
  const path = new URL(absoluteUrl).pathname.replace(/^\//, "");

  return join(DIST_DIR, path === "" ? "index.html" : `${path}.html`);
}

test.describe("Social sharing meta tags", () => {
  for (const absoluteUrl of parseSitemap()) {
    const route = new URL(absoluteUrl).pathname;

    test(`${route} - has per-page OG tags`, () => {
      const html = readFileSync(toDistPath(absoluteUrl), "utf-8");
      const meta = readMetaTags(html);
      const canonical = readCanonical(html);

      // One value each, or the preview depends on which tag the crawler reads
      // first. VitePress dedupes page overrides against the site-wide `head`,
      // and this is what catches that silently breaking.
      for (const key of ["og:title", "og:description", "og:url"]) {
        expect(meta.get(key), `${key} on ${route}`).toHaveLength(1);
        expect(meta.get(key)?.[0], `${key} on ${route}`).toBeTruthy();
      }

      // og:url is the URL Facebook and Discord resolve a share to, so it has
      // to track the canonical rather than pointing everything at the homepage.
      expect(meta.get("og:url")?.[0], `og:url on ${route}`).toBe(canonical);

      // Every page needs its own title, or deep links preview as the homepage.
      const homeTitle = readMetaTags(
        readFileSync(join(DIST_DIR, "index.html"), "utf-8"),
      ).get("og:title")?.[0];

      if (route !== "/") {
        expect(meta.get("og:title")?.[0], `og:title on ${route}`).not.toBe(
          homeTitle,
        );
      }

      // twitter:* would override the og:* fallback on X. Only twitter:card
      // belongs here — anything else drifts out of sync with the og tags.
      const twitterKeys = [...meta.keys()].filter((key) =>
        key.startsWith("twitter:"),
      );

      expect(twitterKeys, `twitter tags on ${route}`).toEqual(["twitter:card"]);
      expect(meta.get("twitter:card")?.[0]).toBe("summary_large_image");

      // summary_large_image needs a 2:1 image; a square gets cropped or
      // downgraded to a small card.
      expect(meta.get("og:image")?.[0]).toBe(SOCIAL_IMAGE);
      expect(meta.get("og:image:width")?.[0]).toBe("1200");
      expect(meta.get("og:image:height")?.[0]).toBe("630");
      expect(meta.get("og:image:alt")?.[0]).toBeTruthy();
    });
  }
});
