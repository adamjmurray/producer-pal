# ADR-0007: Do not build a native Ableton extension

- **Status:** Accepted
- **Date logged:** 2026-06-28

## Decision

Stay on Max for Live + V8. Don't port Producer Pal to Ableton's extension SDK
(`@ableton-extensions/sdk`, beta-only as of Live 12.4).

## Rejected

**The extension SDK.** Checked against its type definitions in June 2026. It is
strictly thinner than the Live API we use:

- No transport or playback: no play/stop, no clip or scene `fire`, no
  `current_song_time`.
- No MIDI-instrument or post-FX render (`renderPreFxAudio` is pre-FX only), so
  no freeze, flatten or bounce. This is the real blocker.
- Handles are invalidated on move, delete or new session. There is no
  move-stable identity, which breaks the stable-id contract our tools give the
  model.
- No reach gain: it needs Live 12 Suite Beta, the same Suite-only audience as
  Max for Live. Reach is not a reason to reopen this.

## Revisit if

The SDK gains MIDI-instrument or post-FX render (or freeze/flatten), or a
move-stable identity.

Public write-up: `docs/how-it-works/why-not-an-extension.md`.
