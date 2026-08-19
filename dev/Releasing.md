# Releasing

## Preparation

Do this early in the development cycle, ideally soon after the previous release.
This way, whenever going back to a previous release (e.g. to confirm a behavior
is a regression), it's always clear which build is running.

1. Open the next release cycle:

   ```sh
   npm run version:bump        # patch: 0.9.0 → 0.9.1-rc1
   npm run version:bump:minor  # minor: 0.9.1 → 0.10.0-rc1
   npm run version:bump:major  # major: 0.9.1 → 1.0.0-rc1
   ```

   If unsure, start with patch. Any of these can be re-run during the cycle to
   retarget: from `0.9.1-rc3`, `version:bump:minor` gives `0.10.0-rc1`. They
   ignore the suffix that's already there and restart the candidate count,
   because they name where the release is going, not where it's been.

2. Commit and push:

   ```sh
   npm run check
   git add .
   git commit -m "bump version to X.Y.Z-rc1"
   git push origin dev
   ```

3. Create a pull request via GitHub UI: `dev → main`

The PR can be long-lived during development. It makes it easy to check CI status
and see how much is accumulating for the release.

### About the Versioning System

**Every build says what it is.** A release candidate is a real version —
`2.1.0-rc1`, not `2.1.0` with a tag draped over it — and it's baked into the
artifacts, not just git. Nothing downstream has to infer which build it's
holding.

**Minor versions carry the work.** Features, tool-schema changes, and the bug
fixes that ride along with them all go in a `2.N.0`. Patch versions are for
simple follow-ups and urgent fixes on top of a release — not a place to
accumulate a cycle's worth of changes.

Batch generously into one minor rather than splitting across two closely spaced
releases. Step 3 is cross-platform and largely manual, so a release costs about
the same to test whatever it contains.

The rest of the cycle moves within that version:

```sh
npm run version:bump:rc  # 2.1.0-rc1 → 2.1.0-rc2, for each re-cut
npm run version:bump:ga  # 2.1.0-rc4 → 2.1.0, at promotion
```

`version:bump:rc` refuses to run on a release version and `version:bump:ga`
refuses to run on one too, so a cycle can only be opened by choosing its size
(patch/minor/major) and can only be closed once. There's an escape hatch that
skips every rule and only checks the shape:

```sh
npm run version:bump:to -- 2.1.0-rc1
```

The bump script writes the version to:

1. `src/shared/config.ts` — the version the runtime reports (Max for Live device
   UI / MCP server), and the one the build itself uses
2. `npm/package.json` — the `producer-pal` npm module's version
3. `package.json` and `claude-desktop-extension/package.json`
4. The `version` **and** `packages[""].version` fields of all three lockfiles
   (npm keeps it twice per lockfile, and a hand-edit reliably misses one)

`claude-desktop-extension/manifest.json` also carries a version — the one Claude
Desktop shows — but the bump script does not write it. It's generated from the
template during the build, so it picks the version up on its own.

Nothing reconciles any of this at runtime — whichever copy an artifact happens
to read is what it claims to be — so `src/test/meta/version-agreement.test.ts`
asserts they're identical, and `npm run tag` re-checks the config.ts one. That
test's file lists are the authoritative inventory; this section deliberately
doesn't restate a total, because a count in prose goes stale silently.

## Step 0: Checklist before releasing

In the `dev` branch:

- [ ] All remote changes (e.g. dependabot) are pulled
- [ ] Dependencies are up to date (`npm i`)
- [ ] All local changes are committed
- [ ] `npm run check` passes locally
- [ ] All local commits are pushed to GitHub
- [ ] The PR to `main` has a green build
- [ ] MCP e2e tests pass locally (see below)
- [ ] Most evals should (at least partially) pass with a capable model e.g.
      `scripts/eval -m gpt-5.4 -j gpt-5.4-mini -a` (requires API keys in `.env`)

### MCP E2E Tests

Run `npm run build && npm run e2e:mcp` with Ableton Live open. It takes a few
minutes Don't use Live while this runs because the tests manipulate it directly.
Requires macOS.

Note: All the tests for code execution functionality are expected to fail unless
you build with `build:debug`, which is not recommended here because it's not a
release build.

## Step 1: Build Release Files

