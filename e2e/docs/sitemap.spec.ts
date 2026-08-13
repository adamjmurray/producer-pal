// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DIST_DIR = join(__dirname, "..", "..", "docs", ".vitepress", "dist");

// Known external domains that are allowed
const ALLOWED_EXTERNAL_DOMAINS = [
  "adammurray.link",
  "ai.google.dev",
  "anthropic.com",
  "antigravity.google",
  "chatgpt.com",
  "claude.ai",
  "cline.bot",
  "cloudflare.com",
  "docs.claude.com",
  "docs.cycling74.com",
  "console.mistral.ai",
  "discord.gg",
  "forms.gle",
  "geminicli.com",
  "github.com",
  "google.com",
  "groq.com",
  "json-schema.org",
  "lmstudio.ai",
  "mistral.ai",
  "modelcontextprotocol.io",
  "ngrok.com",
  "nodejs.org",
  "npmjs.com",
  "ollama.com",
  "openai.com",
  "openrouter.ai",
  "pinggy.io",
  // Our own canonical site. The skills (embedded into /features) link to it
  // with absolute URLs because relative links wouldn't resolve in the chat UI.
  "producer-pal.org",
  "en.wikipedia.org",
  "www.ableton.com",
  "www.youtube.com",
];

/**
 * Parse sitemap.xml and extract all URLs
 */
function parseSitemap(): string[] {
  const sitemapPath = join(
    __dirname,
    "..",
    "..",
    "docs",
    ".vitepress",
    "dist",
    "sitemap.xml",
  );
  const sitemapContent = readFileSync(sitemapPath, "utf-8");

  // Extract all <loc> URLs from sitemap
  const urlMatches = sitemapContent.matchAll(/<loc>(.*?)<\/loc>/g);
  const urls = Array.from(urlMatches, (match) => match[1]).filter(
    (url): url is string => url != null,
  );

  if (urls.length === 0) {
    throw new Error(
      `No URLs found in sitemap at ${sitemapPath}. ` +
        `Ensure docs are built with 'npm run docs:build' before running tests.`,
    );
  }

  return urls;
}

/**
 * Convert absolute URL to relative path for local testing
 */
function toRelativePath(absoluteUrl: string): string {
  const url = new URL(absoluteUrl);

  return url.pathname;
}

/**
 * Normalize a site path to the route key used by the anchor index
 */
function normalizeRoute(path: string): string {
  const trimmed = path.replace(/\/$/, "");

  return trimmed === "" ? "/" : trimmed;
}

/**
 * Index every element id in the built HTML, keyed by route. The sitemap only
 * tracks pages, so this is what lets us validate `#anchor` fragments — without
 * it a link to a renamed or deleted heading lands silently at the top of the
 * page and no test notices.
 */
function buildAnchorIndex(): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (!entry.name.endsWith(".html")) continue;

      const html = readFileSync(fullPath, "utf-8");
      const ids = new Set(
        Array.from(html.matchAll(/id="([^"]+)"/g), (match) => match[1]).filter(
          (id): id is string => id != null,
        ),
      );
      const route = `/${relative(DIST_DIR, fullPath)
        .replace(/\.html$/, "")
        .replace(/(^|\/)index$/, "")}`;

      index.set(normalizeRoute(route), ids);
    }
  };

  walk(DIST_DIR);

  if (index.size === 0) {
    throw new Error(
      `No HTML pages found in ${DIST_DIR}. ` +
        `Ensure docs are built with 'npm run docs:build' before running tests.`,
    );
  }

  return index;
}

/**
 * Validate an internal link's `#anchor` fragment against the target page's ids.
 * Returns an error message, or null when the link has no fragment or is valid.
 */
function checkAnchor(
  href: string,
  currentPath: string,
  anchorIndex: Map<string, Set<string>>,
): string | null {
  const hashIndex = href.indexOf("#");

  if (hashIndex === -1) return null;

  const rawFragment = href.slice(hashIndex + 1);

  if (rawFragment === "") return null;

  let fragment = rawFragment;

  try {
    fragment = decodeURIComponent(rawFragment);
  } catch {
    // Leave the fragment as-is when it isn't valid percent-encoding
  }

  // An empty path means a same-page link, e.g. href="#transforms". Otherwise
  // resolve against the current page so relative hrefs ("./lm-studio#tips")
  // land on the same route the browser would navigate to.
  const pathPart = href.slice(0, hashIndex);
  const targetPath =
    pathPart === ""
      ? currentPath
      : new URL(pathPart, `http://localhost${currentPath}`).pathname;
  const ids = anchorIndex.get(normalizeRoute(targetPath));

  if (ids == null) return `Anchor link to unknown page: ${href}`;

  if (!ids.has(fragment)) {
    return `Dead anchor: ${href} (no element with id="${fragment}" on ${normalizeRoute(targetPath)})`;
  }

  return null;
}

/**
 * Check if a URL is external
 */
function isExternalUrl(href: string): boolean {
  try {
    const url = new URL(href, "http://localhost");

    return url.hostname !== "localhost";
  } catch {
    return false;
  }
}

/**
 * Check if external domain is allowed
 */
