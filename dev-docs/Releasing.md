# Releasing

## Version Numbers

Version numbers appear in these locations:

1. `package.json` (root) - Source of truth
2. `claude-desktop-extension/package.json`
3. `src/shared/version.js`
4. `max-for-live-device/Producer_Pal.amxd` - In the Max UI (manual update
   required)

## Release Process

### Step 1: Version Bump (on dev branch)

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

### Step 2: Test and Commit

```sh
npm test
git add -A
git commit -m "Bump version to X.Y.Z"
```

### Step 3: Tag the Release (BEFORE building)

```sh
# Tag the exact commit we're about to build from
git tag vX.Y.Z
git push origin dev vX.Y.Z
```

This ensures the tag matches the exact code used to build the release.

### Step 4: Build Release Files

```sh
# Build from the tagged commit
npm run release
```

This script:

- Cleans the release/` directory
- Builds the `.mcpb` file
- Copies it to `release/Producer_Pal.mcpb`

### Step 5: Freeze Max Device

1. Open `max-for-live-device/Producer_Pal.amxd` in Max
2. Click the freeze button
3. Save as: `release/Producer_Pal.amxd`

### Step 6: Create GitHub Pre-Release

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

### Step 7: Create Pull Request

Create PR via GitHub UI: `dev → main`

The PR will include the tag and all release commits.

### Step 8: Test Pre-Release

Test the pre-release thoroughly, especially on different platforms (Windows,
macOS). Download directly from GitHub to ensure the files work correctly.

If issues are found, see "Fixing Issues During Pre-Release" section below.

### Step 9: Merge and Promote

After testing succeeds:

1. Review and merge the PR via GitHub UI
2. Go to the pre-release on GitHub
3. Click "Edit"
4. Uncheck "Set as a pre-release"
5. Update release (no need to re-upload files)

### Step 10: Post-Release

```sh
# Fetch and merge the updated main branch
git fetch origin main
git merge origin/main
```

This ensures dev has the merge commit created by GitHub when merging the PR.

## Release Testing Checklist

### Setup

1. Create GitHub pre-release with downloaded files:
   - `Producer_Pal.amxd`
   - `Producer_Pal.mcpb`
   - `producer-pal-portal.js`
2. Clean slate:
   - Uninstall previous Claude Desktop extension
   - Fresh Live Set with downloaded `Producer_Pal.amxd`
   - Leave `producer-pal-portal.js` in Downloads folder

### Claude Desktop - Full Sanity Check

- [ ] Connect and read Live Set
- [ ] Create MIDI clip
- [ ] Edit MIDI clip (add/modify notes)
- [ ] Read samples
- [ ] Create audio clip from sample
- [ ] Start/stop playback

### Built-in Chat UI - Connection Check

For each provider, just connect and confirm `ppal-read-live-set` is called:

- [ ] **Gemini**
- [ ] **OpenAI**
- [ ] **OpenRouter**
- [ ] **Ollama** (enable Small Model Mode + minimal toolset first)

### LM Studio - Downloaded Portal

```json
"producer-pal": {
  "command": "node",
  "args": ["/Users/{username}/Downloads/producer-pal-portal.js"]
}
```

- [ ] Connect and confirm `ppal-read-live-set` called

### Publish npm

- [ ] `cd npm && npm publish`

### LM Studio - npx

```json
"producer-pal": {
  "command": "npx",
  "args": ["-y", "producer-pal"]
}
```

- [ ] Connect and confirm `ppal-read-live-set` called

### Finalize Release

- [ ] Merge PR: `dev → main`
- [ ] Promote GitHub pre-release to release

## Fixing Issues During Pre-Release

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

**Version Management:**

When bumping versions with `npm run version:bump`, you must manually update
`npm/package.json` to match the root `package.json` version. The version bump
script does not automatically update `npm/package.json`.

## Stable Download URLs

After release, these URLs will always point to the latest version:

- [Producer_Pal.amxd](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd)
- [Producer_Pal.mcpb](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.mcpb)

No README updates needed for new releases!
