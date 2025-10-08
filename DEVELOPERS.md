# Producer Pal Development Info

This is a personal project with a focused roadmap. While the code is open source
for learning and forking, I'm not accepting contributions to keep the project
aligned with my specific workflow needs.

Feel free to:

- File bug reports in
  [the issues](https://github.com/adamjmurray/producer-pal/issues)
- Ask questions, give feedback, and share your experiences in
  [the discussions](https://github.com/adamjmurray/producer-pal/discussions)
- Learn from the implementation
- Fork and modify for your own needs

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

Automated tests must always pass:

```
npm test
```

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

When using a chat project, copy `doc/AI-Chat-Project-Instructions.md` into the
project instructions for the AI chat app of choice. This file provides useful
information similar to `AGENTS.md` but adapted for standalone chat apps.

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
node scripts/cli.mjs tools/call ppal-duplicate '{"type": "scene", "id": "7", "destination": "arrangement", "arrangementStartTime": "5|1"}'

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

### Stable Download URLs

After release, these URLs will always point to the latest version:

- [Producer_Pal.amxd](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd)
- [Producer_Pal.mcpb](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.mcpb)

No README updates needed for new releases!
