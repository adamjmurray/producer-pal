# Testing and Shipping

Part of [Releasing](README.md).

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
tar -tzf producer-pal-*.tgz           # inspect contents: Producer_Pal.amxd must be there
npm install -g ./producer-pal-*.tgz
```

Then point an MCP client (Bionic or similar) at the globally installed command:

```json
"producer-pal": {
  "command": "producer-pal",
  "args": ["--small-model-mode"]
}
```

The `--small-model-mode` option enables small model mode for this client only,
so the device's Small Model Mode checkbox won't change. Check the tool
descriptions are the short ones instead. Connect and confirm
`ppal-read-live-set` is called, then clean up:

```sh
npm uninstall -g producer-pal
rm producer-pal-*.tgz
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
     `src/test/meta/content-guards/no-linear-refs.test.ts`) — delete that line
     before merging so the private ticket number stays out of `main`.

3. Build, tag, and release the GA version. It's a rebuild, not a re-labelling —
   the artifacts have to carry `X.Y.Z`, not `X.Y.Z-rc4`:

   ```sh
   npm run release           # builds, freezes the device, packages
   npm run tag               # creates vX.Y.Z
   ```

   Create a new GitHub release for `vX.Y.Z` (not a pre-release) and upload the
   fresh files. This is the release everyone gets prompted to install.

4. Publish to npm — the first and only publish of this version. Pack the
   `npm run release` build, test that tarball as in Step 4, then publish that
   same file:

   ```sh
   npm login
   npm run guard:device                  # npm/ still holds this version's device
   cd npm
   npm run guard:no-prerelease
   npm pack                              # → producer-pal-X.Y.Z.tgz; test it
   npm publish ./producer-pal-X.Y.Z.tgz
   rm producer-pal-X.Y.Z.tgz
   cd ..
   ```

   Publish the tarball, not the folder, so what ships is the file you tested.
   Publishing a tarball skips `prepublishOnly`, guard included, which is why the
   guards run by hand. `npm pack` runs the device guard itself (`prepack`).

   No `--tag next` dance: the version is a GA version, so `latest` is where it
   belongs.

## Publishing to npm

The npm package provides the portal script (`producer-pal-portal.js`) so users
can run `npx producer-pal` to connect any MCP client to Producer Pal.

**Prerequisites:**

- npm account with publish access to `producer-pal` package
- A GA version — `guard:no-prerelease` refuses anything with a `-` in it
- Version numbers already updated everywhere (`npm run version:bump:*` does
  this; `npm run check` asserts it)

**Publishing Process:**

```sh
# Build and package everything (including the npm/ folder), as the release does
npm run release

# Change to npm directory
cd npm

# Test packaging
npm pack
tar -tzf producer-pal-X.Y.Z.tgz  # Inspect contents

# Test local installation
npm install -g ./producer-pal-X.Y.Z.tgz
npx producer-pal # actually use this with an MCP Client, running it on the command line does nothing visible
npm uninstall -g producer-pal

# When ready, publish the tested tarball (not the folder)
(cd .. && npm run guard:device)
npm run guard:no-prerelease
npm publish ./producer-pal-X.Y.Z.tgz
rm producer-pal-X.Y.Z.tgz

# Return to root directory
cd ..
```

**Notes:**

- `npm pack` (and publishing the folder) runs the `prepack` hook in
  `npm/package.json`: `npm run guard:device`, which fails unless
  `npm/Producer_Pal.amxd` exists and carries this version. Publishing the folder
  also runs `prepublishOnly`, which is `guard:no-prerelease` (fails on an `-rcN`
  version). Neither rebuilds: a plain build would remove the device. Publishing
  a tarball skips `prepublishOnly`, so run both guards by hand
- Published files (defined in `npm/package.json` `files` array):
  - `producer-pal-portal.js` (bundled portal script with shebang)
  - `Producer_Pal.amxd` (the frozen device, copied in by `npm run release:mcpb`;
    the portal installs it, never the bundle)
  - `LICENSE` (MIT license)
  - `licenses/` (only portal dependencies: MCP SDK, zod)
  - `README.md` (npm-specific documentation)
  - `producer-pal-logo.svg` (logo for npm page)
- Build artifacts in `npm/` are gitignored (never committed)
- Version numbers in root `package.json` and `npm/package.json` should match