function isAllowedExternalDomain(href: string): boolean {
  try {
    const url = new URL(href);

    return ALLOWED_EXTERNAL_DOMAINS.some((domain) =>
      url.hostname.includes(domain),
    );
  } catch {
    return false;
  }
}

/**
 * Normalize URL for comparison with sitemap
 */
function normalizeUrlForSitemap(
  href: string,
  baseUrl = "https://producer-pal.org",
): string | null {
  try {
    // Handle hash-only links (same page)
    if (href.startsWith("#")) {
      return null; // Skip hash links
    }

    // Handle relative URLs (strip hash fragment for sitemap comparison)
    if (href.startsWith("/")) {
      const pathWithoutHash = href.split("#")[0];

      return baseUrl + pathWithoutHash;
    }

    // Handle absolute URLs
    const url = new URL(href);

    if (url.hostname === "producer-pal.org" || url.hostname === "localhost") {
      // Strip hash fragment for sitemap comparison
      return baseUrl + url.pathname;
    }

    return href;
  } catch {
    return null;
  }
}

let sitemapUrls: string[] = [];
let anchorIndex: Map<string, Set<string>> = new Map();
let consoleErrors: string[] = [];
let consoleWarnings: string[] = [];

test.describe("Docs Site Sitemap Tests", () => {
  test.beforeAll(() => {
    sitemapUrls = parseSitemap();
    anchorIndex = buildAnchorIndex();
  });

  test.beforeEach(({ page }) => {
    consoleErrors = [];
    consoleWarnings = [];

    // Listen to console events
    page.on("console", (msg) => {
      const type = msg.type();
      const text = msg.text();

      if (type === "error") {
        // Filter out 404 errors (tracked via response failures) and VitePress hydration mismatches
        if (!text.includes("404") && !text.includes("Hydration")) {
          consoleErrors.push(text);
        }
      } else if (type === "warning") {
        // Filter out browser feature detection warnings (platform-dependent)
        if (!text.includes("Unrecognized feature:")) {
          consoleWarnings.push(text);
        }
      }
    });

    // Listen to page errors
    page.on("pageerror", (error) => {
      consoleErrors.push(error.message);
    });

    // Listen to failed responses to track 404s with URLs
    page.on("response", (response) => {
      if (response.status() === 404) {
        const url = response.url();

        // Ignore favicon 404s - these are common and usually acceptable
        if (!url.includes("favicon.ico")) {
          consoleErrors.push(`404 Not Found: ${url}`);
        }
      }
    });
  });

  // Test each page in the sitemap
  for (const absoluteUrl of parseSitemap()) {
    const relativePath = toRelativePath(absoluteUrl);

    test(`${relativePath} - should load with nav links and valid links`, async ({
      page,
    }) => {
      // Navigate to the page
      await page.goto(relativePath);

      // Check that the page loads (title should be present)
      const title = await page.title();

      expect(title).toBeTruthy();
      expect(title).not.toBe("");

      // Check for navigation links
      const navLinks = await page.locator("nav a").count();

      expect(navLinks).toBeGreaterThan(0);

      // Verify no console errors or warnings
      expect(consoleErrors, `Console errors on ${relativePath}`).toEqual([]);
      expect(consoleWarnings, `Console warnings on ${relativePath}`).toEqual(
        [],
      );

      // Get all links on the page
      const links = await page.locator("a[href]").all();
      const linkValidationErrors: string[] = [];

      for (const link of links) {
        const href = await link.getAttribute("href");

        if (!href) continue;

        if (href.startsWith("mailto:")) continue;
        if ((await link.getAttribute("download")) != null) continue;

        // Validate the #anchor fragment of same-page and internal links. The
        // sitemap check below only sees the path, so without this a link to a
        // renamed heading passes while silently scrolling nowhere.
        if (!isExternalUrl(href)) {
          const anchorError = checkAnchor(href, relativePath, anchorIndex);

          if (anchorError) linkValidationErrors.push(anchorError);
        }

        // Hash-only links are same-page: fully validated by checkAnchor above
        if (href.startsWith("#")) continue;

        // Check if it's an external link
        if (isExternalUrl(href)) {
          // Verify it's an allowed external domain
          if (!isAllowedExternalDomain(href)) {
            linkValidationErrors.push(
              `Unknown external link: ${href} (allowed domains: ${ALLOWED_EXTERNAL_DOMAINS.join(", ")})`,
            );
          }
        } else {
          // It's an internal link - verify it's in the sitemap
          const normalizedUrl = normalizeUrlForSitemap(href);

          if (normalizedUrl && !sitemapUrls.includes(normalizedUrl)) {
            linkValidationErrors.push(
              `Internal link not in sitemap: ${href} (normalized: ${normalizedUrl})`,
            );
          }

          // Verify no trailing slash (clean URLs)
          if (href.endsWith("/") && href !== "/") {
            linkValidationErrors.push(
              `Internal link has trailing slash: ${href}`,
            );
          }
        }
      }

      // Assert no link validation errors
      expect(
        linkValidationErrors,
        `Link validation errors on ${relativePath}`,
      ).toEqual([]);
    });
  }
});
