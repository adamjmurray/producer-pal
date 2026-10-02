# ADR-0052: Muted notes are hidden and left alone

- **Status:** Accepted
- **Date logged:** 2026-10-01

## Context

No note notation can spell a muted note, so a muted note read back as an
ordinary one. The model took it for a note that plays, and could not tell that
it didn't.

## Decision

**Muted notes don't exist to the model.** Live's `mute` flag (a note
"deactivated" in the UI) is the line:

- **Reads hide them.** `read-clip` leaves them out of `notes`. Every note count
  (`noteCount`, notes outside the region) leaves them out too, so a count always
  matches what a read shows. `read-clip` reports how many it hid as
  `mutedNotes`, only when there are some, so a clip holding only muted notes is
  not read as empty.
- **Edits treat them as absent and leave them in place.** Transforms don't
  select, change, delete or count them, and neighbor functions (`legato`,
  `note.index`, ...) skip them. Merges, transform-only updates and `code`
  rewrites write them back exactly as they were.
- **A note written at a muted note's pitch and start replaces it.** The model
  asked for a note there. (A delete marker aimed at one is a no-op, since the
  note does not exist to it.)
- **Bar copy skips them.** They are not part of the source bar the model sees.
- **A transform-only update on a clip of only muted notes** is ignored, and says
  so.
- **Copying a whole clip keeps them** (duplicate to a new place, take lanes),
  since that is not an edit of notes the model sees.
- **Replacing, emptying or moving a clip** carries or drops its muted notes with
  it, as before.
- **Native Live operations act on them,** because Live does (verified):
  `quantize` moves them and `duplicateLoop` copies them. A quantize on a clip
  with only muted notes reports nothing.

## Alternatives rejected

- **Show muted notes with a marker.** No notation can spell one, and a marker
  spreads into every serializer and the Skills.
- **Let edits touch them.** A transform would change notes the model cannot see
  and report counts that don't match a read.
- **Copy muted notes with a bar copy.** The copy would hold notes the model
  never saw in the source.

## Consequences

- A user who mutes notes on purpose can't ask the model about them, beyond the
  `mutedNotes` count.
- Clearing a clip (`preTransforms: "delete"`) leaves muted notes behind. A read
  then shows an empty clip with `mutedNotes`.
- Same-pitch overlaps resolve the way Live always does: the note that starts
  earlier is cut at the next one's start, muted or not. So a new note can come
  out shorter than asked, or shorten a muted one, with no detail.
- A transform that lands a visible note on a muted note's exact pitch and start
  replaces the muted one, silently.

The overlap and transform cases here, and the quantize case above, are known
gaps to be reported on the write result later.