1. Build release versions of desktop extensions and the portal script:

   ```sh
   npm run release
   ```

   This creates:
   - `release/Producer_Pal.mcpb` (Claude Desktop extension)

   It refuses to build if your shell has a debug flag set — they are substituted
   into the bundles, so a leftover `ENABLE_CODE_EXEC=true` would ship code
   execution to everyone.

   It also prints the **build** these files identify themselves as. The release
   tag has to land on that commit — see
   [How update detection works](#how-update-detection-works).

2. Freeze a fresh Max device:
   - Add the freshly built `max-for-live-device/Producer_Pal.amxd` to Ableton
     Live
   - Open the device in Max
   - Click the freeze button
   - Save as: `release/Producer_Pal.amxd`

## Step 2: Create GitHub Pre-Release

1. Tag the build you just checked:

   ```sh
   npm run tag
   ```

   This runs after the build, not before, so the tag goes on something that has
   been looked at. `npm run release` records the version and commit it built
   from, and this checks the tag against them — commit anything, or bump the
   version, between the two steps and it refuses rather than tagging code the
   artifacts didn't come from. It also refuses to move an existing tag: if the
   build needs to change, that's a new candidate, not a re-tag (see
   [Fixing Issues During Pre-Release](#fixing-issues-during-pre-release)).

   It creates the tag locally and prints the push command. Nothing is public
   until you run that.

   Tag here rather than letting GitHub create one in the next step — a tag
   GitHub makes is lightweight and unsigned.

2. Go to [GitHub Releases](https://github.com/adamjmurray/producer-pal/releases)
3. Click "Draft a new release"
4. Release title: `X.Y.Z-rcN`
5. Choose tag: `vX.Y.Z-rcN`
6. Upload files from `release/`:
   - `Producer_Pal.amxd`
   - `Producer_Pal.mcpb`
7. Check "Set as a pre-release"
8. Write release notes
9. Publish pre-release

Each candidate gets its own pre-release, because each one is its own version
with its own tag and its own artifacts. Superseded ones can be deleted from the
releases page once nobody is testing them.

### How update detection works

An installed copy asks GitHub for `/releases/latest` once — when the Max for
Live device loads the server, and never again — and compares the version it gets
back against its own. Newer ⇒ show the update prompt. That's the whole
mechanism. It needs nothing at release time beyond publishing the release.

Once per process is a hard requirement, not an optimization. GitHub's
unauthenticated API allows 60 requests an hour **per IP**, shared with
everything else on that IP, so the chat UI reads the server's cached answer
(`GET /update`) rather than asking GitHub each time it's opened. See
`src/mcp-server/helpers/http/update-check.ts`.

**Pre-releases are invisible to the check, on purpose.** `/releases/latest`
skips anything marked "Set as a pre-release" by definition. So while `X.Y.Z-rcN`
is in testing, everyone on the previous stable release still sees that as the
latest and is never nudged toward a candidate. There's no opt-in beta track, and
this is the substitute for one.

What that means at each step:

- **A tester on `2.1.0-rc1` is never prompted to "downgrade"** to the older
  stable release the API hands back. The comparison is strictly directional, so
  an older version is simply not an update.
- **They are prompted the moment `2.1.0` is published**, because `2.1.0-rc1` and
  `2.1.0` are genuinely different versions. A semver pre-release sorts before
  the release of the same numbers, which is exactly the answer wanted here.
- **A new candidate does not prompt anyone**, since it's still a pre-release.
  Tell testers directly; you're already in contact with them.

This is why candidates carry a real `-rcN` rather than being tagged copies of
`X.Y.Z`. When every build of a cycle called itself `2.1.0`, the version string
couldn't distinguish them, and telling a re-cut build apart from the one a
tester already had took a second GitHub request to resolve the release's tag to
a commit — twice the rate-limit cost, to answer something the version number now
answers by itself.

The commit SHA is still baked into the artifacts and shown next to the version
in the device UI, but it's diagnostic only: it says which commit produced these
bytes when a bug report and a version number disagree. Nothing branches on it.

## Step 3: Test Pre-Release

Test the pre-release thoroughly on both macOS and Windows. Download directly
from the GitHub pre-release page to ensure the files work correctly.

**Setup:**

- Uninstall the previous Claude Desktop extension and reinstall the downloaded
  `Producer_Pal.mcpb`
- Fresh Live Set with downloaded `Producer_Pal.amxd`

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
npm run e2e:webui
```

This tests Quick Connect for Gemini, OpenAI, Mistral, and OpenRouter paid
models. See `e2e/webui/README.md` for details. These tests can be flakey, so
manually check on anything that fails. Note: Requires `.env` file with API keys.

The separate stubbed suite, `npm run ui:test`, needs no Ableton or keys and runs
in CI — see `e2e/ui/README.md`.

**Manual checks:**

- [ ] **Manual sanity check** - Pick one provider and do a Quick Connect and
      then some task like generating a clip
- [ ] **OpenRouter free model** - Test a free model (e.g., Devstral 2) with
      Quick Connect (free models are excluded from E2E tests due to rate limits)
- [ ] **Ollama** - Enable Small Model Mode + minimal toolset, then Quick Connect
      and a simple task (not automated due to slow response times)
- [ ] **Bionic** - With Bionic running its local server, select the Bionic / LM
      Studio provider in the chat UI, enter a loaded model id, and run a simple
      task. This exercises the webui → Bionic path (OpenAI-compatible **Chat
      Completions** API), which is distinct from using Bionic as an MCP client
      (Step 4). Regression-prone: the OpenAI-compatible providers must use the
      Chat Completions API, not the Responses API (`.chat()` in
      `provider-factories.ts`), or the server returns a 400 "Invalid type for
      'input'".

## Step 4: Test the npm portal locally

**Nothing is published to npm during pre-release.** An `-rcN` never goes to the
registry: a published version can't be unpublished or replaced, and npm has no
notion of a version that's real-but-not-current beyond dist-tags, which the
`latest` tag would still have to be steered around. `npm/package.json` enforces
it — `prepublishOnly` runs a guard that fails on any version containing a `-`.

Test the exact bytes that would be published, from a local tarball instead:

```sh
cd npm
npm pack                              # → producer-pal-X.Y.Z-rcN.tgz
tar -tzf producer-pal-*.tgz           # inspect contents
npm install -g ./producer-pal-*.tgz
```

Then point an MCP client (Bionic or similar) at the globally installed command:

```json
"producer-pal": {
  "command": "producer-pal",
  "args": ["--small-model-mode"]
}
```

The `--small-model-mode` option should automatically enable small model mode.
Connect and confirm `ppal-read-live-set` is called, then clean up:

```sh
npm uninstall -g producer-pal
rm npm/producer-pal-*.tgz
cd ..
```

See [Publishing to npm](#publishing-to-npm) for more details and
troubleshooting.

## Step 5: Ship it

After testing succeeds:

1. Promote the version to GA **on `dev`, before merging**:

   ```sh
   npm run version:bump:ga   # 2.1.0-rc4 → 2.1.0
   npm run check
   git add .
   git commit -m "bump version to X.Y.Z"
   git push origin dev
   ```

   Order matters: producer-pal.org is built from `main` and puts the version in
   its install instructions, so merging while `dev` still says `-rc4` publishes
   a docs site advertising a release candidate.

2. Review and merge the PR in the GitHub UI
   - A squash merge prefills the body with every commit message on `dev`. One
     grandfathered commit still carries an `AJM-NNN` reference (allowlisted in
     `src/test/meta/no-linear-refs.test.ts`) — delete that line before merging
     so the private ticket number stays out of `main`.

3. Build, tag, and release the GA version. It's a rebuild, not a re-labelling —
   the artifacts have to carry `X.Y.Z`, not `X.Y.Z-rc4`:

   ```sh
   npm run release   # then freeze the Max device, as in Step 1
   npm run tag       # creates vX.Y.Z
   ```

   Create a new GitHub release for `vX.Y.Z` (not a pre-release) and upload the
   fresh files. This is the release everyone gets prompted to install.

4. Publish to npm — the first and only publish of this version:

   ```sh
   npm login
   cd npm && npm publish && cd ..
   ```

   No `--tag next` dance: what's being published has already been tested as a
   tarball, and the version is a GA version, so `latest` is where it belongs.

## Fixing Issues During Pre-Release

If problems are found during pre-release testing:

Replacing files under a version that's already been handed out is what the
candidate numbering exists to avoid. A fix means the next candidate:

1. **Fix the issues** (on dev branch)

   ```sh
   # Make necessary fixes
   git add .
   git commit -m "Fix: description of fix"
   ```

2. **Cut the next candidate**

   ```sh
   npm run version:bump:rc   # 2.1.0-rc1 → 2.1.0-rc2
   npm run check
   git add .
   git commit -m "bump version to X.Y.Z-rcN"
   git push origin dev
   ```

3. **Rebuild and tag**

   ```sh
   npm run release
   # Freeze Max device again
   npm run tag
   git push origin dev vX.Y.Z-rcN
   ```

4. **Publish a new pre-release** for the new tag (Step 2), and tell the testers
   directly — a pre-release never prompts anyone
   ([How update detection works](#how-update-detection-works)). The superseded
   pre-release can be deleted once nobody's on it.

5. **Retest** and repeat if necessary

Any number of candidates can burn this way at no cost: they're never published
to npm, and the version people upgrade to is still the plain `X.Y.Z` at the end
of the cycle.

If a problem is discovered **after** Step 5's npm publish, that version is spent
— npm never lets a published version be replaced. Open a new cycle
(`npm run version:bump` → `X.Y.Z+1-rc1`) and run the process again.

## Publishing to npm

The npm package provides the portal script (`producer-pal-portal.js`) so users
can run `npx producer-pal` to connect any MCP client to Producer Pal.

**Prerequisites:**

- npm account with publish access to `producer-pal` package
- A GA version — `prepublishOnly` refuses to publish anything with a `-` in it
- Version numbers already updated everywhere (`npm run version:bump:*` does
  this; `npm run check` asserts it)

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

- The `prepublishOnly` hook in `npm/package.json` runs `guard:no-prerelease`
  (which fails on an `-rcN` version) and then `npm run build`, so a publish
  always ships fresh artifacts of a releasable version
- Published files (defined in `npm/package.json` `files` array):
  - `producer-pal-portal.js` (bundled portal script with shebang)
  - `LICENSE` (GPL 3.0 license)
  - `licenses/` (only portal dependencies: MCP SDK, zod)
  - `README.md` (npm-specific documentation)
  - `producer-pal-logo.svg` (logo for npm page)
- Build artifacts in `npm/` are gitignored (never committed)
- Version numbers in root `package.json` and `npm/package.json` should match
