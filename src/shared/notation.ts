// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Notation identity contract: the `Notation` union plus the constants and guard
 * used to validate the global `config.notation` setting. Lives in `src/shared`
 * (a leaf layer) so both the server (`src/notation`, `src/mcp-server`,
 * `src/live-api-adapter`) and the bundled chat UI (which may only import from
 * `#src/shared/`) can reuse a single source of truth. The actual interpret /
 * format routing lives in `src/notation/notation.ts`.
 */

/**
 * Supported notations, chosen by the global `config.notation` setting.
 * `barbeat` is the default; `midi-json` and `stark` are opt-in.
 */
export type Notation = "barbeat" | "midi-json" | "stark";

export const DEFAULT_NOTATION: Notation = "barbeat";

/** Every supported notation, for runtime validation of the config setting. */
export const NOTATIONS: readonly Notation[] = ["barbeat", "midi-json", "stark"];

/**
 * Human-friendly display name for each notation (the notation dropdown and the
 * skills preview picker). Typed as a full Record so adding a notation to the
 * union forces a label here — the single source both UI pickers read.
 */
export const NOTATION_LABELS: Record<Notation, string> = {
  barbeat: "bar|beat",
  "midi-json": "MIDI JSON",
  stark: "Stark",
};

/**
 * Type guard for a {@link Notation} value (validates the config setting coming
 * from REST / the device UI).
 *
 * @param value - The candidate value
 * @returns True when `value` is a supported notation
 */
export function isNotation(value: unknown): value is Notation {
  return (
    typeof value === "string" &&
    (NOTATIONS as readonly string[]).includes(value)
  );
}
