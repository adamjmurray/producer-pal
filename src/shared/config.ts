// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared, cross-cutting configuration constants used across the codebase
// (notation layer, tools layer, server, portal, and web UI).
//
// Deliberately import-free: the web UI compiles this file under a tsconfig
// without allowImportingTsExtensions, so a `#src/...ts` import here breaks that
// build. The third per-request header (NOTATION_HEADER / resolveNotation) lives
// in notation.ts with the Notation union it validates against, for that reason
// and because that module already owns notation identity.

// Semantic versioning: major.minor.patch
// Currently in pre-release, working towards 1.0.0
// NOTE: the VERSION value is updated in place by
// scripts/build-and-release/bump-version.ts (regex on this exact line shape).
export const VERSION = "2.1.0";

// The short commit SHA this build came from, or "" when unknown (running from
// source, tests). Substituted at build time by config/build-sha.mjs — read via
// process.env so it survives as a plain literal in the Max V8 runtime and the
// browser bundle, neither of which has a `process` global. The narrowed local
// declaration below is what lets this file type-check under both the Node-typed
// src project and the DOM-only webui project.
declare const process: { env: Record<string, string | undefined> };

export const BUILD_SHA = process.env.BUILD_SHA ?? "";

// Minimum required Ableton Live version (no "v" prefix)
export const MIN_LIVE_VERSION = "12.3.0";

/**
 * Tolerance (in beats) below which two beat-time positions are treated as the
 * SAME musical position — a "millibeat" floor that absorbs floating-point drift
 * from fraction / round-trip math (e.g. a triplet position vs a nearby decimal).
 *
 * This is the project's canonical "same position" epsilon. It is used for
 * note-collision dedupe, v0 deletion matching, serializer time-grouping (the
 * round-trip floor), locator-time matching, and start-marker comparisons.
 *
 * It is specifically a POSITION-equality tolerance. It is deliberately NOT
 * shared with the other 0.001-magnitude tolerances in the codebase, which are
 * distinct concepts that only happen to share a value today and must be free to
 * change independently:
 *   - duration-equality comparisons (serializer chord/merge/drum grouping);
 *   - the meter-scaled duration-change threshold (`0.001 * denomFactor`);
 *   - probability-equality (the 0..1 probability scale, not beats);
 *   - the fraction-match epsilon (`1e-6`, serializer-fractions).
 * Do not redirect those here without re-checking that they truly want to move
 * together.
 */
export const SAME_TIME_EPSILON = 0.001;

// --- Web UI chat system instruction ---

// The webui chat's built-in system instruction (NOT the ppal-connect skills
// blob). A shared config constant so both the browser (chat send + the
// Instructions editor's built-in reference) and Node-for-Max (the system-prompt
// store, which hashes it for fork-time drift provenance) agree on one
// definition.
export const SYSTEM_INSTRUCTION = `You are an AI music composition assistant using Producer Pal, a toolset for Ableton Live.

Help users create, edit, and arrange music — tracks, clips, devices, MIDI, audio, and arrangement.

When asked to create or edit music, do it. Use your tools to find what you need (tracks, clips, scale, drum maps) instead of asking the user for details you can look up, and write the musical content yourself using the project's key and scale unless the user gives specific notes. Don't make changes the user didn't ask for.

If a tool returns an error, read the message, fix the arguments, and call it again — don't explain the error away or claim something isn't supported.

If the user hasn't connected to Ableton Live, suggest connecting. Call ppal-connect to connect.

Be creative and focus on the user's musical goals.`;

/**
 * Resolve the system instruction actually sent to the model: a non-blank custom
 * override (~/.producer-pal/system-prompt.md) fully replaces the built-in;
 * blank/absent falls back to {@link SYSTEM_INSTRUCTION}. Shared by the chat
 * adapter (send) and the conversation snapshot / transcript notice (display) so
 * all three agree on what "the system prompt" is.
 * @param override - The custom system-prompt override, if any
 * @returns The effective system instruction
 */
export function resolveSystemInstruction(override?: string | null): string {
  return override?.trim() ? override : SYSTEM_INSTRUCTION;
}

