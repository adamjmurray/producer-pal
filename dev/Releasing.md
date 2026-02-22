# Releasing

## Preparation

Do this early in the development cycle, ideally soon after the previous release.
This way, whenever going back to a previous release (e.g. to confirm a behavior
is a regression), it's always clear which build is running.

1. Bump the version:

   ```sh
   npm run version:bump        # patch: 0.9.0 → 0.9.1
   npm run version:bump:minor  # minor: 0.9.1 → 0.10.0
   npm run version:bump:major  # major: 0.9.1 → 1.0.0
   ```

   If unsure, start with patch. The version can be re-bumped during a
   development cycle.

2. Commit and push:

   ```sh
   npm run check
   git add .
   git commit -m "bump version to X.Y.Z"
   git push origin dev
   ```

3. Create a pull request via GitHub UI: `dev → main`

The PR can be long-lived during development. It makes it easy to check CI status
and see how much is accumulating for the release.

### About the Versioning System

The version bump script updates the following:

1. `src/shared/version.js` controls the version reported by the runtime (Max for
   Live device UI / MCP server)
2. `claude-desktop-extension/manifest.json` controls version in Claude Desktop
   Extension (this file is generated during the build)
3. `npm/package.json` controls the `producer-pal` npm module's version
4. `package.json` and `claude-desktop-extension/package.json` for consistency

## Step 0: Checklist before releasing

In the `dev` branch:

- [ ] All remote changes (e.g. dependabot) are pulled
- [ ] Dependencies are up to date (`npm i`)
- [ ] All local changes are committed
- [ ] All local commits are pushed to GitHub
- [ ] The PR to `main` has a green build
- [ ] MCP e2e tests pass locally (see below)

### MCP E2E Tests

Run `npm run build && npm run e2e:mcp` with Ableton Live open. It takes a few
minutes Don't use Live while this runs because the tests manipulate it directly.
Requires macOS.

## Step 1: Build Release Files

1. Build release versions of desktop extensions and the portal script:

   ```sh
   npm run release
   ```

   This creates:
   - `release/Producer_Pal.mcpb` (Claude Desktop extension)
   - `release/producer-pal-portal.js` (MCP proxy, an alternative to
     `npx producer-pal`)

2. Freeze a fresh Max device:
   - Add the freshly built `max-for-live-device/Producer_Pal.amxd` to Ableton
     Live
   - Open the device in Max
   - Click the freeze button
   - Save as: `release/Producer_Pal.amxd`

## Step 2: Create GitHub Pre-Release

1. Create and push the version tag:

   ```sh
   git tag vX.Y.Z
   git push origin dev vX.Y.Z
   ```

2. Go to [GitHub Releases](https://github.com/adamjmurray/producer-pal/releases)
3. Click "Draft a new release"
4. Release title: `X.Y.Z`
5. Choose tag: `vX.Y.Z`
6. Upload files from `release/`:
   - `Producer_Pal.amxd`
   - `Producer_Pal.mcpb`
   - `producer-pal-portal.js`
7. Check "Set as a pre-release"
8. Write release notes
9. Publish pre-release

## Step 3: Test Pre-Release

Test the pre-release thoroughly on both macOS and Windows. Download directly
from the GitHub pre-release page to ensure the files work correctly.

**Setup:**

- Uninstall the previous Claude Desktop extension and reinstall the downloaded
  `Producer_Pal.mcpb`
- Fresh Live Set with downloaded `Producer_Pal.amxd`
- Leave `producer-pal-portal.js` in Downloads folder

### 3A. Claude Desktop Testing

Test the Claude Desktop extension (`Producer_Pal.mcpb`):

- [ ] Connect and read Live Set
- [ ] Create MIDI clip
- [ ] Edit MIDI clip (add/modify notes)
- [ ] Read samples
- [ ] Create audio clip from sample
- [ ] Start/stop playback

### 3B. Built-in Chat UI Testing

**Automated E2E tests** (requires Ableton Live running with device active):

```sh
npm run ui:test
```

This tests Quick Connect for Gemini, OpenAI, Mistral, and OpenRouter paid
models. See `e2e/webui/README.md` for details. These tests can be flakey, so
manually check on anything that fails. Note: Requires `.env` file with API keys.

**Manual checks:**

- [ ] **Manual sanity check** - Pick one provider and do a Quick Connect and
      then some task like generating a clip
- [ ] **OpenRouter free model** - Test a free model (e.g., Devstral 2) with
      Quick Connect (free models are excluded from E2E tests due to rate limits)
- [ ] **Ollama** - Enable Small Model Mode + minimal toolset, then Quick Connect
      and a simple task (not automated due to slow response times)

### 3C. Portal Script Testing

Test the downloaded portal script with LM Studio or another MCP client:

```json
"producer-pal": {
  "command": "node",
  "args": ["/Users/{username}/Downloads/producer-pal-portal.js"]
}
```

- [ ] Connect and confirm `ppal-read-live-set` called

---

If issues are found, see
[Fixing Issues During Pre-Release](#fixing-issues-during-pre-release).

## Step 4: Publish to npm / test npx

1. Login to NPM:

   ```sh
   npm login
   ```

2. Publish the package:

   ```sh
   cd npm && npm publish
   ```

3. Test the published package with LM Studio or another MCP client:

   ```json
   "producer-pal": {
     "command": "npx",
     "args": ["-y", "producer-pal@latest", "-s"]
   }
   ```

The `-s` option should automatically enable small model mode.

4. Connect and confirm `ppal-read-live-set` is called

See [Publishing to npm](#publishing-to-npm) for more details and
troubleshooting.

## Step 5: Ship it

After testing succeeds:

1. Review and merge the PR in the GitHub UI
2. Promote the github release
   - Go to the pre-release page on GitHub
   - Click "Edit"
   - Uncheck "Set as a pre-release"
   - Update release (no need to re-upload files)

## Fixing Issues During Pre-Release

If problems are found during pre-release testing:

1. **Fix the issues** (on dev branch)

   ```sh
   # Make necessary fixes
   git add .
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
   npm run release
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

If problems are discovered after the npm had been published, it should be
republished (TODO: document the process if this ever happens)

## Publishing to npm

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
