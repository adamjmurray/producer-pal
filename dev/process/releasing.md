# Releasing

A release cycle, start to finish. Everything happens on `dev`.

1. [Pre-flight](#1-pre-flight) — checks, e2e, evals
2. [Build](#2-build) — `npm run release`
3. [Tag and pre-release](#3-tag-and-pre-release) — `npm run tag`, GitHub
   pre-release
4. [Test](#4-test) — macOS and Windows, from the downloaded files
5. [Ship](#5-ship) — GA bump, merge, rebuild, release, npm, MCP Registry
6. [Start the next cycle](#6-start-the-next-cycle) — sync `main`, bump `dev` to
   the next minor, open the next release PR

Something broke? See [Fixing a candidate](#fixing-a-candidate) or
[Urgent fix after a release](#urgent-fix-after-a-release).

Versions: every build carries a real version. Candidates are `X.Y.Z-rcN`, the
shipped release is `X.Y.Z`. `dev` always targets the next **minor**; patches are
only for urgent fixes on a shipped release, on a branch off `main`.

## 1. Pre-flight

On `dev`:

- [ ] Remote changes pulled (e.g. dependabot), `npm i` run
- [ ] Everything committed and pushed
- [ ] `npm run check` passes
- [ ] The release PR has a green build
- [ ] MCP e2e passes: `npm run build && npm run e2e:mcp`. Takes over an hour.
      macOS only, Live open with the remote script selected as a control
      surface. Quit and reopen Live first, and don't touch it during the run.
      The code-execution tests fail on a release build — that's expected.
- [ ] Most evals at least partly pass: `scripts/eval -m codex-code/luna -a`
      (needs `codex login` and API keys in `.env`)

## 2. Build

```sh
npm run release
```

This writes `release/Producer_Pal.amxd` and `release/Producer_Pal.mcpb`, and
fills `npm/`. It runs two steps you can redo separately:

- `npm run release:amxd` — builds and freezes the device
- `npm run release:mcpb` — packages the portal, extension and npm folder (needs
  the frozen device, so it runs second)

The scripts refuse and say why if something is off: a dirty tree, a debug build
flag in your shell, or a changed remote script without
`MIN_REMOTE_SCRIPT_VERSION` set to this version. Fix the cause and re-run.

**Don't run a plain `npm run build` afterwards.** It removes the device from
`npm/` and the extension folder.

## 3. Tag and pre-release

```sh
npm run tag
```

It checks the tag matches what was built, creates it locally, and prints the
push command. Run that. Don't commit or bump between build and tag, and don't
let GitHub create the tag (it would be unsigned).

Then on [GitHub Releases](https://github.com/adamjmurray/producer-pal/releases):

1. Draft a new release, title `X.Y.Z-rcN`, tag `vX.Y.Z-rcN`
2. Upload `Producer_Pal.amxd` and `Producer_Pal.mcpb` from `release/`
3. Check **Set as a pre-release**
4. Write release notes and publish

Pre-releases never trigger the in-app update prompt, so tell testers directly.

## 4. Test

On both macOS and Windows, using files downloaded from the pre-release page.
Reinstall the Claude Desktop extension from the downloaded `.mcpb` and use a
fresh Live Set with the downloaded `.amxd`.

**Claude Desktop**

- [ ] Connect and read the Live Set
- [ ] Create a MIDI clip, then edit its notes
- [ ] Read samples, create an audio clip from one
- [ ] Start and stop playback

**Chat UI**

- [ ] `npm run e2e:webui` (Live running, API keys in `.env`). Flaky — check
      failures by hand.
- [ ] One provider by hand: Quick Connect, then generate a clip
- [ ] An OpenRouter free model with Quick Connect
- [ ] Ollama: Small Model Mode + minimal toolset, Quick Connect, a simple task
- [ ] Bionic / LM Studio provider with a loaded model id, a simple task. A 400
      "Invalid type for 'input'" means an OpenAI-compatible provider is using
      the Responses API instead of Chat Completions.

**npm portal** (from a local tarball — candidates are never published to npm)

```sh
cd npm
npm pack                              # → producer-pal-X.Y.Z-rcN.tgz
tar -tzf producer-pal-*.tgz           # Producer_Pal.amxd must be listed
npm install -g ./producer-pal-*.tgz
```

Point an MCP client at it:

```json
"producer-pal": {
  "command": "producer-pal",
  "args": ["--small-model-mode"]
}
```

Don't use the `npx -y producer-pal@latest` config from the install guide: it
runs the published release, not this build.

- [ ] Tool descriptions are the short ones
- [ ] Connecting calls `ppal-read-live-set`

Clean up:

```sh
npm uninstall -g producer-pal
rm producer-pal-*.tgz
cd ..
```

## 5. Ship

1. Bump to GA on `dev` **before merging** (the docs site builds from `main` and
   shows the version):

   ```sh
   npm run version:bump:ga   # 2.1.0-rc4 → 2.1.0
   npm run check
   git add .
   git commit -m "bump version to X.Y.Z"
   git push origin dev
   ```

2. Merge the release PR in the GitHub UI. A squash merge prefills the body with
   every commit message: delete the one line with a private ticket number
   (`AJM-NNN`) first.

   The merge triggers the
   [Deploy Documentation](https://github.com/adamjmurray/producer-pal/actions/workflows/deploy-docs.yml)
   action. Watch it finish, then check the
   [upgrading page](https://producer-pal.org/installation/upgrading) shows the
   new version.

3. Rebuild and tag, still on `dev`. The files must say `X.Y.Z`, not `-rcN`:

   ```sh
   npm run release
   npm run tag               # vX.Y.Z; run the push command it prints
   ```

4. Create a GitHub release for `vX.Y.Z` (**not** a pre-release) and upload the
   fresh files. This is what prompts everyone to update.

5. Publish to npm. Test the tarball as in step 4, then publish that same file:

   ```sh
   npm login
   npm run guard:device
   cd npm
   npm run guard:no-prerelease
   npm pack                              # → producer-pal-X.Y.Z.tgz; test it
   npm publish ./producer-pal-X.Y.Z.tgz
   rm producer-pal-X.Y.Z.tgz
   cd ..
   ```

   Publishing a tarball skips the publish guard, so the two guards are run by
   hand. A published version can never be replaced.

6. Publish to the [MCP Registry](https://registry.modelcontextprotocol.io),
   after npm (it checks the published package):

   ```sh
   cd npm
   mcp-publisher validate
   mcp-publisher login github   # open the URL, enter the code
   mcp-publisher publish
   curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.adamjmurray/producer-pal"
   cd ..
   ```

   First time: `brew install mcp-publisher`. "Registry validation failed for
   package" means the npm version has no `mcpName`. "Invalid or expired Registry
   JWT token" means log in again.

## 6. Start the next cycle

Do this right after shipping, so there's a place for new work.

1. Sync local `main` — the only time you switch to it:

   ```sh
   git switch main && git pull
   git switch dev
   git rebase main              # or: git merge main
   ```

2. If a branch for the next release was started early and you're ready to commit
   to its changes, merge it into `dev` now.

3. Bump to the next minor, unless that branch already did:

   ```sh
   npm run version:bump:minor   # 2.2.0 → 2.3.0-rc1
   npm run check
   git add .
   git commit -m "bump version to X.Y.0-rc1"
   ```

4. Push and open the next release PR:

   ```sh
   git push origin dev
   ```

   Open a draft PR `dev → main` titled with the version. It stays open all cycle
   and its body is the changelog.

## Fixing a candidate

Never replace files under a version that's been handed out. Cut the next
candidate instead:

```sh
# commit the fix on dev, then:
npm run version:bump:rc   # 2.1.0-rc1 → 2.1.0-rc2
npm run check
git add .
git commit -m "bump version to X.Y.Z-rcN"
git push origin dev
npm run release
npm run tag               # then run the push command it prints
```

Publish a new pre-release ([step 3](#3-tag-and-pre-release)), tell the testers,
and retest. Old pre-releases can be deleted once nobody is on them.

## Urgent fix after a release

A published version is spent, so the fix is a new patch release on its own
branch off `main`:

```sh
git switch main && git pull
git switch -c X.Y.Z+1     # after 2.3.0 that's 2.3.1
npm run version:bump      # → X.Y.Z+1-rc1
npm run check
git add .
git commit -m "bump version to X.Y.Z+1-rc1"
git push -u origin X.Y.Z+1
```

Open a PR `X.Y.Z+1 → main`, land the fix there, and run steps 1–5 against that
branch instead of `dev`.

Don't create the branch or PR ahead of time: the patch number depends on what
has shipped, and a PR's head branch can't be changed later.

Afterwards, rebase `dev` onto `main` (never merge). Keep `dev`'s version when
the version files conflict.

## Version bump commands

```sh
npm run version:bump        # open a patch: 0.9.0 → 0.9.1-rc1
npm run version:bump:minor  # open a minor: 0.9.1 → 0.10.0-rc1
npm run version:bump:major  # open a major: 0.9.1 → 1.0.0-rc1
npm run version:bump:rc     # next candidate: 2.1.0-rc1 → 2.1.0-rc2
npm run version:bump:ga     # close the cycle: 2.1.0-rc4 → 2.1.0
npm run version:bump:to -- 2.1.0-rc1   # escape hatch, any version
```

The three opening bumps ignore the current suffix, so retargeting mid-cycle is
one bump plus editing the release PR title (`version:bump:major` on `2.3.0-rc3`
gives `3.0.0-rc1`).

Never edit a version by hand. The script writes every copy, and
`src/test/meta/versions/version-agreement.test.ts` fails if they disagree.