// --- Per-request small-model mode (MCP transport) ---

/**
 * HTTP header that carries a per-request small-model-mode override on POST /mcp.
 *
 * Small-model mode drives BOTH tool-schema shrinking (create-mcp-server.ts) and
 * the skills variant (basic vs standard, enrich-connect.ts). It is otherwise a
 * single server-side global (`config.smallModelMode`), which means every caller
 * shares one value. This header lets an individual caller — the built-in chat,
 * or a spawned subagent worker — drive its own value for its own requests, so a
 * full-strength orchestrator can delegate to cheap small-model workers without
 * clobbering the global (which a POST /config would).
 *
 * Absent ⇒ the server falls back to `config.smallModelMode`. External MCP
 * clients (Claude Desktop, MCP Inspector) and the device toggle never send it
 * and keep using the global default. Sent lowercase; HTTP header names are
 * case-insensitive and Express's `req.get` matches accordingly.
 */
export const SMALL_MODEL_MODE_HEADER = "x-producer-pal-small-model-mode";

/**
 * Resolve the effective small-model mode for one request from its header value,
 * falling back to the global default when the header is absent or unrecognized.
 * The client sends the string "true" or "false"; anything else is treated as
 * absent so a stray value can't force a mode.
 *
 * @param headerValue - The request's header value, or undefined when absent
 * @param fallback - The global `config.smallModelMode` to use when no header
 * @returns The small-model mode to apply for this request
 */
export function resolveSmallModelMode(
  headerValue: string | undefined,
  fallback: boolean,
): boolean {
  if (headerValue === "true") return true;
  if (headerValue === "false") return false;

  return fallback;
}

// --- Per-request tool subsetting (MCP transport) ---

/**
 * HTTP header that narrows one request's toolset: a comma-separated list of
 * tools to withhold from the server's configured set.
 *
 * A SUBTRACTION rather than a whitelist, for two reasons. The client-side
 * toggles it carries are themselves a sparse map where absent means enabled, and
 * the header has to be set when the transport is built — before `listTools`
 * could tell the caller what the full catalog even is. Subtracting needs no
 * catalog: a name the server doesn't know is simply a no-op, and a tool added in
 * a later release stays enabled by default.
 *
 * It drives BOTH tool registration (the caller's `listTools` shrinks, so it
 * isn't paying for schemas it disabled) and the skills variant — a fragment
 * teaching only withheld tools is dropped from the ppal-connect blob. Absent ⇒
 * the server's global `config.tools`, so external MCP clients are unaffected;
 * same contract as {@link SMALL_MODEL_MODE_HEADER}.
 */
export const DISABLED_TOOLS_HEADER = "x-producer-pal-disabled-tools";

/**
 * Resolve the tools available to one request: the server's configured set minus
 * anything the request's header withholds. An absent or empty header leaves the
 * configured set untouched.
 *
 * NOTHING IS RESERVED HERE, and that is deliberate — `ppal-connect` included.
 * `validateTools` (create-mcp-server.ts) does require it, which looks like an
 * inconsistency worth "fixing"; it is not. The two guard different things:
 * `validateTools` guards the server's GLOBAL config, where dropping the entry
 * point would leave an external MCP client with no way in. This guards ONE
 * request's subtraction, and a subagent worker withholds `ppal-connect` on
 * purpose — its briefing replaces the connect call, and withholding the tool is
 * also what makes the server drop the connect/context skills fragments so the
 * briefing stays short (see WORKER_WITHHELD_TOOLS in subagent-briefing.ts).
 * Reserving the name here would hand every worker `ppal-connect` back and
 * re-inflate every briefing.
 *
 * @param headerValue - The request's header value, or undefined when absent
 * @param configuredTools - The server's global `config.tools`
 * @returns The tools to register and to gate skills fragments on
 */
export function resolveEnabledTools(
  headerValue: string | undefined,
  configuredTools: readonly string[],
): string[] {
  const disabled = new Set(
    (headerValue ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name !== ""),
  );

  if (disabled.size === 0) return [...configuredTools];

  return configuredTools.filter((name) => !disabled.has(name));
}
