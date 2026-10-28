# Releasing

## Preparation

Do this right after the previous release lands on `main`. Every build then says
which cycle it belongs to, so going back to a build to check whether something
is a regression is unambiguous.

1. Point `dev` at the next minor:

   ```sh
   git switch dev
   git rebase main
   npm run version:bump:minor   # 2.2.0 → 2.3.0-rc1
   npm run check
   git add .
   git commit -m "bump version to X.Y.0-rc1"
   git push origin dev
   ```

2. Open a draft PR `dev → main` titled with the version. This is the release PR:
   it lives all cycle, makes CI status and the accumulating scope easy to see,
   and its body is the changelog.

`dev` always goes straight to the next **minor**, never a patch, even when the
cycle looks like it'll be small. Patch releases exist for urgent fixes on top of
a shipped release, and they get their own branch off `main` — cut only when a
bug actually calls for one. See
[Urgent Fixes After a Release](fixing-releases.md#urgent-fixes-after-a-release).

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

**Retargeting mid-cycle is free.** The three opening bumps name where the
release is going, not where it's been — they ignore the suffix already there and
restart the candidate count, so `version:bump:major` on `2.3.0-rc3` gives
`3.0.0-rc1`:

```sh
npm run version:bump        # patch: 0.9.0 → 0.9.1-rc1
npm run version:bump:minor  # minor: 0.9.1 → 0.10.0-rc1
npm run version:bump:major  # major: 0.9.1 → 1.0.0-rc1
```

The release PR lives on `dev`, so retargeting is that bump plus editing the PR
title.

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
2. `remote-script/Producer_Pal/version.py` — the remote script's version
3. `npm/package.json` — the `producer-pal` npm module's version
4. `package.json` and `claude-desktop-extension/package.json`
5. The `version` **and** `packages[""].version` fields of all three lockfiles
   (npm keeps it twice per lockfile, and a hand-edit reliably misses one)

`claude-desktop-extension/manifest.json` also carries a version — the one Claude
Desktop shows — but the bump script does not write it. It's generated from the
template during the build, so it picks the version up on its own.

Nothing reconciles any of this at runtime — whichever copy an artifact happens
to read is what it claims to be — so
`src/test/meta/versions/version-agreement.test.ts` asserts they're identical,
and `npm run tag` re-checks the config.ts one. That test's file lists are the
authoritative inventory; this section deliberately doesn't restate a total,
because a count in prose goes stale silently.

## The steps

| Part                                                 | Covers                                                                              |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [build-and-pre-release.md](build-and-pre-release.md) | Step 0 checklist, Step 1 build release files, Step 2 create the GitHub pre-release  |
| [testing-and-shipping.md](testing-and-shipping.md)   | Steps 3 to 5: test the pre-release, test the npm portal, ship it; publishing to npm |
| [fixing-releases.md](fixing-releases.md)             | Fixing issues during pre-release; urgent fixes after a release                      |
