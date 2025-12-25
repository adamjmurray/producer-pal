# Documentation Site Tests

This directory contains Playwright tests for the VitePress documentation site.

## Overview

The tests validate that all pages in the generated sitemap:

- Load successfully with navigation links
- Have no console errors or warnings
- Contain only valid links (internal links must be in the sitemap, external
  links must be from known domains)
- Don't have trailing slashes (enforcing clean URL format)

## Running Tests

```bash
# Build docs and run all tests
npm run docs:test

# Run tests with UI mode (for debugging)
npm run docs:test:dev

# Run tests in headed mode (visible browser)
npm run docs:test:headed
```

## Test Configuration

- **Config file**: `config/playwright.docs.config.mjs`
- **Browser**: Chromium (headless)
- **Workers**: Limited to 2 for stability
- **Test files**: `tests/docs/*.spec.mjs`

## What the Tests Check

### 1. Page Loading

- Each page from the sitemap loads successfully
- Page has a title
- Navigation links are present

### 2. Console Monitoring

- No JavaScript errors
- No console warnings
- 404 errors are tracked with full URLs (favicon excluded)

### 3. Link Validation

**Internal Links:**

- Must exist in the sitemap (after stripping hash fragments)
- Must not have trailing slashes
- Hash-only links (#section) are allowed

**External Links:**

- Must be from allowed domains:
  - github.com
  - adammurray.link
  - npmjs.com
  - anthropic.com
  - openai.com
  - google.com
  - cloudflare.com
  - pinggy.io
  - ngrok.com

## Adding New External Domains

If you add links to new external domains in the documentation, update the
`ALLOWED_EXTERNAL_DOMAINS` array in `tests/docs/sitemap.spec.mjs`:

```javascript
const ALLOWED_EXTERNAL_DOMAINS = [
  "github.com",
  "your-new-domain.com", // Add new domains here
  // ...
];
```

## Troubleshooting

### Browser Crashes in Containerized Environments

The tests may have difficulty running in highly constrained environments (like
some CI containers) due to Chromium's resource requirements. The Playwright
config includes flags to disable sandboxing and GPU acceleration to help with
this:

```javascript
launchOptions: {
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
  ],
}
```

### Test Failures

Common reasons for test failures:

1. **404 Errors**: Check the console error output to see which resources are
   missing
2. **Unknown External Links**: Add the domain to `ALLOWED_EXTERNAL_DOMAINS`
3. **Internal Link Not in Sitemap**: Ensure the linked page exists and is
   included in the VitePress build
4. **Trailing Slashes**: Remove trailing slashes from internal links (use
   `/page` not `/page/`)

## CI/CD Integration

The tests are designed to run in CI/CD pipelines. Set the `CI` environment
variable to enable:

- Automatic retries (2 attempts)
- Single worker (more stable)
- Non-interactive mode

```bash
CI=true npm run docs:test
```
