# Fixing Releases

Part of [Releasing](README.md).

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
   npm run tag
   git push origin dev vX.Y.Z-rcN
   ```

4. **Publish a new pre-release** for the new tag (Step 2), and tell the testers
   directly — a pre-release never prompts anyone
   ([How update detection works](build-and-pre-release.md#how-update-detection-works)).
   The superseded pre-release can be deleted once nobody's on it.

5. **Retest** and repeat if necessary

Any number of candidates can burn this way at no cost: they're never published
to npm, and the version people upgrade to is still the plain `X.Y.Z` at the end
of the cycle.

## Urgent Fixes After a Release

Once Step 5 publishes to npm, that version is spent — npm never lets a published
version be replaced. A fix means a new patch release, on its own branch cut from
`main` and named for the next unused patch:

```sh
git switch main && git pull
git switch -c X.Y.Z+1     # after 2.3.0 that's 2.3.1; after 2.3.1, 2.3.2
npm run version:bump      # → X.Y.Z+1-rc1
npm run check
git add .
git commit -m "bump version to X.Y.Z+1-rc1"
git push -u origin X.Y.Z+1
```

Open a PR `X.Y.Z+1 → main`, land the fix there, and run the release process from
Step 0 against that branch instead of `dev`.

Don't cut the branch or open its PR before a bug calls for one. Which patch
number it should carry depends on what has shipped by then, and an empty
placeholder can't be handed to a different branch later — **a PR's head branch
is fixed once the PR exists**.

Afterwards `main` has moved, so rebase `dev` onto it (never merge). `dev` keeps
its own minor version, so resolve the version-file conflict in `dev`'s favor.
