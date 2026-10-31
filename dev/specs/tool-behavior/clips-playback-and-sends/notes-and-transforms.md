# Notes and transforms

Part of [Clips, Playback and Sends](README.md).

## Transform counts

`ppal-create-clip` and `ppal-update-clip` (transforms alone, or with `notes`)
report what the transforms did to the notes, by comparing each note before and
after:

- `transformed`: notes the transforms changed or made that are still in the
  clip.
- `deletedNotes`: notes the transforms removed (driven to 0, or merged into
  another). It pairs with `mutedNotes`; `deleted: true` on an entry means
  something else (another clip in the call moved onto it). Only notes the clip
  held count: pieces a `ratchet` made and then deleted don't, but the note they
  replaced does. A `merge()` keeps one note of each group it joins and deletes
  the rest; a short note swallowed by a longer one is deleted and the longer one
  counts as unchanged.
- A note a transform selected but left exactly as it was counts as neither
  (`velocity += 0`, a ratchet with no grid line to cut at, a split with no cut,
  `merge()` on a lone note). A `repeat` counts its copies, not the originals.
  Values are compared at 32-bit float resolution, the way Live stores them, so
  writing back the value a note already holds changes nothing.
- `transformed: 0` is reported when transforms ran and changed nothing. Only
  `deletedNotes` is left out at 0, and `transformed` is absent when no transform
  ran.
- When transforms ran and changed and deleted nothing, the clip's entry says why
  in `detail`, because the two causes need different fixes: "no notes matched
  the selector", or "the transforms changed none of the N matched notes" ("the
  transforms didn't change the 1 matched note" for one). `preTransforms` and
  `transforms` are judged together. Neither is said when a statement failed or
  was skipped (an expression error, a failed `where()`, a skipped note op),
  since that has its own detail, nor when every statement was an audio-only
  parameter ignored on a MIDI clip. Every tool that runs transforms says it the
  same way (update-clip, create-clip, and duplicate through update-clip). With
  `duplicateLoop`, preTransforms and the later notes/transforms stage are judged
  together, the stage that matched more notes giving N.
- `preTransforms` and `transforms` in one call count as one pass running both
  would, against how each note started: a note both changed counts once, and one
  that `transforms` puts back as it was counts as neither. When `transforms`
  deletes every piece a `preTransforms` `ratchet` or `split` made, the note they
  replaced counts as deleted. With `duplicateLoop` the two passes re-read the
  clip around Live's double, so they can't share a starting point: each compares
  its own before and after, the report is their sum, and a note changed in both
  counts twice.

## Notes outside the region

Live keeps a note that starts before the clip's region or at or after its end,
but never plays it. A note far enough out is also past the window every note
read and rewrite uses, so it drops out of `noteCount` and later reads. On a
looping clip the window ends at `loop_end`, so every note at or past it drops
out, and no edit (replace, transform, delete) touches it. No refusal, no skip:
the write lands as asked, and the clip's entry says so in `detail`:

- `ppal-create-clip`: `N notes landed outside the region and won't play`, for
  the notes the call wrote (after any transform).
- `ppal-update-clip` that moves the region (`start` or `length`) and edits
  notes: `N notes are outside the region and won't play`, for every note the
  clip then holds outside it, since the region move is what put them there.
- `ppal-update-clip` that edits notes and leaves the region alone:
  `N notes landed outside the region and won't play`, for the notes the edit put
  there. Notes that were already outside are not counted, so a clip with old
  overhang doesn't nag on every edit.
- An update with `duplicateLoop` or `arrangementLength` is not checked: either
  can change the region after the notes are written.
- Muted notes are never counted. `code` rewrites are not checked yet.

## Muted notes

No note notation can spell a muted note, so a muted note read back as an
ordinary one and the model took it for a note that plays. Muted notes (Live's
`mute` flag, "deactivated" in the UI) don't exist to the model:

- **Reads hide them.** `read-clip` leaves them out of `notes` and out of every
  count (`noteCount`, notes outside the region), so a count always matches what
  a read shows. It reports how many it hid as `mutedNotes`, only when there are
  some, so a clip of only muted notes isn't read as empty.
- **Edits treat them as absent and leave them in place.** Transforms don't
  select, change, delete or count them, and neighbor functions (`legato`,
  `note.index`, ...) skip them. Merges, transform-only updates and `code`
  rewrites write them back as they were. A transform-only update on a clip of
  only muted notes is ignored, and says so.
- **A note written at a muted note's pitch and start replaces it**: the model
  asked for a note there. A delete marker aimed at one is a no-op, since the
  note doesn't exist to it. A transform that moves a note there replaces it too,
  and the clip's entry says so in `detail` (with a count when several), since
  the model never asked for that note's slot.
- **Overlaps follow Live**: Live cuts whichever same-pitch note starts earlier
  at the next one's start, muted or not. After a note write the clip is read
  back (only when it has muted notes), and `detail` says when a muted note
  shortened a note, or a note shortened a muted one. A `code` rewrite is a note
  write too, so update-clip says the same of it (once, on the target's first
  clip when tiling made copies). A clip create-clip just made holds no muted
  notes, so its `code` has nothing to report.
- **Bar copy skips them**: they aren't in the source bar the model sees.
- **Copying a whole clip keeps them** (duplicate to a new place, take lanes);
  that isn't an edit of notes the model sees. Replacing, emptying or moving a
  clip carries or drops them with it.
- **Native Live operations act on them**, because Live does: `quantize` moves
  them and `duplicateLoop` copies them. The entry's `detail` says how many
  (`quantized 2 muted notes`, `duplicateLoop copied 1 muted note`). Quantize
  counts only the muted notes that moved, and on a clip of only muted notes that
  moved none it says so, so it never looks like nothing happened. A clip with no
  muted notes costs one note read for a quantize and one for a `duplicateLoop`.
- Clearing a clip (`preTransforms: "delete"`) leaves muted notes behind, so the
  read then shows an empty clip with `mutedNotes`.

Showing them with a marker was rejected: no notation can spell one, and a marker
spreads into every serializer and the Skills. Letting edits touch them would
change notes the model can't see and report counts that don't match a read.
