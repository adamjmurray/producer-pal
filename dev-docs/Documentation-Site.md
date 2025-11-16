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

Starts VitePress development server at http://localhost:5173 with hot reload.
Changes to markdown files in `docs/` will update automatically in the browser.

### Production Build

```bash
npm run docs:build
```

Builds the static site to `docs/.vitepress/dist/`. This creates optimized HTML,
CSS, and JavaScript files ready for deployment.

### Preview Production Build

```bash
npm run docs:preview
```

Serves the built site locally to test the production build before deploying.

## Deployment

The documentation site is automatically deployed to https://producer-pal.org
when changes are pushed to the `main` branch.

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
- `style.css` - Custom CSS overrides and additions

### Public Assets

Static assets (images, logos, CNAME, etc.) are stored in `docs/public/`. These
files are copied to the root of the build output.

### Directory Structure

```
docs/
├── .vitepress/
│   ├── config.ts           # Main configuration
│   ├── theme/              # Theme customization
│   │   ├── index.ts        # Theme entry point
│   │   └── style.css       # Custom styles
│   ├── cache/              # Build cache (gitignored)
│   └── dist/               # Build output (gitignored)
├── public/                 # Static assets
│   ├── CNAME               # Custom domain config
│   ├── BingSiteAuth.xml    # Search engine verification
│   └── *.png, *.svg        # Images and icons
├── guide/                  # Documentation content
│   ├── index.md            # Getting started guide
│   └── usage.md            # Usage tips
├── installation/           # Installation guides
│   ├── index.md
│   ├── claude-desktop.md
│   └── ...
├── index.md                # Homepage
├── features/index.md       # Feature list
└── roadmap/index.md        # Development roadmap
```

## Content Guidelines

### File Naming

- Use kebab-case for all markdown files (e.g., `chat-ui.md`)
- Group related content in subdirectories (e.g., `installation/`, `guide/`)

### Frontmatter

Each markdown file should include frontmatter with metadata:

```yaml
---
title: Page Title
description: Brief description for SEO
---
```

### Linking

- Use relative paths for internal links: `[Installation](./installation/)`
- Include `.md` extension in links: `[Guide](./installation/chat-ui.md)`
- VitePress will handle converting these to proper URLs in the build

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
