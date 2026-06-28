# ADR-0007: Do not build a native Ableton extension

- **Status:** Accepted
- **Date logged:** 2026-06-28

## Context

Ableton offers an extension/control-surface SDK. On paper, a native extension
looks like a cleaner integration than a Max for Live device hosting a V8 MCP
server, so it's a natural "shouldn't we just…" question.

## Decision

Stay on the Max for Live + V8 architecture. Do not port Producer Pal to a native
Ableton extension.

## Alternatives rejected

- **Native Ableton extension SDK** (`@ableton-extensions/sdk`, beta-only as of
  Live 12.4) — investigated (verdict 2026-06-23, verified against the SDK type
  defs + three third-party SDK/MCP projects that all hit the same walls) and
  found a curated subset strictly thinner than the M4L/Live API surface we
  already use. Blocking gaps:
  - **No transport/playback** — no play/stop, no clip/scene `fire`, no
    `current_song_time`. Producer Pal's whole launch story is impossible.
  - **No MIDI-instrument / post-FX render** — `renderPreFxAudio` is the only
    render and is pre-FX only, so there is no freeze/flatten/bounce and you
    **cannot resample a MIDI instrument**. (Precision: this is the real blocker.
    The SDK _can_ write a generated file and add it as an audio clip via
    `createAudioClip`, so it does **not** block clip content from generated
    files — don't overstate this.)
  - **Ephemeral handles** invalidated on move/delete/session — no move-stable
    identity, which breaks the LLM-facing stable-id contract our tools rely on.
  - **No reach upside**: Extensions require Live 12 Suite Beta — the same
    Suite-only audience as Max for Live. Adopting the SDK gains zero addressable
    market to offset the capability losses. Reach is **not** a reason to reopen.

  Adopting it would lose capability, not gain it.

## Consequences

- The M4L device remains the integration point; its constraints (and the
  workarounds in `dev/Arrangement-Operations.md`) are the accepted cost.
- Revisit triggers (either is sufficient): the SDK gains (1) MIDI-instrument /
  post-FX render or freeze/flatten, **or** (2) a move-stable identity primitive.
  Reach/distribution is explicitly not a trigger.
- Public write-up: `docs/how-it-works/why-not-an-extension.md` and
  `docs/how-it-works/running-inside-live.md`. Broader ecosystem thinking lives
  in `dev/plans/Ecosystem.md`.
