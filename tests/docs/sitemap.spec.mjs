import { readFileSync } from "fs";
import { join } from "path";
import { expect, test } from "@playwright/test";

// Known external domains that are allowed
const ALLOWED_EXTERNAL_DOMAINS = [
  "adammurray.link",
  "ai.google.dev",
  "anthropic.com",
  "chatgpt.com",
  "claude.ai",
  "cline.bot",
  "cloudflare.com",
  "console.mistral.ai",
  "github.com",
  "google.com",
  "groq.com",
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
  "www.ableton.com",
  "www.youtube.com",
];

/**
 * Parse sitemap.xml and extract all URLs
 */
function parseSitemap() {
  const sitemapPath = join(
    process.cwd(),
    "docs",
    ".vitepress",
    "dist",
    "sitemap.xml",
  );
  const sitemapContent = readFileSync(sitemapPath, "utf-8");

  // Extract all <loc> URLs from sitemap
  const urlMatches = sitemapContent.matchAll(/<loc>(.*?)<\/loc>/g);

  return Array.from(urlMatches, (match) => match[1]);
}

/**
 * Convert absolute URL to relative path for local testing
 */
function toRelativePath(absoluteUrl) {
  const url = new URL(absoluteUrl);

  return url.pathname;
}

/**
 * Check if a URL is external
 */
function isExternalUrl(href) {
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
function isAllowedExternalDomain(href) {
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
function normalizeUrlForSitemap(href, baseUrl = "https://producer-pal.org") {
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

test.describe("Docs Site Sitemap Tests", () => {
  let sitemapUrls;
  let consoleErrors = [];
  let consoleWarnings = [];

  test.beforeAll(() => {
    sitemapUrls = parseSitemap();
  });

  test.beforeEach(({ page }) => {
    consoleErrors = [];
    consoleWarnings = [];

    // Listen to console events
    page.on("console", (msg) => {
      const type = msg.type();
      const text = msg.text();

      if (type === "error") {
        // Filter out 404 errors - we'll track those separately via response failures
        if (!text.includes("404")) {
          consoleErrors.push(text);
        }
      } else if (type === "warning") {
        consoleWarnings.push(text);
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

      expect(navLinks).toBeGreaterThan(0, "Page should have navigation links");

      // Verify no console errors or warnings
      expect(consoleErrors, `Console errors on ${relativePath}`).toEqual([]);
      expect(consoleWarnings, `Console warnings on ${relativePath}`).toEqual(
        [],
      );

      // Get all links on the page
      const links = await page.locator("a[href]").all();
      const linkValidationErrors = [];

      for (const link of links) {
        const href = await link.getAttribute("href");

        if (!href) continue;

        // Skip hash-only links (same page anchors)
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
