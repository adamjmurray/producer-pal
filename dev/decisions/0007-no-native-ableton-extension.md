# ADR-0007: Do not build a native Ableton extension

- **Status:** Accepted
- **Date logged:** 2026-06-28

## Context

Ableton has an extension/control-surface SDK. On paper a native extension looks
cleaner than a Max for Live device hosting a V8 MCP server, so "shouldn't we
just use that?" comes up regularly.

## Decision

Stay on Max for Live + V8. Don't port Producer Pal to a native extension.

## Alternatives rejected

**The Ableton extension SDK** (`@ableton-extensions/sdk`, beta-only as of Live
12.4). Investigated 2026-06-23 against the SDK type definitions and three
third-party projects that hit the same walls. It exposes a curated subset that
is strictly thinner than the Live API we already use:

- **No transport or playback** — no play/stop, no clip or scene `fire`, no
  `current_song_time`. Producer Pal's entire launch story is impossible.
- **No MIDI-instrument or post-FX render.** `renderPreFxAudio` is pre-FX only,
  so there's no freeze, flatten, or bounce, and you can't resample a MIDI
  instrument. This is the real blocker. Note it does _not_ block clip content
  from generated files — the SDK can write a file and add it via
  `createAudioClip`.
- **Ephemeral handles** invalidated on move, delete, or new session. No
  move-stable identity, which breaks the stable-id contract our tools give the
  model.
- **No reach upside.** Extensions need Live 12 Suite Beta — the same Suite-only
  audience as Max for Live, so there's no market gained to offset the losses.
  Reach is explicitly not a reason to reopen this.

## Consequences

- The M4L device stays the integration point, and its constraints (see
  `dev/Arrangement-Operations.md`) are the accepted cost.
- Revisit if the SDK gains either MIDI-instrument/post-FX render (or
  freeze/flatten) or a move-stable identity primitive.
- Public write-up: `docs/how-it-works/why-not-an-extension.md`.
