# 2.4.0 RC adversarial review

`origin/dev` e36bf1a66 vs `origin/main`, focused on the 82 commits after
74a512c0b. Earlier findings (PR #1185's ADVERSARIAL-REVIEW.md and the pasted
results file) are not repeated. The fixes for them were re-checked, and they
hold except where noted below. CI is green on e36bf1a66. No tracked files were
changed, and every throwaway test was deleted.

**C** = confirmed (reproduced in a mock/simulator test, or traced end to end).
**P** = plausible (traced, timing- or Live-dependent, not reproduced).

## Blockers

### 1. MED C, new — a locator delete ignores `\,`, deletes the wrong locators, and says the right one doesn't exist

- **Where:** `src/tools/live-set/helpers/locator-targets.ts:257-272` (`deleteNames`).
- **Call:** Set has locators "Verse, take 2", "take 2" and "Intro". Send
  `ppal-update-live-set {locatorOperation:"delete", locatorName:"Verse\, take 2,Intro"}`.
- **Result:** "take 2" and "Intro" are deleted, and "Verse, take 2" is kept.
  Its entry says `nothing to delete: no locator named "Verse\"` without
  `ok:false`.
- **Why:** `deleteNames` splits with `targetEntries`, which splits on every
  comma. Create and rename use the escape-aware `splitList`/`valueForIndex`. The
  object-paths Skill (`src/skills/fragments/object-paths.ts:31`) tells models to
  write `\,` when there are several names.
- **Since:** dbf215837.
- **Other tools checked:** every other text list (name, color, timeSignature,
  routing, sendReturn, sampleFile, duplicate labels, create-device) goes through
  the escape-aware helpers.
- **Fix:** unescape before the whole-value lookup, and split with the
  escape-aware `splitList`.

### 2. MED C, new on dev (already at 74a512c0b, not on main) — update-clip points a trimmed clip's entry at another clip from the same call

- **Where:** `src/tools/clip/update/helpers/batch/buried-clips.ts:71,110-130`.
  `reportTrimmedSurvivor`/`findRemainder` have no `taken` set.
- **Call:** clips a, b, c of 8, 2 and 2 beats. Send
  `ppal-update-clip {id:"a,b,c", arrangementStart:"101|1,101|1,102|3"}`.
- **Result:** entry 0 names clip c's copy (`t0[102|3]`, the same id as entry 2)
  as a's trimmed rest. a's real rest at `t0[101|3]` is never reported.
  Reproduced in the arrangement simulator.
- **Other tools:** duplicate got this fix in e9ddde96f
  (`overwritten-copies.ts:63-80`); update-clip didn't.
- **Fix:** pass `findRemainder` a `taken` set seeded with the ids of entries
  still at their paths, as duplicate does.

### 3. MED C (traced), new — update-device `preset` says "not loaded" when reapplying a file-path preset that did load

- **Where:** `remote-script/Producer_Pal/routes.py:137`, reported via
  `src/tools/device/update/helpers/update-multiple-targets.ts:446`.
- **Why:** for `type:"file"`, `_find_item` returns kind `None`
  (`routes.py:217-227`). A same-device preset keeps the device and Live renames
  it to the preset's name. So when the device already has that name, a
  successful reload looks untouched and gets a 409.
