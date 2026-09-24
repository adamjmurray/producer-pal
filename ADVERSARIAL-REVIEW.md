# Adversarial Review: `dev` vs `main`

- **Range:** `origin/main` (4fa6b8407, the merge base) → `origin/dev`
  (74a512c0b). That's 262 commits and 1,639 files (+99k / −41k lines).
- **Method:** the diff was split into eight areas, and each went to its own
  reviewer. Each reviewer read the changed code and tried to break it with
  concrete inputs. Many findings were checked with throwaway mock tests (none
  are committed). Line numbers refer to `origin/dev`.
- **Legend:** **new** means dev introduced it; **pre** means it was already on
  `main`.

## Verdict

There is **one High**: create-clip can destroy a user's clip. Fix it before
`dev` ships. The rest are Medium or Low.

There are three kinds of Medium problem:

- Results that name the wrong object after inserts shift indices.
- Writes that happen before a call is refused.
- A few regressions in how paths are addressed.

Checks with no problems found:

- **Security:** the remote-script HTTP server's origin, host and bind checks, no
  XSS in the webui, and no API-key leaks.
- **Notation grammar:** parity across the duplicated note-value grammar sites.
- **Request channel:** the V8↔Node request-channel refactor.
- **Scene and track placement:** the planner for `s+` and past-the-end paths
  (fuzzed).

## Top findings

| #   | Sev      | New? | Area   | Where                                                                           | Defect                                                                                                                                                                      |
| --- | -------- | ---- | ------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **High** | new  | clip   | `src/tools/clip/helpers/clip-results.ts:139`                                    | create-clip deletes the clip in an occupied slot before it creates the new one. If the create fails (e.g. a bad `sampleFile`), the user's clip is gone.                     |
| 2   | Med-High | new  | dup    | `src/tools/actions/duplicate/helpers/sources/duplicate-one-source.ts:109`       | Copying several scenes reports stale paths: `path:"s3,s1"` reports `s4`, which now names the **source**. A follow-up edit changes the original.                             |
| 3   | Med      | new  | clip   | `src/tools/clip/helpers/clip-results.ts:143`                                    | create-clip naming the same slot twice deletes its own first clip, and still reports it as created.                                                                         |
| 4   | Med      | new  | clip   | `src/tools/clip/update/helpers/batch/run-clip-batch.ts:284`                     | A throw after an arrangement move lands reports the moved clip as not updated, with the deleted id. The new clip's id is lost.                                              |
| 5   | Med      | pre  | clip   | `src/tools/clip/update/helpers/batch/run-clip-batch.ts:107`                     | A bad `color`, or a gap in the `name` list, is refused only after `arrangementSplit` has already cut the clips.                                                             |
| 6   | Med      | new  | dup    | `src/tools/actions/duplicate/duplicate.ts:346`                                  | A return-track source passes the up-front check, so `id:"<t0>,<rt0>"` copies t0 and then throws. The copy is never reported.                                                |
| 7   | Med      | new  | dup    | `src/tools/actions/duplicate/helpers/sources/duplicate-track.ts:257`            | Copying a group ignores its members: `withoutClips` and `withoutDevices` miss them, and copying the host group adds a second Producer Pal device.                           |
| 8   | Med      | pre  | dup    | `src/tools/actions/duplicate/helpers/device/duplicate-chain.ts`                 | Duplicating a chain or drum pad skips the Producer Pal device check.                                                                                                        |
| 9   | Med      | pre  | dup    | `src/tools/actions/duplicate/helpers/sources/scene-arrangement-positions.ts:80` | Scene copies with `count>1` step by the scene's length and ignore `arrangementLength`, so they overlap or leave gaps.                                                       |
| 10  | Med      | new  | shared | `src/tools/shared/locator/locators.ts:231`                                      | An all-digit locator ref is looked up only as an id: `loc:2` no longer finds the locator named "2", and `loc:26` can resolve to the wrong locator.                          |
| 11  | Med      | new  | track  | `src/tools/track/update/helpers/track-take-lanes.ts:198`                        | A take lane on a track with more than 10 lanes can't be renamed, even though the rename creates nothing.                                                                    |
| 12  | Med      | pre  | device | `src/tools/device/update/helpers/wrap-devices-in-rack.ts:397`                   | `wrapInRack` creates chains while it looks up its sources, then refuses the wrap and leaves them behind.                                                                    |
| 13  | Med      | new  | core   | `src/mcp-server/max-api-adapter.ts:59`                                          | The 45 s tool timeout doesn't outlast a remote-script plug-in load (45 s in V8, several steps). Node says it timed out while V8 goes on, so a retry duplicates the devices. |
| 14  | Med      | new  | core   | `src/tools/device/create/helpers/browser-devices.ts:155`                        | The plug-in load finds its temp track by index, not identity, so a concurrent insert, or a 504 job that runs late, can load it onto a user's track.                         |
| 15  | Med      | new  | infra  | `examples/skills/ableton-read-als/read-als.mjs:443`                             | read-als drops every audio arrangement clip, because they're stored under `MainSequencer/Sample`, not `ClipTimeable`.                                                       |
| 16  | Med      | new  | webui  | `webui/src/chat/sdk/build-model-messages.ts:88`                                 | Images are re-sent every turn with no total cap. Once a request passes a provider's limit, every later turn fails, and retry and edit can't recover.                        |
| 17  | Med      | new  | webui  | `webui/src/components/chat/assistant/UserImages.tsx:48`                         | Every render rebuilds and compares multi-MB `data:` URLs, which adds about 5 ms per image per stream chunk or keystroke.                                                    |
| 18  | Med      | new  | webui  | `webui/src/hooks/chat/helpers/use-image-attachments.ts:98`                      | Pasting from Excel, Word or OneNote attaches a picture and drops the text.                                                                                                  |
| 19  | Med      | new  | webui  | `webui/src/hooks/chat/helpers/use-image-attachments.ts:61`                      | An image still loading when the user presses Send is silently left out of the message.                                                                                      |

Two reviewers each found the same Low-Medium problem, so the evidence for it is
strong. With **one target**, two comma-bearing values with different comma
counts are refused as a list-length mismatch (`list-lengths.ts:49`). Example:
`name:"Bass, Sub"` with `outputRoutingType:"Low, End, Bus"`. This breaks the
rule that one target makes the whole value literal.

## Suggested order

1. **Fix #1 before release.** Use the scratch-slot pattern `recreateIntoSlot`
   already has, or delete the old clip only after the create lands. Refuse or
   dedupe a repeated slot, which covers #3.
2. **Wrong-object results (#2, #4, the device-path finding in the dup
   section).** Re-read paths by id after every source has run, the way
   `settleTrackCopyPaths` already does for tracks.
