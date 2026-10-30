# Build and Pre-Release

Part of [Releasing](README.md).

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
      `scripts/eval -m codex-code/luna -a` (requires `codex login` and API keys
      in `.env`)

### MCP E2E Tests

Run `npm run build && npm run e2e:mcp:remote-script` with Ableton Live open and
the remote script selected as a control surface. It runs every suite, including
the remote-script ones `e2e:mcp` skips. It takes a few minutes. Don't use Live
while this runs because the tests manipulate it directly. Requires macOS.

Note: All the tests for code execution functionality are expected to fail unless
you build with `build:debug`, which is not recommended here because it's not a
release build.

## Step 1: Build Release Files

```sh
npm run release
```

This runs the two steps below in order and stops at the first failure. Run them
separately to redo just one.

1. `npm run release:amxd` builds the device and portal bundles, records the
   version and commit in `release/build-info.json`, and freezes the device into
   `release/Producer_Pal.amxd` from the freshly built `max-for-live-device/` and
   `licenses/`. The checked-in `max-for-live-device/Producer_Pal.amxd` is not
   changed. It refuses to build from a dirty working tree, since the recorded
   commit would not describe the artifacts. It also refuses if your shell has a
   debug flag set (any in `GUARDED_BUILD_FLAGS` in
   `scripts/build-and-release/helpers/build-flag-guard.ts`) — they are
   substituted into the bundles, so a leftover one would ship a dev-only feature
   to everyone.

   The release tag has to land on the commit it records — see
   [How update detection works](#how-update-detection-works).

   To re-freeze on its own, run `npm run device:freeze` (`-- --out <path>` to
   write elsewhere). It refuses a debug build (`npm run build:debug`): bundles
   built with any dev flag carry a `PRODUCER_PAL_DEV_BUILD` header, and
   `release:mcpb` and `npm pack` refuse a device that has it, always.
   `ALLOW_DEV_BUILD_FLAGS=true npm run device:freeze` freezes one anyway, with a
   warning, to test in Live. Freezing in Max (open the device, click freeze,
   save as `release/Producer_Pal.amxd`) still works and writes the same file.

2. `npm run release:mcpb` packages the portal, the extension and the npm folder.
   The portal ships a copy of the frozen device (a plain file next to
   `producer-pal-portal.js`, never inside any bundle), so this has to come after
   `npm run release:amxd`. It refuses unless `release/` belongs to this
   checkout, the same test `npm run tag` applies (clean tree, HEAD equal to the
   commit in `build-info.json`, matching version), and unless the frozen device
   is really frozen and belongs to that build: its bytes must contain
   `const VERSION = "x.y.z"`, and the file must be newer than `build-info.json`,
   which catches a freeze left over from an earlier build of the same version.
   It also refuses if any dev flag is set, `ALLOW_DEV_BUILD_FLAGS` or not, and
   refuses a portal carrying the `PRODUCER_PAL_DEV_BUILD` header (checked after
   the build, and again by `npm run tag` and `npm run guard:device`). Then it
   builds the portal, makes `release/Producer_Pal.mcpb` (device included), and
   leaves the same device and portal in `npm/`. If a step fails it lists what
   was written and what was not; fix the cause and re-run.

Don't run a plain `npm run build` afterwards: with no frozen device to hand it,
it removes the device from `npm/` and the extension folder. Plain builds (dev,
CI, e2e) bundle no device, and the portal treats that as "none bundled".
`npm pack` refuses in that state (`prepack` runs `npm run guard:device`), so a
tarball can't ship without the device.

## Step 2: Create GitHub Pre-Release

1. Tag the build you just checked:

   ```sh
   npm run tag
   ```

   This runs after the build, not before, so the tag goes on something that has
   been looked at. `npm run release:amxd` records the version and commit it
   built from, and this checks the tag against them — commit anything, or bump
   the version, between the two steps and it refuses rather than tagging code
   the artifacts didn't come from. It also refuses unless
   `release/Producer_Pal.mcpb` exists and is newer than `build-info.json`
   (`release:amxd` wipes `release/`, so run `npm run release:mcpb` first). It
   also refuses to move an existing tag: if the build needs to change, that's a
   new candidate, not a re-tag (see
   [Fixing Issues During Pre-Release](fixing-releases.md#fixing-issues-during-pre-release)).

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

It's also why dismissing an update can be keyed on the version number alone
(`dismissedUpdateVersion` in the global settings): a re-cut has a new version,
so it shows up again even after the last one was dismissed.

Both surfaces can dismiss. The chat UI's `×` writes the setting through
`PUT /settings`; the device's `×` sends `dismissUpdate` to the Node server,
which writes the same setting. Either way the server then tells the device to
hide its notice right away (`config updateDismissed` outlet message, handled in
`tab-main.maxpat`). Turning update checking off in the chat UI hides it the same
way. The chat UI sees a dismissal made in the device the next time it loads
`GET /update`.

The commit SHA is still baked into the artifacts and shown next to the version
in the device UI, but it's diagnostic only: it says which commit produced these
bytes when a bug report and a version number disagree. Nothing branches on it.