- **Call:** `ppal-create-device {path:"t0/d+", preset:"/…/AG Bass.adv"}`, then
  `ppal-update-device {path:"t0/d0", preset:"/…/AG Bass.adv"}` (e.g. "reset my
  tweaks").
- **Result:** the error `Live didn't load 'AG Bass.adv' onto 'AG Bass'…`. A lone
  target throws; in a list the entry is `ok:false`. The device was actually
  reset.
- Three reviewers found this independently. Only update-device uses `/hotswap`.
- **Fix:** skip the 409 when `after.name` equals the preset file's stem, or
  work out the kind of a file item from its browser tree.

### 4. MED P, new — a hotswap that times out on the V8 side still lands later; the entry says "not loaded" and the rest of the update goes to the old device

- **Where:**
  - `src/tools/device/create/helpers/browser-presets.ts:137-178` (`hotswapPreset`)
  - `src/tools/device/update/update-device-with-preset.ts:81`
  - `update-multiple-targets.ts:445`
  - `remote-script/Producer_Pal/bridge.py:122-158` (`_Job`)
- **Why:** V8 waits only `remoteScriptWait(deadline)`, which shrinks toward 0
  on later targets. Python abandons a queued job only after its own 30 s, so the
  hotswap still runs after V8 has written "preset not loaded".
- **Result:** name, params and toPath are written to the old device (confirmed
  with a mock test). Then the late swap resets those params, or a rack replaces
  the device and the reported id is dead.
- **Call:** `ppal-update-device {path:"t0/d0,t1/d0,t2/d0", preset:"<heavy rack>"}`
  with slow loads or a short Timeout setting.
- create-device's loads are protected by the temp track's name; `/hotswap`
  has no such guard.
- **Fix:** send an expiry with `/hotswap` and have `_Job.run` skip expired
  jobs. At minimum, on a V8 timeout say "may still load; read the device before
  re-running" and skip the rest of that target.

### 5. MED P, already on main — moving an arrangement clip earlier by less than its length leaves a copy of its tail behind, silently

- **Where:**
  - `src/tools/shared/arrangement/arrangement-tiling-workaround.ts:408-474`
    (`clearOverlappingClip` step 4)
  - the `clip.exists()` guard at
    `src/tools/clip/update/helpers/arrangement/arrangement-move.ts:193`
- **Why:** the landing clears the source like any other clip in the way. It
  re-creates the source's tail under a new id and deletes the original, so
  `exists()` is false and the tail is never removed.
- **Call:** a 4-beat clip at [0,4) and a 16-beat clip at [8,24) on t0. Send
  `ppal-update-clip {id:<16-beat>, arrangementStart:"2|3"}`.
- **Result:** the clip lands at [6,22) and a stray clip sits at [22,24). The
  entry is a plain `{id, path}`.
- The same happens with `arrangementLength`. A move earlier along a clip's own
  take lane is likely affected too (traced only).
- **Confirmation:** reproduced in the arrangement simulator, which runs the
  real clearing code. Not run in Live, and no e2e test moves a clip backwards
  onto itself (only +1 bar forward). Needs one e2e case before calling it
  confirmed. Ask first, since e2e opens a Set without saving.
- **Fix:** for a move, delete the source once the holding copy is confirmed
  and before clearing, or remove the re-created rest that ends at the source's
  old end.

### 6. LOW C, new — release notes and docs that say something false about 2.4.0

- **Release notes, update-clip bullet:** they quote
  `"not moved: clip t1/s1 (id 456) moves to t1/s2 later in this call"`. The code
  says `not moved: t1/s2 is named again later in this call`
  (`move-destinations.ts:347`).
- **Release notes, Internal:** "with one target the whole value is literal".
  Since dbf215837, `\,` is unescaped even with one target
  (`list-pairing.ts:105,127,157`), and the notes never mention `\,`. Fix: "with
  one target a bare comma is part of the value; with several, write `\,`".
- **Release notes, Chat UI:** "at most 20 images and 15 MB, newest first; older
  images past that go as a short text note". Mistral is capped at 8
  (`webui/src/hooks/chat/adapter.ts:322-325`). The newest message's own images
  are also dropped past 15 MB (`build-model-messages.ts:143-162`), while its
  bubble still shows every thumbnail. Fix: "20 images (8 on Mistral) and 15 MB;
  images past that, newest message included, go as a short text note".
- **`docs/guide/migration.md:160`:** lists "an occupied clip slot" as a
  destination that gets no clip, but 2.4 replaces it (the same guide, ~line
  414). Fix: "a slot named again later in the call".
- **`docs/features/tools.md:374-375`:** says `looping:true` with `warping:false`
  "warns". It's now a `detail` on the clip's entry (`audio-updates.ts:79-85`).
  This regressed on dev (the doc was true on main).

## Deferred

- `docs/guide/migration.md` omits that update-live-set's `scalePitches` changed from an array to a comma-joined string (`update-live-set.ts:141-144`); the release notes have it.
- `docs/guide/migration.md` omits that `instrument` now reads `Instrument Rack (Operator, Wavetable)`, and its playback row "read `scene.name`" needs "(2.4: gone)".
- `docs/guide/migration.md` says a failed duplicate copy is `{path, ok:false, detail}`; a failed track/scene copy is addressed by the source (`{id|path, …}`).
- `docs/guide/migration.md` (~328) says the detail starts `no send landed`/`no param landed`; it starts with whichever refusal was noted first.
- `docs/guide/migration.md` (~160) still says "named in the reason".
- `docs/guide/migration.md` lists only `name`/`toPath`/`focus` as going with wrapInRack; `force` is accepted silently too.
- The release notes don't mention d903480a4 (wrapInRack refuses other args) or 5e4073f25 (an edit can remove attached images).
- `\,` is taught only in the object-paths Skill: it's not in any `.def.ts` (e.g. `sampleFile`), the clip/device descriptions, the small-model Skills or docs/, so a model with only clip tools never learns it.
- With one target, `\,` is unescaped: a name `A\,B` lands as `A,B`, and a sampleFile `C:\dir\,x.wav` becomes `C:\dir,x.wav`.
- The create-device description still says "Create a native Live device", and tools.md's Create Device list omits plug-in and Max device loading.
- The library.def `kind` preset/device-group text doesn't say that loading needs the remote script.
- `docs/how-it-works/the-bridge.md:103` uses "quantize parameter ignored for audio clip" as a warning example; it is now a per-clip detail.
- `.github/pull_request_template.md` links `./CONTRIBUTING.md` relative to `.github/` (pre-existing).
- Question: should "last target wins" (01c4a3ca0) reach update-track, update-scene, take lanes and update-device? Today `id:"5,5", name:"A,B"` writes both, and the first entry reads as a hit for "A".
- create-clip naming one arrangement spot twice (`t0[101|1],t0[101|1]`) reports the first clip as created though it's gone (main). Question: extend last-wins to arrangement spots?
- Shorten-then-move (614b60611): a move that is then refused leaves the clip shortened (reported). Question: refuse before resizing?
- create-clip session replace happens before the name/color/notes writes; a later throw is `ok:false` with no "overwrote" note.
- shortenThenMove / handleArrangementStartOperation: a throw after the copy lands reports the source id, and the moved copy drops out of the result.
- `createAudioClipInSession` leaves an extra empty scene when the last scene isn't empty; shorten-before-move now reaches it too (main).
- A lone take-lane target sending only ignored params (`update-track {path:"t0/l0", gainDb:-3}`) returns an `ok:false` entry instead of throwing (`track-take-lanes.ts:118-135`).
- Delete by id/time doesn't check that the toggle deleted rather than created a locator (main; a stall now throws).
- Delete-by-name with a mistyped whole name (`"Verse, Take 2"`) splits and deletes a separate "Verse" locator (by design).
- `loc:<digits>` tries the id first, so a locator named "3" loses to one whose Live id is 3 (documented).
- `resolveLocatorToBeats`/`resolveLocatorListToBeats` in `src/tools/shared/locator/locators.ts` are dead code (tests only).
- The playback def's `{id, path}` entry text doesn't mention the `detail` on a repeated slot's earlier entry.
- In delete, the earlier mention of an object that a later mention deletes reports the caller's `path`, which now names whatever slid in (`delete-targets.ts` ~124, main).
- In update-clip, the earlier mention's entry holds a dead id and old slot when the later mention re-creates a session clip (`move-destinations.ts:203`, main class).
- `focusLastUpdatedClip` can fall back to a "named again" entry (harmless today).
- A Max for Live or plug-in preset hotswapped onto a different device may finish after `load_item` returns, and be reported as kept with the old id. Needs a check in Live.
- A preset target inside a rack an earlier target replaced, or the same device named twice with `preset`, gets `device_path must end in 'devices <index>'`.
- A preset or `.adg` that contains the Producer Pal device isn't refused; the remote script checks only the item's name.
- create-device with `device` plus an absolute-path `preset` skips the check that the preset belongs to that device.
- The hotswap `device_name` guard can't tell apart two same-named devices after an index shift.
- A remote script from before 2.4 ignores `track_name` and falls back to `track_index`, so the temp-track race returns. V8 doesn't check the script version.
- `withTempTrack`'s `finally`: if restoring the selected track throws, that error replaces a successful load.
- `browser.py find_file`: a Places/pack name matches any folder in the path (`/Users/me/ProjectA/Samples/kick.wav` resolves to `Places/Samples/kick.wav`, a different file).
- Node's preset regex doesn't treat UNC paths (`\\server\…`) as absolute.
- An update-device entry for a device that a later target deletes (force pad `sample`) has no `path` since 4ee528ae4.
- `removeHostTrackDevice` (`duplicate-track.ts:71`) removes the whole top-level rack from the copy when Producer Pal sits inside a rack on the host track (main).
- Device/chain copies from the host track (or its group) briefly make a second Producer Pal device via the temp track copy (main).
- `duplicateScene` (`duplicate-scene.ts:71`) assumes the copy landed at index+1, with no landing check (main).
- `lengthenCopy` (78a8f1a32): a throw after tiling leaves extra tiles unreported.
- A track or scene copy that throws after landing is `ok:false` though the copy exists (main).
- An arrangement copy whose tail a later copy covers is shortened with no `detail`.
- `refuseClipOverwrites` (`source-overwrites.ts:85-92`) computes `arrangementLength` for session destinations, so a list-count error can mask the overwrite refusal.
- The drum-pad duplicate refusal says "would overwrite", but a pad copy layers.
- Question: should delete refuse a return track hosting the device, for symmetry? It can't happen today.
- The webui budget stops at the first image that doesn't fit, dropping smaller older ones that would.
- OpenRouter or a custom endpoint serving a Mistral model gets the 20-image cap, not 8.
- Finder copy, or Firefox Copy Image, pastes the file name/URL text as well as the image.
- The composer keeps its text and a loading image across a conversation switch, so the image can land in another conversation.
- `MarkdownEditor` updates `onSubmitRef` in `useEffect`, so an Enter within a frame of a paste can run the previous handler (pre-existing).
- Remote Script tab: the Update/Downgrade/Reinstall label reflects the detected User Library, not a typed path.
- Remote Script tab: a refresh resets a typed path when the detected library changes.
- Remote Script tab: "Installed to X" stays up when the follow-up refresh fails.
- Edit and retry forks store another copy of every image in IndexedDB.
- The install rollback test "keeps the working install when the new copy can't be written" (`remote-script-install.test.ts:188`) still fails when run as root.
- The e2e `reason` guard (`mcp-test-helpers.ts:156`) fails on any `reason` key, including user or Live data such as ppal-live-api output.
- Test gaps: hotswap on a nested device, a file-path preset reapplied, a timeout followed by a late run, and a backward self-overlap move (e2e).
