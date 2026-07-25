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

// --- Per-request notation (MCP transport) ---

/**
 * HTTP header that carries a per-request notation override on POST /mcp.
 *
 * Third of the per-request axes, alongside SMALL_MODEL_MODE_HEADER and
 * DISABLED_TOOLS_HEADER (both in config.ts — this one lives here so it can reach
 * the {@link isNotation} guard it validates against, which config.ts must stay
 * import-free of). One caller — the built-in chat, or a spawned subagent worker
 * — can run a notation the concurrently-running main session isn't using, which
 * a POST /config would clobber for everyone.
 *
 * Notation reaches further than the other two axes: besides selecting the skills
 * variant and the notation-keyed param descriptions, it decides how V8 PARSES
 * and FORMATS clip notes. So the resolved value also rides down to the tools as
 * a request override (see RequestOverrides.notation) — a worker taught stark
 * would otherwise be handed bar|beat note strings by ppal-read-clip.
 *
 * Absent ⇒ the server falls back to `config.notation`, leaving external MCP
 * clients and the device dropdown on the global.
 */
export const NOTATION_HEADER = "x-producer-pal-notation";

/**
 * Resolve the effective notation for one request from its header value, falling
 * back to the global default when the header is absent or not a known notation
 * (so a stray value can't wedge a request into an invalid notation).
 *
 * @param headerValue - The request's header value, or undefined when absent
 * @param fallback - The global `config.notation` to use when no header applies
 * @returns The notation to apply for this request
 */
export function resolveNotation(
  headerValue: string | undefined,
  fallback: Notation,
): Notation {
  return isNotation(headerValue) ? headerValue : fallback;
}