3. **Write before refuse (#5, #6, #12, capture timeSignature).** Move these
   checks into the existing up-front refusal passes.
4. **Addressing regressions (#10, the one-target comma rule, `[` in a locator
   name).**
5. **Remote-script load (#13, #14).** Fix the timeout budget and send a stable
   track identity.
6. **Webui image handling (#16–#19).**

---

## Findings by area

### Clip tools (`src/tools/clip/**`)

1. **High: create-clip deletes the clip in an occupied slot before it knows the
   new clip will land.** `src/tools/clip/helpers/clip-results.ts:139-149`
   (`prepareSessionClipSlot`), called from
   `create/helpers/audio-clip-creation.ts:38` and
   `create/helpers/clip-iteration.ts:301`.
   - Defect: `delete_clip` runs first, then `create_audio_clip`/`create_clip`,
     then `requireCreatedSessionClip` throws if Live made nothing. This
     regressed in c34c318a0; main refused an occupied slot.
   - Failure: `ppal-create-clip {path:"t0/s0", sampleFile:"/typo/kick.wav"}` on
     an occupied slot deletes the user's clip. The call then throws
     `Live created no clip at t0/s0`, and nothing says the original is gone.
     Nothing validates the sample path first (V8 has no filesystem).
   - Confidence: Confirmed by reading the code.
   - Fix: use the scratch-slot pattern `recreateIntoSlot` already uses
     (`shared/clip/recreate-into-slot.ts`): create in an empty slot, then
     replace. Or delete only after the create succeeds.

2. **Medium: one create-clip call that names the same slot twice destroys its
   own first clip and still reports it as created.**
   `create/helpers/create-clip-destinations.ts:224-247` (no dedupe) plus
   `clip-results.ts:143`.
   - Defect: this is also new with the replace-occupied-slot change. The second
     destination sees `has_clip`, deletes the clip the first destination just
     made, and creates its own.
   - Failure: `path:"t0/s0,t0/s0", name:"A,B"` returns
     `[{id:A,…},{id:B, reason:"overwrote the existing clip at t0/s0"}]`. Clip A
     is dead, and entry 1 carries its id as a success. update-clip refuses this
     ("already moving to t0/s0"); create-clip does not.
   - Confidence: Confirmed by reading the code.
   - Fix: refuse or skip a repeated slot destination at resolve time, the way
     update-clip's `claimDestination` does.

3. **Medium: a throw after a move lands reports the moved clip as "not updated",
   using an id that no longer exists.**
   `update/helpers/batch/run-clip-batch.ts:284-287` (`settleClipTurn`), with
   `update/helpers/arrangement/arrangement-move.ts:247-309`.
   - Defect: results are pushed only at the end of
     `handleArrangementOperations`. So a throw in the resize, after the move has
     already copied the clip and deleted the source, leaves `entry == null`.
     That becomes a skip `{id:<old>, ok:false}`, or a thrown error for a single
     target (`loneRefusal`). This contradicts the comment "a throw partway … is
     reported on the entry rather than as a refusal". Main only warned.
   - Failure, reproduced with mocks:
     `{id:"789", arrangementStart:"9|1", arrangementLength:"2bar"}`, where the
     shortening temp clip fails (`create_midi_clip` returns id 0). Calls made:
     `duplicate_clip_to_arrangement`, then `delete_clip id 789`. Result:
     `THROW Live created no clip at t0`. With two ids:
     `{id:"789", ok:false, …}`. The moved clip 999 at bar 9 is never reported,
     and 789 is dead.
   - Confidence: Confirmed with mocks. That Live throws here is plausible
     (temp-clip, scene, or tiling failures).
   - Fix: push or record the moved clip's entry right after the move lands (or
     catch inside `handleArrangementOperations`), then append the resize failure
     to it as a reason.

4. **Medium: an invalid `color` or a hole in the `name` list is refused only
   after `arrangementSplit` has already cut the clips.**
   `update/helpers/batch/run-clip-batch.ts:107-112` (`pairLabels`) runs after
   `plan-clip-update.ts:393` (`performSplitting`).
   `update-clip-refusals.ts:246-271` validates timeSignature, quantizePitch,
   start, length and firstStart up front, but not name or color.
   - Failure, reproduced: `{id:"clip_1", arrangementSplit:"2|1", color:"red"}`
     throws `invalid color "red"` after `duplicate_clip_to_arrangement`,
     `create_midi_clip`, `delete_clip` and more have run. `name:"A,,B"` with 3
     ids behaves the same way.
   - This existed on main too, but it breaks the "refused before any write" rule
     this branch enforces for the other per-clip lists (5e5936d66).
   - Confidence: Confirmed with mocks.
   - Fix: call `pairLabels` (or `parseNames`/`parseColors`) inside
     `refuseUnreadableCall`, before `planClipUpdate`.

5. **Low: a held-back clip whose overwrite never landed comes back with no
   reason.** `update/helpers/arrangement/update-clip-deferred-deletion.ts:115`.
   - Defect: the entry is `{id, path, deleted:false}`. The module header says
     "its entry says so", but nothing is appended. `deleted:false` also leaks
     into the result.
   - Failure: `id:"A,B", arrangementStart:"17|1"` where B's copy is declined
     gives `[{id:A, path:"t0[1|1]", deleted:false}, {id:B, ok:false,…}]`. A
     reads like success, but it was never moved (see
     `arrangement-move.test.ts:521`).
   - Confidence: Confirmed (the existing test expects this).
   - Fix: append `not moved: …` to that entry, and omit `deleted` when it is
     false.

6. **Low: an arrangementLength that changed nothing still counts as work that
   landed.** `update/helpers/arrangement/arrangement-move.ts:291-293` with
   `arrangement/helpers/unlooped-lengthening.ts:158,221`.
   - Defect: the unlooped-audio branch refuses
     (`arrangementLength unchanged: the audio file has no more content`) but
     still returns `[{id}]`. The caller then calls `markClipLanded`, so
     `clipLandedNothing` is false.
   - Failure: a lone `{id, arrangementLength:"8bar"}` returns a normal entry
     instead of the `ok:false` that the take-lane and session-clip refusals
     give. This is inconsistent with the skill's "a call that asked for nothing
     else reports ok:false".
   - Confidence: Confirmed by reading the code.
   - Fix: return `[]` from the no-op branches, or skip `markClipLanded` when the
     length op itself refused.

7. **Low: `auto` launches slots whose create failed.**
   `create/create-clip.ts:419` and
   `create/helpers/create-clip-validation.ts:162-198`.
   - Defect: `play-clip` fires every entry in `clipSlots`, and `play-scene`
     fires the scene of `clipSlots[0]`, including destinations that came back
     `ok:false`.
   - Failure: `path:"t5/s0,t0/s0", auto:"play-clip"`, where t5 refuses the clip,
     fires whatever clip was already in t5/s0. With `play-scene`, a first slot
     refused before its scenes were made throws `no scene at sN` after the other
     clips were created.
   - Confidence: Plausible.
   - Fix: pass only the slots whose entries are real clips.

8. **Low: `clip.index` / `clip.count` for transforms and code don't match how
   name and the value lists pair.**
   `update/helpers/batch/run-clip-batch.ts:162-169`.
   - Defect: name, color, timeSignature, start, etc. pair by call slot (`slot`).
     `clipIndex`/`clipCount` use the position among resolved clips (`i`,
     `clips.length`).
   - Failure: `path:"t0/s9,t0/s0,t0/s1"`, where t0/s9 is empty, with
     `name:"A,B,C"` and `transforms` using `clipseq(...)`: the clip named B gets
     `clip.index` 0 and `clip.count` 2, so a per-clip transform list shifts by
     one against the names.
   - Confidence: Confirmed by reading the code.
   - Fix: pass `slot` and `targets.named.length`, or document that the index
     counts resolved clips.

Checked and not reported (fine, pre-existing, or by design): the per-clip value
pairing uses the same count up front and at runtime; start/length validation in
any meter; take-lane destinations kept for bare positions; the move-order graph
and overwrite-plan keys; buried and trimmed read-back; whitespace-only
transforms; the note/transform parse before writes on MIDI; create-clip's plan
cache (notes are cloned per clip); a lone lane `toPath` refused for several
clips (intended, 21b8d576f/0eafa53a4); a comma in sampleFile needing a
single-target call (documented).

### Duplicate and delete (`src/tools/actions/**`)

1. **Medium-High** —
   `src/tools/actions/duplicate/helpers/sources/duplicate-one-source.ts:109`
   (plus `duplicate-scene.ts:73,103`)
   - Defect: after a multi-source session scene duplicate, only track copies get
     their paths re-read (`settleTrackCopyPaths`). Scene entries and their clip
     paths are frozen at `sceneIndex + 1` when each copy is made.
   - Failure: `type:"scene", path:"s3,s1"`. Turn 1 copies s3 to s4 and reports
     `path:"s4"` with clips `t0/s4`. Turn 2 inserts s1's copy at s2, which
     pushes that copy to s5. The first entry's `s4` / `t0/s4` now names the
     **source** scene s3 and its clips, so a follow-up update-clip on those
     paths edits the original.
   - Confidence: Confirmed (code reading; no settle step exists for scenes).
   - Fix: re-read each scene entry's index (and its clip paths) by id after
     every source has run, the same way `settleTrackCopyPaths` does for tracks.

2. **Medium** — `src/tools/actions/duplicate/duplicate.ts:346-358`,
   `helpers/sources/duplicate-one-source.ts:369-379`
   - Defect: `validateSourceIds` is meant to catch a bad source before any copy
     is made, but it only type-checks. A return track passes the "track" check,
     and `regularTrackIndex` refuses it only when that source's turn comes. This
     is write-before-validate.
   - Failure: `type:"track", id:"<t0 id>,<rt0 id>"`. t0 is duplicated, then the
     call throws `rt0 (id …) is not a regular track…`. The new copy of t0 exists
     but is never reported. Reproduced with a scratch vitest:
     `duplicate_track 0` was called, then the error was thrown.
   - Confidence: Confirmed (test).
   - Fix: in `validateSourceIds` (and for a single track source), refuse a track
     source whose `trackIndex` is null before any turn runs.

3. **Medium** —
   `src/tools/actions/duplicate/helpers/sources/duplicate-track.ts:257-273` (and
   `:41-72`)
   - Defect: `landTrackCopy` knows a group copy added `added` tracks, but
     `makeTrackCopy` strips only the group track itself.
     `withoutClips`/`withoutDevices` never reach the copied members, and the
     entry's `clips` leaves out the members' clips. `removeHostTrackDevice`
     compares only the group's index with the host index.
   - Failure 1: `type:"track", path:"t0"` (a group with members t1 and t2 that
     hold clips), `withoutClips:true`. The result is `{clips:[]}`, yet the
     copied members still carry every clip.
   - Failure 2: copying a group that contains the Producer Pal host track
     creates a second Producer Pal device, which the track-level check exists to
     prevent.
   - Confidence: Confirmed (code reading).
   - Fix: apply the strip, the collect and the host-device removal to all
     `added` tracks from `landing.index` on.

4. **Medium** (pre-existing, not fixed by these changes) —
   `src/tools/actions/duplicate/helpers/device/duplicate-chain.ts:89-155,316-367`;
   `helpers/device/duplicate-drum-pad.ts:72-113`
   - Defect: device duplicate refuses `isProducerPalDevice`, but chain duplicate
     and drum-pad duplicate do not. The chain path moves every device off the
     temp track into the new chain, so the Producer Pal copy stays for good.
     `copy_pad` also copies a pad chain's devices.
   - Failure: `type:"chain", id:<chain holding the Producer Pal device>` leaves
     a permanent second Producer Pal device.
   - Confidence: Confirmed (code reading). The drum-pad case depends on the
     device being able to sit in a pad chain, so it is Plausible.
   - Fix: call `isProducerPalDevice(chain)` at the top of `duplicateChain`, and
     check the source pad's chains in `duplicateDrumPad`.

5. **Medium** (pre-existing, made worse by per-copy `arrangementLength`) —
   `src/tools/actions/duplicate/helpers/sources/scene-arrangement-positions.ts:80-89`
   - Defect: `count>1` from a single position places the copies `sceneLength`
     apart, whatever each copy's `arrangementLength` is.
   - Failure: a 4-bar scene with
     `toPath:"[1|1]", count:2, arrangementLength:"8bar"`. Copy 2 lands at bar 5
     and clears the second half of copy 1. With `"2bar"` instead, there is a
     2-bar gap between the copies. Neither entry says so.
   - Confidence: Confirmed (code reading).
   - Fix: step each position by that copy's own `labelLength` in beats when one
     is given.

6. **Low-Medium** —
   `src/tools/actions/duplicate/helpers/device/copy-per-destination.ts:85-87`,
   `helpers/device/duplicate-device.ts:172-187`
   - Defect: each device copy's `path` is read right after that copy is made. A
     later destination that inserts before it on the same chain shifts it, so
     the reported path goes stale. Unlike tracks, nothing re-reads it.
   - Failure: source `t0/d3`, `toPath:"t1/d2,t1/d0"`. The first entry says
     `t1/d2`, but that copy now sits at `t1/d3`.
   - Confidence: Confirmed (code reading).
   - Fix: re-read every device entry's path by id after all destinations have
     run.

7. **Low** —
   `src/tools/actions/duplicate/helpers/sources/duplicate-track.ts:221-247`;
   `helpers/sources/duplicate-one-source.ts:98-107`
   - Defect: the `try/finally` labels the copies already made, but it still
     rethrows. If a copy fails partway, or a later source throws, the entries
     for copies that exist are lost. `duplicateEverySource` has no per-source
     catch either.
   - Failure: `count:3`, and the third `duplicate_track` makes no copy ("Live
     made no copy"). The call errors, and the two copies that exist are
     unreported.
   - Confidence: Plausible (depends on Live refusing mid-loop).
   - Fix: turn the failure into a skip entry, or attach the made entries to the
     error, instead of rethrowing out of `finally`.

8. **Low** —
   `src/tools/actions/duplicate/helpers/clip/duplicate-clip-slot.ts:145-146,248-250`
   - Defect: `prepareDestinationSlot` can create scenes, but a skipped copy
     after that (`copyClipToSlot` returns null, or `recreateIntoSlot` fails)
     returns `skippedCopy` without `created`. For a lone destination, `oneOrAll`
     turns it into a thrown error.
   - Failure: an arrangement clip sent to `t1/s20` on a 4-scene Set whose
     re-create fails. Scenes s4-s20 now exist, and the error says nothing about
     them.
   - Confidence: Confirmed (code reading), though it is a rare path.
   - Fix: carry `created` on the skip entry and in the lone-destination error
     message.

9. **Low** —
   `src/tools/actions/duplicate/helpers/sources/source-overwrites.ts:211-228`
   - Defect: the check refuses a copy that lands on any other source, including
     one whose turn has already run. That case neither destroys the source
     before its turn nor changes what the turn copies. The refusal message
     ("duplicate that one in its own call first") is then wrong.
   - Failure: A at t0/s0 and B at t0/s1, `toPath:"t0/s2,t0/s0"`. This is a
     legitimate call, but it is refused. The same applies to pads (C1→E1,
     D1→C1).
   - Confidence: Confirmed (code reading).
   - Fix: only refuse when the hit source's index in the call is greater than
     the copying source's index.

10. **Low** —
    `src/tools/actions/duplicate/helpers/sources/source-plan.ts:116-123`
    together with `helpers/clip/clip-destinations.ts:299-311`
    - Defect: a mixed toPath is resolved differently for one source than for
      several.
    - Failure: with one source, `toPath:"t1/s0,t2[5|1]"` refuses the slot entry
      ("a clip slot can't take an arrangement copy"). With two sources, source 1
      alone gets `"t1/s0"`, so it lands in the session slot and warns
      `arrangementStart ignored`, a param the caller never sent.
    - Confidence: Confirmed (code reading).
    - Fix: decide slot versus arrangement once per call, or pass per-source
      `onArrangement` so a lone slot entry gets the same entry refusal.

11. **Low** —
    `src/tools/actions/duplicate/helpers/sources/copy-labels.ts:94-111`,
    `duplicate-tracks-to-lanes.ts:219-237`
    - Defect: `arrangementLength` is silently ignored for track copies, lane
      copies and session scene copies, with no warning (`focus` is also ignored
      on lane copies). `claimLabels` still checks the list length.
    - Failure: `type:"track", count:1, arrangementLength:"1bar,2bar"` is refused
      over the length of a param that has no effect.
    - Confidence: Confirmed (code reading).
    - Fix: warn that it was ignored, and leave `arrangementLength` out of
      `extraLists` when the type or destination can't use it.

### Shared tool code (`src/tools/shared/**` minus device, `src/tools/core/**`)

1. **Medium: a locator whose name is all digits can no longer be addressed by
   name (regression)**
   - `src/tools/shared/locator/locators.ts:231`
     (`LOCATOR_ID_PATTERN = /^\d+$/`), `:250` (`resolveLocatorRefToBeats`)
   - Defect: locator ids moved from `locator-N` to Live ids, and any all-digit
     ref is now treated only as an id. It never falls back to a name lookup.
   - Failure: the user has locators named "1", "2", "3". The model sends
     `t0[loc:2]` or `arrangementStart: "loc:2"` and gets `locator not found: 2`.
     On main, `loc:2` resolved by name. Worse, a locator named "26" is silently
     resolved to a different locator whose Live id happens to be 26 (confirmed
     in a scratch test: `resolveLocatorRefToBeats(liveSet, "26")` returned the
     time of id 26, not of the locator named "26"). The Skill still says
     `loc:<locator name or id>`.
   - Confidence: Confirmed (scratch vitest with the mock registry).
   - Fix: for an all-digit ref, try the id first and fall back to an exact name
     match when no locator has that id. Refuse the ref as ambiguous when it
     matches one locator's id and another locator's name.

2. **Low-Medium: the whole-call length check ignores the one-target rule that a
   comma is literal**
   - `src/tools/shared/validation/lists/list-lengths.ts:49`
     (`validateListLengths`), `:140` (`isList`)
   - Defect: `splitList` treats the value as literal when the call names one
     target. `validateListLengths` still counts every comma-bearing value as a
     list and compares the counts.
   - Failure:
     `update-track {id:"5", name:"Kick, Snare, Hat", sendReturn:"Verb, Long"}`
     is refused with "name names 3 entries but sendReturn names 2 entries". Both
     values would have been applied literally (confirmed via
     `resolveLabeledTargets`). The same happens in create-clip with one
     destination, a comma-bearing `name`, and a comma-bearing `sampleFile` path.
     The Principles promise that one target makes the whole value literal, and
     this refusal breaks that promise.
   - Confidence: Confirmed (scratch test).
   - Fix: skip the comparison when the target count (the `count` arg, or the
     target list's entry count) is at most 1. Alternatively, pass the target
     count in and treat every value arg as one entry when it is ≤ 1.

3. **Low: `c+`/`d+` paths on a track or scene lookup say "names a track, not a
   track"**
   - `src/tools/shared/validation/path-target-lookup.ts:200`
     (`describePathKind`, where `default` returns "a track")
   - Defect: the new `new-chain` and `new-device` kinds fall into `default`.
   - Failure: `update-track path:"t0/d+"` or `read-track path:"t0/d0/c+"` gives
     `invalid path "t0/d+" - names a track, not a track; expected "t<index>"…`.
     `update-scene path:"t0/d+"` says "names a track, not a scene". The message
     is self-contradictory and never mentions
     `NEW_DEVICE_ADVICE`/`NEW_CHAIN_ADVICE` (compare `describeNonClipPath` in
     object-paths.ts, which handles them).
   - Confidence: Confirmed (scratch test).
   - Fix: add cases for `new-chain` and `new-device` (and `slot`/`master`…) that
     return the advice constants. Make the switch exhaustive so the next new
     kind fails typecheck.

4. **Low: the deprecation example steers create-track's return tracks to a
   regular track**
   - `src/tools/shared/validation/helpers/path-from-index.ts:34`
     (`trackPathFromIndex`), used by `create-track.def.ts` for `trackIndex`
   - Defect: it reads `args.trackType`, but create-track spells the category
     `type`. Since 74a512c0b feeds it coerced args, it now fires for string
     indices too.
   - Failure: `create-track {type:"return", trackIndex:2}` gets
     `use "path" instead (e.g. path: "t2")` beside
     `type "return" is deprecated; use path "rt+"`. Following the first warning
     creates a MIDI track at index 2.
   - Confidence: Confirmed by reading.
   - Fix: give create-track its own example function that returns `"rt+"` when
     `type === "return"`, or have `trackPathFromIndex` also honor `args.type`.

5. **Low: a locator name containing `[` is now refused inside a path coordinate
   (regression)**
   - `src/tools/shared/validation/helpers/object-path-lexer.ts:150`
   - Defect: b2af3a314 added a "second `[`" refusal and called it wording-only
     ("Behavior is unchanged"). On main, `t0[loc:Chorus [B]]` parsed and
     resolved by name. It now throws `it hit an unexpected second "["`. The
     function's own doc says taking the coordinate to the end "lets a locator
     name hold a bracket of its own".
   - Failure: a user-named locator "Chorus [B]" can only be reached by id.
   - Confidence: Confirmed (scratch test).
   - Fix: keep the check only when the text after `loc:` is not a locator ref.
     Otherwise revert to letting the name carry `[`, which `locatorPosition`
     already steers away from in reads.

6. **Low: the "every string arg pairs per target" rule leaves no escape for
   commas in some values**
   - `src/tools/shared/validation/lists/list-pairing.ts:54` (`splitList`) and
     `paired-values.ts` `pairParams`, as used by the create-clip `sampleFile`,
     update-track routing, and `sendReturn` consumers
   - Defect: for 2 or more targets, a file path or routing/return name
     containing a comma is split.
   - Failure: `create-clip {path:"t0/s0,t0/s1", sampleFile:"/S/Kick, hard.wav"}`
     pairs `/S/Kick` and `hard.wav`, and both creates fail. On main,
     `sampleFile` was one value per call and worked. Output routing to a group
     named "Drums, Perc" across two tracks is split in the same way. The only
     escape is the deprecated `*RoutingId` param.
   - Confidence: Plausible (behavior by design per ADR-0049, but a regression
     for these values).
   - Fix: exempt params whose values are paths or Live-owned names
     (`sampleFile`, routing), or add an escape such as quoting. At minimum,
     document the limitation in the param descriptions.

7. **Low: a take-lane refusal wrongly says the track isn't regular**
   - `src/tools/shared/validation/object-path.ts:468`
   - Failure: `t0/l+/d0` and `t0/l0/d0` get
     `…; only regular tracks have take lanes`, but t0 is a regular track. The
     real problem is the trailing segment.
   - Confidence: Confirmed (scratch test).
   - Fix: when `root.kind === "track"`, say that nothing can follow a lane
     segment.

#### Checked, no defect found

- `planInsertions`: a brute-force simulation over 0–3 existing scenes and all
  3-entry spot combinations matched `finalIndex`/`emptyBelow` exactly.
- Path splitting at bracket depth: `countPathEntries` and `pathEntries` agree.
- Hole and trailing-comma rules are consistent across `splitList`, `entriesFrom`
  and `countEntries`.
- Doubled-spelling refusal, `readFanOut` folding, `writeFanOut`, send dedupe,
  and `recreateIntoSlot` scratch/occupant handling.
- The core/context split is a pure move.

### Devices (`src/tools/device/**`, `src/tools/shared/device/**`)

1. **Medium: wrapInRack creates chains while resolving the devices to wrap, then
   refuses the wrap** (write-before-validate; the same bug exists on main)
   - `src/tools/device/update/helpers/wrap-devices-in-rack.ts:397`
     (`resolveDeviceFromPath` calls `resolveInsertionPath(path)`)
   - Defect: source paths go through the insertion resolver, which auto-creates
     missing rack chains and drum-pad chains. Commit 904f1b8f2 blocks only
     `c+`/`d+` for this reason. It left out indexed chains (`c3`) and bare pads
     (`pC1`).
   - Failure: `update-device path="t0/d0/c3/d0" wrapInRack=true` on a rack with
     1 chain makes chains c1–c3, then throws "wrapInRack found no devices to
     wrap". A scratch test confirmed 3 `insert_chain` calls before the throw.
     `path="t0/d0/pC1/d0"` on an empty pad leaves a stray chain on C1. Neither
     is reported.
   - Confidence: Confirmed (mock test).
   - Fix: resolve source paths read-only with `resolvePathToLiveApi` /
     `resolveDrumPadFromPath` (the same resolver update-device targets use), not
     `resolveInsertionPath`.

2. **Low-Medium: an instrument wrap assumes the temp MIDI track starts empty**
   (same on main)
   - `wrap-devices-in-rack.ts:512-525` (create the temp track, then
     `move_device` at index 0)
   - Defect: Live applies the user's default MIDI-track preset to the temp track
     (AGENTS.md: "A new track is not always empty"). The wrap never checks it.
     There is also no `tempTrack.exists()` guard; `browser-devices.ts`
     `withTempTrack` has both.
   - Failure: with a default preset that holds an instrument, staging the
     instrument is a silent no-op. `insert_device("Instrument Rack")` on the
     source track is then refused, and the call fails with "Live refused to
     insert the Instrument Rack", which misleads. If `create_midi_track` ever
     returns no track, `tempTrackIndex` is null and `delete_track(null)` runs in
     the cleanup (`releaseTempTrack`), and the target of that call is unknown.
   - Confidence: Plausible (depends on the user's preset).
   - Fix: after creating the track, refuse if it doesn't exist, and delete its
     preset instrument (or any preset devices) before staging.

3. **Low-Medium: the per-request drum-rack chain memo is keyed by the rack's
   Live path, and device moves don't invalidate it**
   - `src/tools/shared/device/helpers/path/device-drumpad-navigation.ts:207-223`,
     combined with the up-front resolution at
     `src/tools/device/update/helpers/update-multiple-targets.ts:113`
   - Defect: `allChainsOnRack` memoizes on `drum-rack-chains <rack.path>`. Only
     chain insert/delete call `invalidateRackChains`. A `move_device`
     (update-device toPath, wrap, duplicate) that shifts a rack to another index
     leaves the entry pointing at whichever rack now sits at that path.
     `resolveDrumPadFromPath` doesn't check that the device at the path is the
     same rack. Since 0f8656f4c, pad paths for every target are resolved (and
     memoized) before the first move, which makes this reachable.
   - Failure: track 0 = [X, DrumRack B, Rack C].
     `path="t0/d0,t0/d1/pC1/c0/d0" toPath="t1/d+,…"`: B's chains are memoized
     under `tracks 0 devices 1`. Moving X shifts B to d0 and C to d1.
     `containerFromPath("t0/d1/pC1/c0")` then returns B's chain from the memo,
     so `pathField` accepts the stale spelling. The entry reports
     `path: "t0/d1/pC1/c0/d0"`, a spelling that now runs through C. Any later
     path lookup through `t0/d1/p…` in the same request also reads B's chains.
   - Confidence: Plausible (the mock doesn't model index shift).
   - Fix: key the memo by rack id, or call `invalidateRackChains`/clear the memo
     after every `move_device` and positioned insert.

4. **Low: an instrument wrap whose toPath names the end of the instrument's own
   container fails**
   - `wrap-devices-in-rack.ts:505-507` (destination resolved before staging) and
     `:139-146` (count read after staging)
   - Defect: toPath's index is resolved against the container while the
     instrument is still in it. `insertRack` compares that index to the device
     count after the instrument has moved out.
   - Failure: t0 = [Synth, Reverb].
     `path="t0/d0" wrapInRack=true toPath="t0/d2"` (the pre-call end). After
     staging, the count is 1. 2 ≠ 1, so it calls `insert_device(…, 2)` past the
     end, Live refuses, and the wrap errors. `t0/d+` works.
   - Confidence: Confirmed by reading.
   - Fix: when the destination is the instrument's source container and
     position > devicePosition, subtract 1 (or clamp position ≥ count to
     append).

5. **Low: wrapInRack never reports the chains its toPath created**
   - `wrap-devices-in-rack.ts:370-387` (`rackDestination` drops `createdChains`)
   - Defect: 535485aea and the migration doc say that a path past the last rack
     chain makes the chains up to it and that `created` names them. The wrap
     entry has no `created`. Those chains also stay behind when `insertRack` is
     refused afterwards.
   - Failure: `wrapInRack toPath="t1/d0/c3"` on a 1-chain rack makes c1–c3, and
     the result is silent about them.
   - Confidence: Confirmed by reading.
   - Fix: carry `createdChains` into `WrapResult.created`, and name them in the
     error when the insert fails.

6. **Low: wrapInRack silently ignores every other update arg** (same on main)
   - `src/tools/device/update/update-device.ts:162-163`
   - Defect: with `wrapInRack`, `params`, `actions`, `macroCount`, `color`,
     `mute`, etc. are dropped with no entry note. `name` is taken as one literal
     even when the call named several targets.
   - Failure: `path="t0/d0,t0/d1" wrapInRack=true macroCount=4 params=[…]`
     returns a rack entry with no sign that macroCount or params were skipped.
   - Confidence: Confirmed by reading.
   - Fix: refuse the combination up front (per ADR-0035), or note the ignored
     params on the rack's entry.

7. **Low: the check that refuses a second Producer Pal only matches the exact
   file name**
   - `src/tools/device/create/create-device.ts:229-234`
   - Defect: only `producer_pal` / `…producer_pal.amxd` match. A renamed or
     duplicated download (`Producer_Pal (1).amxd`, `Producer_Pal 2.4.amxd`)
     passes the check.
   - Failure: `create-device device="Producer_Pal (1)"` loads a second device,
     which the comment says breaks the connection.
   - Confidence: Plausible.
   - Fix: match on a prefix or regex (`/^producer_pal\b/i`), or compare the
     loaded device against `this_device`'s class after the load.

Checked and found sound:

- Up-front target resolution: held LiveAPI objects follow their target through
  index shifts (dev/LiveAPI-Object-Reuse.md), and pad swaps work.
- Last-wins supersede of params named twice: id vs name, all-digit legacy names,
  ambiguous names, and chain `sample` entries.
- Null `name`/`id` in the params schema: tested; the JSON Schema keeps only
  `value` required.
- The effects-only wrap's append logic.
- Instrument wrap cleanup order: the empty rack is deleted before the instrument
  goes back.
- `pastTheEndReason` in moves.
- Type-segment (`inst`/`afx<n>`) resolution.
- create-device insertion-order validation.

### Track, scene, live-set, session

All 72 test files in the slice pass on dev (1210 tests).

1. **Medium — update-track refuses to rename an existing take lane on a track
   that already has more than MAX_TAKE_LANES (10) lanes**
   - `src/tools/track/update/helpers/track-take-lanes.ts:198-213`
     (`assertTakeLanePlanFits`), plus
     `src/tools/shared/arrangement/helpers/take-lanes.ts:299`
     (`assertTakeLaneCapacity` in `resolveTakeLane`).
   - Defect: the plan check computes `total = max(before, laneIndex + 1)` and
     refuses when `total > 10`, even when the entry creates nothing. The comment
     on `laneIdSpec` says an existing lane "adds nothing to the track's lane
     count", but the check doesn't follow that.
   - Failure: the user comps in Live and ends up with 12 take lanes on t0.
     `ppal-update-track {path:"t0/l2", name:"Keep"}` throws
     `take lane "l11" is out of range ... "t0/l2" would add it. Nothing was created`.
     Renaming the same lane by its own id fails the same way. A lane the user
     made at l10 or l11 can be read with read-track but can never be renamed,
     because `resolveTakeLane` asserts `laneIndex + 1 <= 10`. This is a new
     failure, since update-track couldn't target lanes on main.
   - Confidence: Confirmed. A scratch vitest with
     `registerTakeLaneTrack({initialLanes: 12})` got the error above.
   - Fix: count only what gets created. Skip the cap when `laneIndex < before`
     for both the path and id specs, and only assert capacity in
     `resolveTakeLane` when `laneIndex >= currentCount`.

2. **Low — with one target, two comma-bearing string params with different comma
   counts are refused, though each should be read literally**
   - `src/tools/shared/validation/lists/labeled-targets.ts:86-91`
     (`validateListLengths` over name/color/extraLists), reached from
     `src/tools/track/update/update-track.ts:233-242`.
   - Defect: when the target count is 1, the target list drops out, but name,
     routing and sendReturn are still compared with each other.
     dev/Principles.md and the object-paths skill both say "with one target the
     whole value is literal".
   - Failure:
     `update-track {id:"123", name:"Bass, Sub", outputRoutingType:"Low, End, Bus"}`
     (a group named with commas) throws
     `name names 2 entries but outputRoutingType names 3 entries`. It should
     rename the track and route it.
   - Confidence: Confirmed (scratch test).
   - Fix: in `validateListLengths`, skip every value list when the target/count
     entry is 1, or pass `count` so the lists are only compared when count > 1.

3. **Low — create-scene capture writes before it checks timeSignature**
   - `src/tools/scene/create-scene.ts:173-198` (`runCapture`). Create mode calls
     `validateTimeSignatures` (line 147), but capture mode never does.
   - Defect: a malformed `timeSignature` is only parsed inside
     `applyTimeSignatureProperty`, after `capture_and_insert_scene`, the name
     write, color and tempo have all landed.
   - Failure: `create-scene {capture:true, path:"s+", timeSignature:"4-4"}`
     captures the playing clips into a new, named scene, then throws the
     time-signature format error. The model sees a failure and retries, which
     captures a second scene. On dev the param now advertises "comma-separated
     one per scene", so a list like `"4/4,3/4"` on capture also hits this.
   - Confidence: Confirmed by reading the code. Main had the same gap; dev
     closed it for create mode only.
   - Fix: call `validateTimeSignatures(timeSignature, null)` in `runCapture`
     next to the color check, before `captureScene`.

4. **Low — a lone locator op that can't run returns a skip instead of throwing,
   after tempo, meter and scale are already written**
   - `src/tools/live-set/update-live-set.ts:127-134`, with
     `locator-updates.ts:105-111` and `:182-195`.
   - Defect: `create` with no `locatorTime`, or `rename` with no `locatorName`,
     returns `{operation:"skipped", ok:false}` for a single target. This is a
     whole-call argument error that could be refused before any write, which
     dev/Principles.md calls for.
   - Failure: `{tempo:90, locatorOperation:"create", locatorName:"Intro"}` sets
     the tempo and returns a success-shaped result with a nested skip.
   - Confidence: Confirmed by reading the code. Main behaved the same (warn plus
     skip), so this is not a regression.
   - Fix: in `validateLocatorOperation`, refuse create with no `locatorTime`,
     and rename with no `locatorName` or no target, before anything is written.

Checked and found sound:

- `planInsertions` for s+ and past-the-end scenes and tracks. I fuzzed 200k
  random spot lists against a simulated Live `create_scene` / `create_*_track`:
  every `finalIndex` matched, `atIndex` equalled the length for "end", and
  distinct past-the-end scene spots always landed at the index they named.
- Per-target routing and sendReturn pairing, including the deprecated aliases
  and send resolution cached per return.
- Locator id/time/name targeting, including repeat detection across id, time and
  name, delete-by-name reverse ordering, and whole-value comma names on delete.
- update-scene and create-scene timeSignature validation before writes (create
  mode).
- select's bracket-aware comma check.
- playback per-slot entries.

### Notation, MCP server, Live API adapter, skills

- **Medium: the outer tool timeout is shorter than one remote-script load.**
  `src/tools/device/create/helpers/remote-script-contract.ts:26` (V8 wait 45 s)
  vs `src/mcp-server/max-api-adapter.ts:59`
  (`DEFAULT_LIVE_API_CALL_TIMEOUT_MS = 45_000`).
  - Defect: the contract comment says "each wait must outlast the one inside
    it", but the tool-call timeout that wraps everything is equal to V8's wait
    for a single route. It is also shorter than the full path. `devicePlans`
    resolves every name first (5 parallel `/list` calls, each allowed up to 35
    s). Then each device is loaded (up to 35 s) and polled for up to 2 s
    (`create-device.ts:133`, `browser-devices.ts:155-173`).
  - Failure: a slow browser, or `device: "Pro-Q 4,Serum,Valhalla"` with plug-ins
    that take a few seconds each, goes past 45 s. Node answers "timed out… Live
    may still be applying it" while V8 keeps going and creates the devices. A
    model that retries gets duplicate plug-ins. V8's own timeout message can
    never reach the caller.
  - Confidence: Confirmed from the constants. How often it triggers depends on
    Live's latency.
  - Fix: give remote-script calls a tool-call timeout that covers
    N×(resolve+load). Alternatively, cap the V8 waits so their sum per device
    stays under the tool timeout.

- **Medium: the plug-in load addresses the temp track by an index read before
  the await.** `src/tools/device/create/helpers/browser-devices.ts:155` →
  `src/mcp-server/rpc/remote-script/remote-script-routes.ts:53` →
  `remote-script/Producer_Pal/routes.py` `_target_track` (`song.tracks[index]`).
  - Defect: `trackIndex` is read when the request is sent, but the remote script
    looks up `tracks[index]` later, on Live's main thread. `withTempTrack`
    itself notes (line 121) that other requests add and remove tracks during
    this wait.
  - Failure (a): while the load is queued, a parallel `create-track path:"t0"`
    inserts before the temp track. The remote script then selects the user's
    track at that index and loads the plug-in there. `loadOnto` then fails with
    "it never arrived" and deletes the temp track, leaving a stray plug-in on
    the user's track.
  - Failure (b): the remote script 504s at 30 s "but still runs the job later"
    (contract comment). By then V8 has deleted the temp track, so a track
    appended in the meantime (`t+`) receives the plug-in.
  - Confidence: Plausible (it's a race).
  - Fix: send a stable identity, such as the track's LOM id or a unique
    temp-track name the script checks, and refuse when it doesn't match.

- **Low: installing the remote script is not atomic, contrary to its doc.**
  `src/mcp-server/rpc/remote-script/remote-script-install.ts:60-61`.
  - Defect: the old install is deleted (`rmSync(path)`) before
    `renameSync(temp, path)`. If `rmSync` fails partway, or the rename fails,
    the `catch` also deletes the temp copy. Examples: EPERM/EBUSY on Windows
    from antivirus or an open handle, or a file that can't be deleted after its
    siblings already were.
  - Failure: the user is left with a partly deleted install or none. The
    docstring says "a failed write leaves the working install untouched", but
    that only holds when writing the temp copy fails.
  - Confidence: Plausible.
  - Fix: rename the old folder to a backup, rename temp into place, then delete
    the backup. Rename the backup back on failure.

- **Low (tests): the install rollback tests fail when run as root.**
  `src/mcp-server/rpc/remote-script/tests/remote-script-install.test.ts:126-165`.
  - Defect: both tests depend on `chmodSync(…, 0o500)` blocking writes, which
    root ignores.
  - Failure: I ran `npx vitest run src/mcp-server/rpc/remote-script` in this
    container (uid 0) and got 2 failures ("expected [Function] to throw"). Any
    root CI or dev container will fail the same way.
  - Confidence: Confirmed.
  - Fix: skip them when `process.getuid?.() === 0`, or inject the failure with a
    mocked fs.

#### Checked and found sound (no finding)

- **`request-channel.ts` refactor.** It keeps separate id prefixes and counters
  per channel. The timeout and receive paths delete the pending entry before
  resolving, so a late answer only logs "unknown request". The refusal path
  resolves before any Task is scheduled. `suspendWarningCapture` still wraps
  every send. Code-exec still throws on an outlet failure, as it did on main.
  The Node route timeouts (40 s) sit inside V8's wait (45 s).
- **`max-api-adapter` timer simplification.** Every other path clears the timer
  before deleting the pending entry.
- **Note-value grammar parity (ADR-0003) for the new `n<count>bar` alias and
  n-fraction-bar errors.**
  - `n0bar`, `n01bar`, `n1bar+n/4` and `@n0bar` are rejected consistently by the
    barbeat grammar (duration and step) and the `barbeat-time` regex.
  - `n1bar` and `n2bars` resolve identically at all three sites, including the
    transform grammar.
  - `n1bar+n/4` is accepted only by the transform grammar, where it is ordinary
    arithmetic.
- **Transform `negatedDuration`.** Precedence is correct (`2 * -1bar`, `-n/4t`,
  `cos(-1bar)`), and all waveforms normalize negative phase.
- **Top-level `(C3 E3)` chord.** It flattens to plain pitch elements, so the
  interpreter needs no change.
- **Hand-written MIDI JSON parser.** It matches the old Peggy grammar on ratios,
  leading dots, `1.`, `1e`, trailing commas, quoted keys and whitespace.
- **Collection route factory.** It keeps the old memory and skills wording and
  argument checks.
- **Remote-script POST.** It uses `rejectForeignOriginWrite`, the same trust
  model as the other content endpoints. It writes only embedded content, and
  only under `<lib>/Remote Scripts/Producer_Pal`.
- **Skills gating.** `plugins-and-max-devices` naming `ppal-library` outside its
  gate is an allowlisted cross-reference in `fragment-tool-gates.test.ts`.
  `builtinFragments()` built from `SKILL_SLOTS` still yields every name the
  drivers include.
- **Test run.** All tests under notation, skills, mcp-server, live-api-adapter
  and shared pass (4524), apart from the two root-only failures above.

### Remote script, examples, scripts, evals, e2e, CI

#### Findings (most severe first)

1. **Medium**: `examples/skills/ableton-read-als/read-als.mjs:443-448`
   - **Defect:** arrangement clips are read only from
     `MainSequencer/ClipTimeable/ArrangerAutomation/Events`. Live stores an
     audio track's arrangement clips under
     `MainSequencer/Sample/ArrangerAutomation/Events`, so every audio track
     reports `arrangementClips: []`.
   - **Scenario:** I ran
     `node read-als.mjs "e2e/live-sets/arrangement-clip-tests Project/arrangement-clip-tests.als" --include clips`.
     All 21 audio tracks came back with `arr: 0`, but the file holds 21
     `<AudioClip>` elements, all at
     `DeviceChain/MainSequencer/Sample/ArrangerAutomation/Events`.
     `e2e-test-set.als` loses its one audio arrangement clip the same way. An
     agent using the skill is told these audio tracks are empty.
   - **Confidence:** Confirmed (ran it on the repo's real Live 12.3 Sets).
   - **Fix:** read
     `child(sequencer, "ClipTimeable") ?? child(sequencer, "Sample")`, then
     `ArrangerAutomation/Events`. Add an audio arrangement clip to the
     `read-als.test.ts` fixture.

2. **Low**: `examples/skills/ableton-read-als/read-als.mjs:537`
   - **Defect:** rack macros go into an object keyed by display name, so two
     macros with the same name collapse into one and a value is lost.
   - **Scenario:** in `racks-test.als` a rack has `MacroDisplayNames.0` and `.1`
     both set to "Drive". The output has 7 keys for 8 visible macros, and macro
     2's value is gone.
   - **Confidence:** Confirmed (ran it).
   - **Fix:** emit an array of `{name, value}`, or suffix the index when a name
     repeats.

3. **Low**: `evals/scenarios/defs/result/write-result-trust.ts:61`
   - **Defect:** `assertNoReadBack` grades an attempt ("did the model read back
     after writing?") but uses `getToolCalls`, which drops failed calls. A
     read-back that errored doesn't count, and the assertion passes. The
     helper's own doc says attempt-grading should use `getAllToolCalls`.
   - **Scenario:** the model renames the track, then calls `ppal-read-track`
     with a bad arg or path. The read-back fails and the no-read-back assertion
     passes, which overstates the model's "trusts the write result" rate.
   - **Confidence:** Confirmed by reading.
   - **Fix:** use `getAllToolCalls(turns, ASK_TURN)` for the read-back scan.
     Keep the write lookup on successful calls.

4. **Low**: `config/rolldown-plugin-embed-remote-script.mjs:75` (the same filter
   is in `src/mcp-server/rpc/remote-script/remote-script-source.ts`)
   - **Defect:** the embed step includes every file in
     `remote-script/Producer_Pal` except `__pycache__` and `*.pyc`. Untracked
     local files get read as utf8 and baked into the release device. The device
     then installs them into each user's `Remote Scripts/Producer_Pal`.
   - **Scenario:** a release built on the maintainer's Mac after Finder opened
     that folder ships a mangled `.DS_Store`, or an editor's `*.swp` / `*~`, or
     a stray scratch `.py` (a stray `.py` would also get imported by Live).
   - **Confidence:** Plausible. `.DS_Store` is only gitignored, not excluded
     here.
   - **Fix:** allow-list `*.py` in both readers, or embed from
     `git ls-files remote-script/Producer_Pal`.

5. **Low**: `remote-script/Producer_Pal/bridge.py:135,157`
   - **Defect:** the `_abandoned` check-then-act isn't atomic. If `run()` has
     already passed the check when `wait()` times out and sets the flag, Live
     still loads the item while the HTTP client gets a 504.
   - **Scenario:** Live's main thread is blocked for about 30s (for example, a
     first plugin scan) and picks up the job right at the timeout. The caller
     reports failure (open-live-set says "couldn't be added"), but the device
     lands on a new track. A retry can then add a second one; for Producer_Pal
     the 409 guard catches that, but other devices have no guard.
   - **Confidence:** Plausible. The window is narrow.
   - **Fix:** use a lock or an atomic state claim (for example `queue.Queue(1)`
     or `threading.Lock`), where `run` claims the job and `wait` claims the
     timeout, and whichever claims first wins.

6. **Low**: `remote-script/Producer_Pal/http_server.py:81`
   - **Defect:** `Content-Length` is trusted unchecked, and the handler has no
     socket timeout.
     - A non-numeric value raises in `do_POST` and drops the connection with no
       reply.
     - `-1` reads until EOF.
     - A large value blocks while waiting for the body.
   - **Scenario:** a buggy or malicious local client sends
     `Content-Length: 4000000000` (or `-1`) and never closes. Each such request
     pins a worker thread forever, and repeating it exhausts threads or fds
     inside Live's process. Browsers can't reach this: the Origin,
     Sec-Fetch-Site and Host checks run before the body is read.
   - **Confidence:** Confirmed (probed the extracted `http_server.py`).
     Local-only.
   - **Fix:** parse with try/except, reject values `< 0` or over a small cap
     (for example 64 KB) with 400/413, and set `timeout = 10` on `_Handler`.

#### Checked and found sound

- **Remote-script origin checks.**
  - Binds 127.0.0.1 only.
  - Any `Origin` header (including `null` or empty) is refused, and so is any
    `Sec-Fetch-Site`, which blocks CSRF from form or fetch POSTs.
  - A Host outside `127.0.0.1`/`localhost`/`::1` is refused (a DNS-rebinding
    request carries the attacker's hostname). Verified: `evil.com`, `localhost.`
    → 403; `[::1]:port` → 200.
  - `/load` is POST-only.
  - No filesystem, subprocess or eval surface: `path` walks Live's browser tree,
    not the disk.
- **AppleScript and subprocess calls in the example scripts are
  injection-safe.**
  - `open-live-set.mjs` interpolates only booleans and constants into
    AppleScript, and calls `open` with `execFile` and an absolute path.
  - `export-audio.mjs` quotes track names through `as()`.
  - `analyze-audio.mjs` `fileRef` restricts ids to `files/[A-Za-z0-9_-]+`.
- **Empty `--tag`** (`--tag ""`, `--tag ,`) is refused in `parseTagArgs`.
  `--all` plus a filter, and `--canary` plus a filter, are refused.
- **e2e `retry: 1`.** The `once` guard's `beforeEach` does see
  `task.result.retryCount` (checked against vitest 4.1.11's runner), so
  shared-Set files fail instead of retrying. `log-e2e-retries` reads state after
  it has been set.
- **`.githooks/pre-push` Netlify check.**
  - It fails closed on a gh error.
  - The GitHub statuses API returns newest first, so `[0]` is the latest status.
  - An empty result passes, which is correct when no PR is open.
- **package.json and CI.**
  - All versions are exact; npm aliases are allowed by the pin test.
  - The `parser:build` change matches the midi-json grammar's removal.
  - The `deploy-pages` pin `368f825…` matches the upstream `v5` / `v5.0.1` tags
    (verified with `git ls-remote`).

#### Out of the diff (pre-existing, noted only)

- **Pre-existing, `evals/scenarios/index.ts` ~415-418:** the reuse bookkeeping
  (`lastOpenedLiveSet`, `liveSetOpened`) is set even when that trial's Live Set
  open threw. The next model, a later trial, or the next contiguous
  `reuseLiveSet` scenario then skips the open and runs against whatever Set is
  loaded. The same logic is on `origin/main`.

### Web UI (`webui/**`)

1. **Medium: a sent image stays in the history, and every later turn re-sends
   it; retry and edit cannot remove it.**
   `webui/src/chat/sdk/build-model-messages.ts:88-91,120-137`,
   `webui/src/hooks/chat/use-conversation-actions.ts:258-296`,
   `webui/src/hooks/chat/use-message-queue.ts:115-126`
   - Scenario: attach 10 screenshots (up to 5 MB each after scaling). Nothing
     limits the total size, so the request soon passes the provider's cap: about
     20 MB of inline data for Gemini, 32 MB per request for Anthropic. It then
     fails on every later turn.
   - The same failure happens after any image is sent to a text-only model
     (Ollama, LM Studio, DeepSeek), since the model rejects it.
   - Retry re-sends the images. Edit deliberately keeps them ("images ride
     along"), so the user can't fix the conversation. Only compaction or a new
     chat gets out.
   - Queue coalescing also skips `MAX_IMAGES_PER_MESSAGE`: 2 queued messages
     with 10 images each go out as one 20-image turn.
   - Confidence: Plausible. The code path is confirmed; the provider limits are
     external.
   - Fix: let edit remove attachments, cap images per coalesced turn, and
     consider dropping or stubbing images from older turns (or budgeting the
     total).

2. **Medium: every render rebuilds and compares multi-megabyte `data:` URLs,
   which lags streaming and typing.**
   `webui/src/components/chat/assistant/UserImages.tsx:48`,
   `webui/src/components/chat/controls/composer/ImageAttachments.tsx:39`,
   `webui/src/utils/image-attachments.ts:123-125`
   - Every stream chunk runs `formatChatMessages` on the whole history. The rows
     aren't memoized, so each `UserImages` builds a new
     `data:${type};base64,${data}` string and Preact compares it with `!==`
     against the previous one. That comparison flattens and memcmps the whole
     string.
   - Measured in Node: about 5 ms per 6 MB image per render (scratchpad
     `bench.mjs`).
   - Scenario: 10 images anywhere in the transcript cost about 50 ms per
     streamed chunk, so streaming janks. The composer re-renders on every
     keystroke (`setInput`), so 10 pending attachments add about 50 ms per key.
   - Confidence: Confirmed (V8 cost measured; the render path was checked by
     reading).
   - Fix: cache the URL per image (a `Map` keyed on `data`, or an object URL
     made once and revoked on removal), or memoize the image rows.

3. **Medium: pasting from Excel, Word or OneNote attaches a picture and drops
   the text.** `webui/src/hooks/chat/helpers/use-image-attachments.ts:98-111`,
   `webui/src/utils/image-attachments.ts:112-116`
   - Office apps put a rendered, non-empty PNG on the clipboard next to
     `text/plain` and `text/html`. The Numbers fix only filters 0-byte images.
   - `onPasteCapture` does `preventDefault` whenever any non-empty image file is
     present. So pasting a chord chart copied from Excel attaches a screenshot
     of the cells and loses the text.
   - Confidence: Plausible. This is how those apps fill the clipboard; the code
     path is confirmed.
   - Fix: when `clipboardData.types` includes `text/plain` (or `text/html` that
     isn't just an `<img>`), let the editor paste the text and skip the image.
     Or attach only when there is no text.

4. **Medium: an image still loading at send time is silently left out of the
   message.** `webui/src/hooks/chat/helpers/use-image-attachments.ts:61-83`,
   `webui/src/components/chat/controls/composer/ChatInput.tsx:77-98`
   - Decoding, scaling and re-encoding is async and shows no pending state, and
     Send isn't blocked while it runs.
   - Scenario: type "what's wrong in this screenshot?", paste a 12 MB
     screenshot, press Enter. The text goes to the model without the image,
     which then pops into the empty composer. If the user has switched
     conversations meanwhile, it lands in the other conversation's composer.
   - The commit chose "stays for the next message" on purpose, but the user
     can't see it happening.
   - Confidence: Confirmed by reading.
   - Fix: count in-flight reads and either disable Send or show a placeholder
     until they settle, or make `submitMessage` await the pending adds.

5. **Low-Medium: images between 3.75 MB and 5 MB pass the local cap but
   Anthropic likely rejects them.**
   `webui/src/utils/image-attachments.ts:29,160`
   - `MAX_IMAGE_BYTES` is checked against the raw blob size. Anthropic's 5 MB
     image limit appears to apply to the base64 payload, which is about 1.33
     times larger (I haven't checked current docs).
   - Scenario: a 4.5 MB PNG after scaling (a photo-heavy 1568 px PNG) is
     accepted locally, then the request fails with 400 "image exceeds 5 MB
     maximum". Because of finding 1, that failure then sticks to the
     conversation.
   - GIFs are never scaled, so a large-dimension GIF also gets past the
     provider's pixel limits.
   - Confidence: Plausible.
   - Fix: compare `ceil(size/3)*4` against 5 MB, or cap raw size at about 3.75
     MB (re-encode PNG as JPEG when it's over).

6. **Low: the importer doesn't sanitize `images`, so a malformed value leaves
   the conversation unopenable.**
   `webui/src/lib/conversation-transfer.ts:327-333` (sanitizer), which feeds
   `webui/src/chat/sdk/formatter.ts:47`
   - `sanitizeImportedMessage` normalizes `toolCalls` and `toolResults` for
     exactly this failure ("would throw on the first render … a conversation
     that can never be opened again"), but not the new `images` field.
   - Scenario: an imported record with `images: 5` or `images: {}` makes
     `for (const image of msg.images ?? [])` throw a TypeError inside
     `restoreChatHistory` → `formatChatMessages`. `store.adopt` has already run,
     so opening that conversation gives a blank view plus an unhandled
     rejection, every time.
   - A string value iterates its characters and renders broken `data:undefined`
     images.
   - Confidence: Confirmed by reading.
   - Fix: drop `images` unless it's an array of
     `{mediaType: string in IMAGE_MEDIA_TYPES, data: string}`.

7. **Low: after the first load, a failed Remote Script refresh shows nothing,
   and an older read can overwrite a newer one.**
   `webui/src/components/settings/RemoteScriptTab.tsx:30-48`,
   `webui/src/hooks/settings/use-remote-script.ts:67-105`
   - `loadError` and `loading` are only rendered while `status == null`. Once a
     status exists, Refresh gives no feedback. If the server is down, the old
     status (for example "not running") stays on screen as if it were current.
   - Refresh doesn't abort the mount read from `useAbortableLoad`. A slow mount
     response that lands after a Refresh (or after the refresh that follows an
     install) overwrites the newer status.
   - Confidence: Confirmed by reading.
   - Fix: render `loadError` and a checking state whenever they're set, and
     share one controller between mount and refresh (abort the previous read on
     each load).

8. **Low: paste and drop still attach images while the composer is disabled
   (after an error, or while compacting).**
   `webui/src/components/chat/controls/composer/ChatInput.tsx:109-112`
   - `zoneProps` ignores `disabled`, and only the 📎 button honours it. Images
     pile up in a composer that can't send, and a drop is swallowed with
     `preventDefault`.
   - Confidence: Confirmed by reading.
   - Fix: pass `disabled` into `useImageAttachments` and skip the handlers when
     it's set.

Checked with nothing found: the voice hook split into `gemini-*`,
`response-failure`, `transport-events`, `voice-session-setup` and
`voice-session-teardown` (bodies moved verbatim); the `streaming-helpers` split;
the shared `conversation-edits` and `bulk-delete-sweep` (behaviour matches main
for chat and voice); `useAbortableLoad` / `fetchJson` conversions;
`use-remote-config`; the collection editor or list merge; the conversation-db
single-transaction rename, bookmark and cleanup; `useHashNavigation`; the GPT-6
effort mapping; ChatScreen tab order; `inert` on the panel. No XSS found (images
render only as `<img src=data:…>`; markdown is unchanged). No API key leaks
found.
