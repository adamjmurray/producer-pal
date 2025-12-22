# Producer Pal Development Info

Contributing to Producer Pal

I maintain the core MCP tools and feature roadmap myself to keep development
moving quickly. But there's plenty of room to collaborate:

**High-value contributions:**

- End-to-end testing automation and LLM evaluations
- Small language model optimization (making Ollama/LM Studio work better)
- Voice interaction development
- Documentation improvements

**Always welcome:**

- Beta testing and detailed bug reports
- Reproducible cases where LLMs misuse the tools
- Feature requests and wishlist ideas

Interested? Open a
[GitHub discussion](https://github.com/adamjmurray/producer-pal/discussions) or
reach out directly.

Also feel free to:

- File bug reports in
  [the issues](https://github.com/adamjmurray/producer-pal/issues) (help me
  reproduce it and I will do my best to fix it)
- Ask questions, give feedback, request features, and share your experiences in
  [the discussions](https://github.com/adamjmurray/producer-pal/discussions)
- Learn from the implementation
- Fork and modify for your own needs. Please attribute me.

## Building from source

Requires [Node.js](https://nodejs.org) (recommended v22 or higher)

1. Clone this repository
2. `npm install`
3. `npm run build` (for production) or `npm run build:all` (for development with
   debugging tools)
4. Add the `max-for-live-device/Producer_Pal.amxd` Max for Live device to a MIDI
   track in Ableton Live
5. Drag and drop `claude-desktop-extension/Producer_Pal.mcpb` to Claude Desktop
   → Settings → Extension

**Note**: For development and testing, use `npm run build:all` to include
debugging tools like `ppal-raw-live-api`.

## Core Development Scripts

Watch for changes and auto-build:

```
npm run dev
```

Auto-fix formatting and linting issues:

```
npm run fix  # Runs format + lint:fix
```

Code quality checks must always pass:

```
npm run check  # Runs all checks: lint + typecheck + format check + tests
```

**Recommended workflow**: Run `npm run fix` before `npm run check` to
automatically fix issues and save time.

Or run checks individually:

```
npm run lint
npm run typecheck  # UI code only
npm test
npm run format:check
```

## Web UI Development

The chat interface is a Preact web application built with Vite. It's served from
the MCP server at `http://localhost:3350/chat` and opened in your system's
default browser. It connects to both the Gemini API and the local MCP server.

### Development Server

```bash
npm run ui:dev
```

This starts a dev server at http://localhost:3355 with hot reload. Changes to
webui source files will update automatically in the browser. Occasionally a page
refresh may be needed if things stop working.

**Note:** The dev server runs on a different port (3355) than the production
server (3350). Both connect to the MCP server at http://localhost:3350/mcp. For
full integration testing, use the production build served from port 3350.

### Production Build

```bash
npm run ui:build
```

Builds a single self-contained `max-for-live-device/chat-ui.html` file. This is
automatically included in `npm run build`.

### Linting

```bash
npm run lint
```

Runs ESLint on the UI code (`webui/src/**`). Enforces code quality rules
including strict TypeScript typing (no `any` types) and React best practices
(like avoiding JSX in try/catch blocks). All code changes should pass linting
before committing.

Use `npm run lint:fix` to automatically fix issues where possible.

### Type Checking

```bash
npm run typecheck
```

Runs TypeScript type checking on the UI code (JavaScript files with JSDoc
annotations). Currently only checks production code, not tests. All UI changes
should pass type checking before committing.

### Development Workflows

**Working on MCP server/tools only** (UI doesn't need changes):

- Build UI once: `npm run build` (or just `npm run ui:build`)
- Run: `npm run dev` (watches MCP server, V8, Portal)
- Access UI at http://localhost:3350/chat

**Working on web UI only** (MCP server doesn't need changes):

- Build MCP server once: `npm run build`
- Run: `npm run ui:dev` (watches UI with hot reload)
- Access UI at http://localhost:3355

**Working on everything** (full-stack development):

- Terminal 1: `npm run dev` (watches MCP server, V8, Portal)
- Terminal 2: `npm run ui:dev` (watches UI with hot reload)
- Access UI at http://localhost:3355

**Tip:** The Max for Live device has a button to open http://localhost:3350/chat
in your browser.

### Architecture

See `dev-docs/Chat-UI.md` for detailed information about:

## Documentation Site

The project documentation is built with VitePress and deployed to
https://producer-pal.org. The source files are in the `docs/` directory.

Development commands:

```bash
npm run docs:dev     # Development server with hot reload
npm run docs:build   # Build static site
npm run docs:preview # Preview production build
```

The site automatically deploys to https://producer-pal.org when changes are
pushed to the main branch.

**Clean URLs**: The site uses VitePress clean URLs (`cleanUrls: true`). When
linking to pages within the docs, use clean URL format without trailing slashes
(e.g., `/installation/chat-ui` instead of `/installation/chat-ui.html`). Page
files are named after their folder (e.g., `docs/installation.md` instead of
`docs/installation/index.md`), except for the top-level `docs/index.md`.

See `dev-docs/Documentation-Site.md` for deployment details, configuration, and
content guidelines.

## Testing and Debugging

To test/debug, you can use:

```
DANGEROUSLY_OMIT_AUTH=true npx @modelcontextprotocol/inspector
```

and then open
http://localhost:6274/?transport=streamable-http&serverUrl=http://localhost:3350/mcp

Note: you can omit `DANGEROUSLY_OMIT_AUTH=true` but then you need to connect via
proxy in the MCP inspector's settings, and the proxy session token needs to be
set per the command line's output (it's randomly generated). Running
`npx @modelcontextprotocol/inspector` will open a popup window with that so
already configured, so you can use that window and then manually configure the
streamable HTTP transport and URL.

## Manual Testing Notes

**Important**: After changing tool descriptions in the Producer Pal code (like
in `src/tools/**/*.def.js`), you must toggle the Producer Pal extension off/on
in Claude Desktop to refresh the cached tool definitions. Simply rebuilding the
code or restarting Claude Desktop is not sufficient - the extension must be
disabled and re-enabled in Claude Desktop → Settings → Extensions to see updated
tool descriptions.

## Coding Agents and AI Assistance

Coding agents assist with development of this project. The primary agent is
Claude Code, with Gemini CLI and OpenAI Codex CLI as supported alternatives. An
`AGENTS.md` file provides coding standards, with `CLAUDE.md` and `GEMINI.md`
triggering their respective agents to use it. The `doc` folder contains
reference documentation for development tasks.

Additionally, there is a feature `npm run knowledge-base` (or the shortcut
`npm run kb`) which flattens the project contents into a `knowledge-base`
folder. This can be imported into AI chat projects (Claude Projects, ChatGPT
Projects, Gemini Projects, etc.) for complex brainstorming and planning
sessions. Results can then be fed back into coding agents (for example by
generating new files for the `doc` folder). There's a few variations of this
command:

- `npm run kb` generates the full knowledge base with one file per original file
  (nearly everything in the repo except stuff like gitignored files, generated
  files, dependencies)
- `npm run kb:small` generates the knowledge base without any tests because
  tests take up the majority of space and typically don't need to be analyzed
  unless you're specifically improving the test suite
- `npm run kb:chatgpt` concatenates groups of files together (like every folder
  under src) to stay under the 20 file limit for ChatGPT projects (NOTE: it's
  unclear how well this works in practice - results seem less impressive than
  Claude Project with the kb or kb:small knowledge base)

When using a chat project, copy `dev-docs/AI-Chat-Project-Instructions.md` into
the project instructions for the AI chat app of choice. This file provides
useful information similar to `AGENTS.md` but adapted for standalone chat apps.

## Development Testing

For development testing, there are two main approaches:

### Direct MCP Connection (Preferred)

Add the MCP server directly to Claude Code for the best development experience:

```sh
claude mcp add --transport http producer-pal http://localhost:3350/mcp
```

**Requirements:**

- Producer Pal Max for Live device must be running in Ableton Live before
  starting a Claude Code session
- Run `npm run dev` for auto-rebuild on changes
- Provides direct access to all producer-pal tools through Claude Code

This approach is preferred for development testing as it provides seamless
integration with Claude Code's MCP capabilities.

### CLI Tool (Fallback)

For situations where the direct MCP connection isn't available or working, use
the CLI tool at `scripts/cli.mjs` to directly connect to the MCP server:

```sh
# Show server info (default)
node scripts/cli.mjs

# List available tools
node scripts/cli.mjs tools/list

# Call a tool with JSON arguments
node scripts/cli.mjs tools/call ppal-read-live-set '{}'
node scripts/cli.mjs tools/call ppal-duplicate '{"type": "scene", "id": "7", "destination": "arrangement", "arrangementStart": "5|1"}'

# Use a different server URL
node scripts/cli.mjs http://localhost:6274/mcp tools/list

# Show help
node scripts/cli.mjs --help
```

This CLI tool connects directly to your running Ableton Live session and can
help debug real-world issues by exercising the full MCP stack with actual Live
data.

## Development Tools

### Raw Live API Access

For development and debugging, a `ppal-raw-live-api` tool is available when
building with `npm run dev` or `npm run build:all` (but NOT with the regular
`npm run build`). This tool provides direct access to the Live API for research
and advanced debugging:

```sh
# Example: Get tempo using multiple operation types
node scripts/cli.mjs tools/call ppal-raw-live-api '{
  "path": "live_set",
  "operations": [
    {"type": "get", "property": "tempo"},
    {"type": "getProperty", "property": "tempo"}
  ]
}'

# Example: Navigate to a track and check if it exists
node scripts/cli.mjs tools/call ppal-raw-live-api '{
  "operations": [
    {"type": "goto", "value": "live_set tracks 0"},
    {"type": "exists"},
    {"type": "getProperty", "property": "name"}
  ]
}'
```

The `ppal-raw-live-api` tool supports 13 operation types including core
operations (`get_property`, `set_property`, `call_method`), convenience
shortcuts (`get`, `set`, `call`, `goto`, `info`), and extension methods
(`getProperty`, `getChildIds`, `exists`, `getColor`, `setColor`).

## Releasing

### Version Numbers

Version numbers appear in these locations:

1. `package.json` (root) - Source of truth
2. `claude-desktop-extension/package.json`
3. `src/shared/version.js`
4. `max-for-live-device/Producer_Pal.amxd` - In the Max UI (manual update
   required)

### Release Process

#### Step 1: Version Bump (on dev branch)

```sh
# Automated version bump script
npm run version:bump        # patch: 0.9.0 → 0.9.1
npm run version:bump:minor  # minor: 0.9.1 → 0.10.0
npm run version:bump:major  # major: 0.9.1 → 1.0.0
```

This script updates:

- ✅ package.json files
- ✅ src/shared/version.js
- ✅ Max device UI (it uses the value in src/shared/version.js)

#### Step 2: Test and Commit

```sh
npm test
git add -A
git commit -m "Bump version to X.Y.Z"
```

#### Step 3: Tag the Release (BEFORE building)

```sh
# Tag the exact commit we're about to build from
git tag vX.Y.Z
git push origin dev vX.Y.Z
```

This ensures the tag matches the exact code used to build the release.

#### Step 4: Build Release Files

```sh
# Build from the tagged commit
npm run release:prepare
```

This script:

- Cleans the release/` directory
- Builds the `.mcpb` file
- Copies it to `release/Producer_Pal.mcpb`

#### Step 5: Freeze Max Device

1. Open `max-for-live-device/Producer_Pal.amxd` in Max
2. Click the freeze button
3. Save as: `release/Producer_Pal.amxd`

#### Step 6: Create GitHub Pre-Release

1. Go to [GitHub Releases](https://github.com/adamjmurray/producer-pal/releases)
2. Click "Draft a new release"
3. Choose tag: `vX.Y.Z`
4. Release title: `X.Y.Z`
5. Upload files from `release/`:
   - `Producer_Pal.amxd`
   - `Producer_Pal.mcpb`
   - `producer-pal-portal.js`
6. ✅ Check "Set as a pre-release"
7. Write release notes
8. Publish pre-release

#### Step 7: Create Pull Request

Create PR via GitHub UI: `dev → main`

The PR will include the tag and all release commits.

#### Step 8: Test Pre-Release

Test the pre-release thoroughly, especially on different platforms (Windows,
macOS). Download directly from GitHub to ensure the files work correctly.

If issues are found, see "Fixing Issues During Pre-Release" section below.

#### Step 9: Merge and Promote

After testing succeeds:

1. Review and merge the PR via GitHub UI
2. Go to the pre-release on GitHub
3. Click "Edit"
4. Uncheck "Set as a pre-release"
5. Update release (no need to re-upload files)

#### Step 10: Post-Release

```sh
# Fetch and merge the updated main branch
git fetch origin main
git merge origin/main
```

This ensures dev has the merge commit created by GitHub when merging the PR.

### Fixing Issues During Pre-Release

If problems are found during pre-release testing:

1. **Fix the issues** (on dev branch)

   ```sh
   # Make necessary fixes
   git add -A
   git commit -m "Fix: description of fix"
   ```

2. **Delete and recreate the tag**

   ```sh
   # Delete remote tag
   git push origin --delete vX.Y.Z

   # Delete local tag
   git tag -d vX.Y.Z

   # Recreate tag at current commit
   git tag vX.Y.Z

   # Assuming we're still in the dev branch:
   git push origin dev vX.Y.Z
   ```

3. **Rebuild**

   ```sh
   npm run release:prep
   # Freeze Max device again
   ```

4. **Update the pre-release**
   - Go to the existing pre-release on GitHub
   - Delete the old files
   - Upload the new files
   - No need to recreate the release

5. **Retest** and repeat if necessary

This is acceptable for pre-releases since they're explicitly marked as not
production-ready.

### Publishing to npm

The npm package provides the portal script (`producer-pal-portal.js`) for users
who want to run `npx producer-pal` instead of downloading the portal script and
configuring the path to that file. This is an alternative distribution channel
alongside GitHub releases.

**Prerequisites:**

- npm account with publish access to `producer-pal` package
- Version numbers must already be updated in `package.json` (root) and
  `npm/package.json`

**Publishing Process:**

```sh
# Build everything (including npm/ folder)
npm run build

# Change to npm directory
cd npm

# Test packaging
npm pack
tar -tzf producer-pal-X.Y.Z.tgz  # Inspect contents

# Test local installation
npm install -g ./producer-pal-X.Y.Z.tgz
npx producer-pal # actually use this with an MCP Client, running it on the command line does nothing visible
npm uninstall -g producer-pal

# When ready to publish
npm publish

# Return to root directory
cd ..
```

**Notes:**

- The `prepublishOnly` hook in `npm/package.json` automatically runs
  `npm run build` before publishing to ensure fresh build artifacts
- Published files (defined in `npm/package.json` `files` array):
  - `producer-pal-portal.js` (bundled portal script with shebang)
  - `LICENSE` (MIT license)
  - `licenses/` (only portal dependencies: MCP SDK, zod)
  - `README.md` (npm-specific documentation)
  - `producer-pal-logo.svg` (logo for npm page)
- Build artifacts in `npm/` are gitignored (never committed)
- Version numbers in root `package.json` and `npm/package.json` should match

**Version Management:**

When bumping versions with `npm run version:bump`, you must manually update
`npm/package.json` to match the root `package.json` version. The version bump
script does not automatically update `npm/package.json`.

### Stable Download URLs

After release, these URLs will always point to the latest version:

- [Producer_Pal.amxd](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd)
- [Producer_Pal.mcpb](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.mcpb)

No README updates needed for new releases!
