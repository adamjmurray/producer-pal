# Documentation Site

## Overview

Producer Pal's documentation is built with VitePress and deployed to
https://producer-pal.org. The source files are in the `docs/` directory.

VitePress is a static site generator optimized for documentation, built on top
of Vite and Vue. It provides:

- Markdown-based content with frontmatter
- Built-in search
- Responsive design with light/dark themes
- Fast hot module replacement during development
- Optimized static site generation

## Development Workflow

### Development Server

```bash
npm run docs:dev
```

Runs `docs:generate`, then starts the VitePress dev server at
http://localhost:5174 with hot reload. Changes to markdown files in `docs/`
update automatically in the browser.

### Generated Content

```bash
npm run docs:generate
```

Builds the generated pages and assets: the tool reference (schemas and example
output, run from the real tools), the plain-markdown copies in
`docs/public/markdown/`, and the skill downloads. `docs:dev` and `docs:build`
run it for you. The outputs (`docs/_generated`, `docs/public/markdown`,
`docs/public/downloads`) are gitignored.

### Production Build

```bash
npm run docs:build
```

Runs `docs:generate`, then builds the static site to `docs/.vitepress/dist/`.

### Preview Production Build

```bash
npm run docs:preview
```

Serves the built site locally to test the production build before deploying.

## Deployment

The site is built two ways, both with `npm run docs:build`:

- **Netlify**: configured in `netlify.toml` (publishes `docs/.vitepress/dist`).
  Its `ignore` command skips a build when nothing relevant changed. Keep that
  path list in step with the `paths` filter in `deploy-docs.yml`, or one site
  serves a stale copy.
- **GitHub Pages**: `.github/workflows/deploy-docs.yml` deploys when changes are
  pushed to `main`.

### GitHub Pages Configuration

- **Deployment**: Handled by GitHub Actions workflow
  (`.github/workflows/deploy-docs.yml`)
- **Source**: `docs/.vitepress/dist/` directory
- **Branch**: Deploys from `main` branch
- **Build**: GitHub Actions runs `npm run docs:build` on push

### Custom Domain Setup

The custom domain `producer-pal.org` is configured via:

1. **CNAME file**: `docs/public/CNAME` contains `producer-pal.org`
2. **DNS configuration**: CNAME record points `producer-pal.org` to
   `adamjmurray.github.io`
3. **GitHub Pages settings**: Repository settings → Pages → Custom domain set to
   `producer-pal.org`

VitePress copies files from `docs/public/` to the build output, so the CNAME
file is included in the deployed site.

## VitePress Configuration

### Config File

The main configuration file is `docs/.vitepress/config.ts`. This TypeScript file
configures:

- Site metadata (title, description)
- Navigation sidebar and top nav
- Theme settings
- Build options
- Markdown extensions

### Theme Customization

Custom theme files are in `docs/.vitepress/theme/`:

- `index.ts` - Theme entry point
- `*.css` - Custom CSS overrides and additions, split by area

### Public Assets

Static assets (images, logos, CNAME, etc.) are stored in `docs/public/`. These
files are copied to the root of the build output.

### Directory Structure

```
docs/
├── .vitepress/
│   ├── config.ts           # Main configuration
│   ├── theme/              # Theme customization (index.ts + CSS and Vue files)
│   ├── cache/              # Build cache (gitignored)
│   └── dist/               # Build output (gitignored)
├── public/                 # Static assets
│   ├── CNAME               # Custom domain config
│   ├── BingSiteAuth.xml    # Search engine verification
│   └── *.png, *.svg        # Images and icons
├── guide.md                # Guide section landing page
├── guide/                  # Guides (skills.md, rest-api.md, ...)
├── installation.md
├── installation/           # Per-client install guides
├── features.md
├── features/
├── how-it-works.md
├── how-it-works/
├── support.md
├── support/
├── _partials/              # Snippets included in other pages
├── index.md                # Homepage
└── roadmap.md              # Development roadmap
```

## Content Guidelines

### File Naming

- Use kebab-case for all markdown files (e.g., `chat-ui.md`)
- Group related content in subdirectories (e.g., `installation/`, `guide/`)
- Name a section's page after its folder — `docs/guide.md`, not
  `docs/guide/index.md`. The one exception is `docs/index.md`.
- URLs are clean: `/chat-ui`, not `/chat-ui.html` and no trailing slash.

### Callouts

Use VitePress containers, not blockquotes:

```markdown
::: tip Title ... :::
```

`tip`, `warning`, `info`, and `details` are available. Don't write
`> **Tip:** …`.

### Frontmatter

Each markdown file should include frontmatter with metadata:

```yaml
---
title: Page Title
description: Brief description for SEO
---
```

### Linking

- Use root-absolute clean URLs for internal links, with no `.md` extension:
  `[Chat UI](/guide/chat-ui)`, `[Tools](/features/tools#ppal-live-api)`
- Relative links (`./chat-ui`) are fine for a sibling page

### Code Blocks

Use fenced code blocks with language identifiers for syntax highlighting:

````markdown
```bash
npm run docs:dev
```
````

## Adding New Pages

1. Create a new markdown file in the appropriate directory
2. Add frontmatter with title and description
3. Update `docs/.vitepress/config.ts` to add the page to navigation:
   - Add to `sidebar` configuration for sidebar navigation
   - Add to `nav` configuration for top navigation (if appropriate)

## Search

VitePress includes built-in local search. No additional configuration needed -
it automatically indexes all markdown content during the build.
