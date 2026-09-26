# ADR-0044: A write result reports only what didn't land as asked

- **Status:** Accepted
- **Date logged:** 2026-09-13
- **Amended by:** [ADR-0050](0050-an-entry-explains-itself-in-detail.md) — the
  entry's `reason` was renamed `detail`, on a skip too.

## Context

Write tools answered with the caller's own arguments. `update-track` with
`gainDb: -6.333333, pan: -0.333333` came back `{gainDb: -6.33, pan: -0.33}`;
`update-live-set` with `tempo: 120, timeSignature: "3/4"` came back with both;
an `update-device` param written as `50` came back `value: 50`; a
`play-arrangement` from `5|1` came back `startTime: "5|1"`.

Every one of those is the number the caller just sent, spending their context to
say "yes, that". The values are read back off Live rather than echoed for a good
reason — Live clamps and snaps what it is given — but a read-back that agrees
with the argument carries nothing.

## Decision

**A write reports a value only when it isn't the one asked for**, at the
resolution the read tools publish (two decimals for dB, pan and tempo; the
bar|beat spelling for a song position).

- **Same value → silence.** Drift below that resolution is the same value: Live
  keeps a 32-bit float, so -6.333333 reads back -6.33 either way.
- **A different value → the value read back off the object**, published the way
  a read publishes it, plus a `detail` naming the fields it applies to: "gainDb,
  pan read back as shown, not as sent". The wording is observational because the
  causes aren't distinguishable from here — Live clamps, snaps to a step, or
  ignores the write and leaves what was there. A device param keeps the clamp
  and ladder details it already had, which do say which.
- **Not comparable → always report.** A value written as a display string — a
  unit, an enum label, a note name, `loc:Verse` — is a spelling, not a number to
  compare a read-back with, so the read-back is news. So is a read-back that
  isn't a number: a fader at the bottom of its range reads "-inf".
- **Governing state still reports**, because the caller may never have read it:
  `panningMode` when a pan param went in under **split** and the call didn't
  name the mode, and playback's `startTime` when the caller didn't set it (that
  is where playback began). Stereo is what every caller already assumes, so it
  stays unsaid. The loop fields were already conditional this way.
- **A refusal about one target rides on that target's entry.** `leftPan`/
  `rightPan` in stereo mode, `pan` in split mode, and a mixer or send param a
  rack macro owns are a `detail` on the track now instead of a warning — with
  silence meaning "landed", a refusal that only warns reads as success. A
  refused send keeps its slot as `{return, returnId, ok: false, detail}`.
- **`ppal-select` is unchanged.** The selection it reports is what the call
  produced, not an echo of an argument.

## Alternatives rejected

- **Keep echoing the arguments.** What this replaces. It reads as confirmation
  and is indistinguishable from a write that silently didn't land.
- **A `changed: true` flag beside every value.** Says the same thing the value's
  presence now says, and costs a key on every entry of every list.
- **Compare the raw floats.** Live stores a 32-bit float of a 6-significant-
  digit value, so nothing a caller writes ever compares equal, and every write
  would report.
- **Compare the caller's spelling with the read-back's.** `startTime: "5|1.0"`
  would report `"5|1"` back at a position that landed exactly. Positions compare
  as beats; only the spelling a locator name resolved to is news.
- **Keep `{return, returnId}` for a send that landed.** The caller named the
  return; an entry that adds nothing to it is a line of JSON per send. A `sends`
  array now appears only when a send has something to say.
- **Leave the wrong-mode pan params as warnings.** They are about one track in a
  list, which is exactly what an entry is for (ADR-0042).

## Consequences

- One comparison, one publisher and one detail, used by the mixer, send, tempo
  and device-param write paths:
  [`read-back-comparison.ts`](../../src/tools/shared/helpers/read-back-comparison.ts).
  Reads still happen on every write — only the reporting is conditional. A
  device param compares exactly, because its read already publishes at the
  param's own display precision; everything else compares at the resolution its
  read publishes (two decimals for dB, pan and tempo).
- `update-track` answers `{id, path}` for a mixer write that landed, plus
  `panningMode: "split"` when a pan param went in under a split mode the call
  didn't name.
- `update-device`/`create-device` answer `{id, name}` for a param that took the
  number asked for.
- `update-live-set` drops `tempo` and `timeSignature` when Live keeps them;
  `scale` still reports, because Live spells the root its own way.
- `ppal-playback` drops `startTime` when the caller's own bar|beat landed there.
- Scripts reading these fields unconditionally see `undefined`; documented in
  [migration](../../docs/guide/migration.md).
- **Revisit trigger:** a property Live won't read back inside the request that
  wrote it can't use this — a stale read would report the value from before the
  write as though Live had changed it. `live_set loop` is the known one, and it
  stays out of this rule.
