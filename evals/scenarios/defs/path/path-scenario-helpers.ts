// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Assertion helpers for the object-path scenarios.
 *
 * These grade the path the MODEL wrote, not only where the object landed. Both
 * matter, and they fail for different reasons: a path that lands right via a
 * hidden alias or a tolerated legacy value is a different finding from one that
 * lands wrong. A failure names the spelling that actually arrived so the report
 * says which one, instead of just "not path".
 *
 * Nothing here ever asserts that a model USED a hidden param. The aliases exist
 * to catch a wrong guess; rewarding one would enshrine the spelling 2.2.0 is
 * retiring. They are named in failure text only.
 */

import { argText } from "../arg-text.ts";
import {
  TOOL_CONNECT,
  TOOL_CREATE_CLIP,
} from "../clip/helpers/clip-scenario-helpers.ts";
import {
  getToolCalls,
  lastSuccessfulToolCall,
  parsedToolResult,
} from "../../assertions/index.ts";
import {
  type EvalAssertion,
  type EvalTurnResult,
  type ToolCall,
} from "../../types.ts";

/** Hidden location params across the toolset — never graded, only reported. */
const HIDDEN_LOCATION_PARAMS = new Set([
  "ids",
  "paths",
  "slot",
  "slots",
  "toSlot",
  "takeLane",
  "devicePath",
  "split",
  "trackIndex",
  "sceneIndex",
  "trackType",
  "trackId",
  "sceneId",
  "clipId",
  "deviceId",
]);

/**
 * Name the hidden location params a call carried, for failure text.
 * @param call - The tool call to inspect
 * @returns "name=value, …", or "none"
 */
function hiddenSpellings(call: ToolCall): string {
  const used = Object.keys(call.args).filter((key) =>
    HIDDEN_LOCATION_PARAMS.has(key),
  );

  if (used.length === 0) return "none";

  return used.map((key) => `${key}=${argText(call.args[key])}`).join(", ");
}

/**
 * Locate the graded call, failing with a readable message when it is absent.
 * @param turns - All turn results
 * @param turn - Turn index the call belongs to
 * @param tool - Tool name
 * @returns The last successful call to that tool in that turn
 */
function requireCall(
  turns: EvalTurnResult[],
  turn: number,
  tool: string,
): ToolCall {
  const call = lastSuccessfulToolCall(turns, turn, tool);

  if (!call) throw new Error(`${tool} not called in turn ${turn}`);

  return call;
}

/**
 * Assert a call carries the expected canonical path in `path` or `toPath`.
 *
 * @param options - What to grade
 * @param options.turn - Turn index containing the call
 * @param options.tool - Tool name
 * @param options.param - Which location param to read
 * @param options.expected - Accepted path(s); the first is the canonical one
 * @returns A custom assertion
 */
export function assertPathArg(options: {
  turn: number;
  tool: string;
  param: "path" | "toPath";
  expected: string | string[] | RegExp;
}): EvalAssertion {
  const { turn, tool, param, expected } = options;
  const wanted = describeExpected(expected);

  return {
    type: "custom",
    description: `${tool} turn ${turn}: ${param} is ${wanted}`,
    assert: (turns) => {
      const call = requireCall(turns, turn, tool);
      const raw = call.args[param];

      if (raw == null) {
        throw new Error(
          `no ${param} — hidden location params: ${hiddenSpellings(call)}`,
        );
      }

      const actual = argText(raw).replaceAll(" ", "");

      if (!pathAccepted(actual, expected)) {
        throw new Error(`expected ${param} ${wanted}, got '${actual}'`);
      }

      return true;
    },
  };
}

/**
 * Human-readable form of an expected path, for descriptions and failures.
 * @param expected - Accepted path(s) or a shape
 * @returns Quoted list, or the pattern source
 */
function describeExpected(expected: string | string[] | RegExp): string {
  if (expected instanceof RegExp) return `matching ${expected.source}`;

  const accepted = typeof expected === "string" ? [expected] : expected;

  return `'${accepted.join("' or '")}'`;
}

/**
 * Whether a written path satisfies the expectation. A RegExp grades the SHAPE,
 * for destinations whose index the model legitimately chooses (an insertion
 * point among a track's devices), where pinning one would grade the choice
 * rather than the grammar.
 *
 * @param actual - The path the model wrote, spaces stripped
 * @param expected - Accepted path(s) or a shape
 * @returns True when the path is accepted
 */
function pathAccepted(
  actual: string,
  expected: string | string[] | RegExp,
): boolean {
  if (expected instanceof RegExp) return expected.test(actual);

  const accepted = typeof expected === "string" ? [expected] : expected;

  return accepted.includes(actual);
}

/**
 * Assert a call names its target with `id` — the canonical param since 2.2.0 —
 * and not with a path or a hidden alias.
 *
 * @param options - What to grade
 * @param options.turn - Turn index containing the call
 * @param options.tool - Tool name
 * @returns A custom assertion
 */
export function assertAddressedById(options: {
  turn: number;
  tool: string;
}): EvalAssertion {
  const { turn, tool } = options;

  return {
    type: "custom",
    description: `${tool} turn ${turn}: names its target with id`,
    assert: (turns) => {
      const call = requireCall(turns, turn, tool);

      if (call.args.path != null) {
        throw new Error(
          `named the target with path '${argText(call.args.path)}' instead of id`,
        );
      }

      if (argText(call.args.id) === "") {
        throw new Error(
          `no id — hidden location params: ${hiddenSpellings(call)}`,
        );
      }

      return true;
    },
  };
}

/**
 * The opening of a "did the model spell the path right?" clip scenario:
 * connect, create a clip in turn 1, and grade the `path` it wrote.
 *
 * @param expected - Accepted path(s); the first is the canonical one
 * @returns The leading assertions, to spread into a scenario
 */
export function assertClipCreatedAtPath(
  expected: string | string[],
): EvalAssertion[] {
  return [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },
    assertPathArg({ turn: 1, tool: TOOL_CREATE_CLIP, param: "path", expected }),
  ];
}

/** The ways every tool can name a scene. Both are equally correct. */
const SCENE_LOCATION_PARAMS = ["id", "path"];

/**
 * Assert a call names its scene with a published location param. `id` and
 * `path` ("s1") both pass everywhere — only a hidden alias, or naming nothing,
 * fails. Which one a model picks is a counting question over saved runs;
 * grading one would mark the other wrong.
 *
 * `params` is for a tool that publishes a third way: `ppal-playback` still
 * offers `sceneIndex`, while `ppal-select` retired it, so the accepted set
 * can't be one list.
 *
 * @param options - What to grade
 * @param options.turn - Turn index containing the call
 * @param options.tool - Tool name
 * @param options.action - The `action` arg the call must carry, for tools that take one
 * @param options.params - Published location params for this tool
 * @returns A custom assertion
 */
export function assertNamesScene(options: {
  turn: number;
  tool: string;
  action?: string;
  params?: string[];
}): EvalAssertion {
  const { turn, tool, action, params = SCENE_LOCATION_PARAMS } = options;
  const prefix = action == null ? "" : `${action} `;

  return {
    type: "custom",
    description: `${tool} turn ${turn}: ${prefix}names the scene with a published param`,
    assert: (turns) => {
      const call = requireCall(turns, turn, tool);

      if (action != null && call.args.action !== action) {
        throw new Error(
          `expected action '${action}', got '${String(call.args.action)}'`,
        );
      }

      if (!params.some((key) => call.args[key] != null)) {
        throw new Error(
          `no ${params.join("/")} — args: ${JSON.stringify(call.args)}`,
        );
      }

      return true;
    },
  };
}

/**
 * Read one session slot and grade whether it holds a clip. An empty slot reads
 * back as `id: null`, so both directions are checkable — which is what a
 * track/scene transposition needs: the intended slot filled AND the swapped one
 * still empty.
 *
 * @param path - Session slot path (e.g. "t2/s1")
 * @param occupied - Whether the slot should hold a clip
 * @returns A state assertion
 */
export function assertSlotOccupancy(
  path: string,
  occupied: boolean,
): EvalAssertion {
  return {
    type: "state",
    tool: "ppal-read-clip",
    args: { path, include: [] },
    expect: (result) =>
      (((result as { id?: unknown }).id ?? null) != null) === occupied,
    explain: (result) => {
      const id = (result as { id?: unknown }).id ?? null;

      return occupied
        ? `expected a clip at ${path}, found none`
        : `expected ${path} to stay empty, found clip id ${argText(id)}`;
    },
  };
}

/**
 * Split a comma-separated arg into its entries.
 * @param value - The raw arg
 * @returns Trimmed, non-empty entries
 */
export function listEntries(value: unknown): string[] {
  return argText(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

/**
 * Assert every `toPath` in the turn carries the right number of destinations
 * relative to what it pairs against.
 *
 * The list semantics differ per tool on purpose, and getting them backwards is
 * a silent data-loss bug: `update-clip` pairs 1:1, so two clips with one
 * destination put both in the same slot and destroy the first (`rule: "equal"`).
 * `duplicate` sends one destination to every source, so fewer destinations than
 * sources is correct there, but more is not (`rule: "atMost"`).
 *
 * Checks each call separately rather than summing the turn, because splitting
 * one batched call into several 1:1 calls is a perfectly good way to do this —
 * and is safe by construction. Grading the batch would mark that wrong.
 *
 * @param options - What to grade
 * @param options.turn - Turn index containing the calls
 * @param options.tool - Tool name
 * @param options.against - Params the destinations pair with; the first present on a call wins
 * @param options.rule - Whether the counts must match, or may cycle
 * @returns A custom assertion
 */
export function assertDestinationCounts(options: {
  turn: number;
  tool: string;
  against: string[];
  rule: "equal" | "atMost";
}): EvalAssertion {
  const { turn, tool, against, rule } = options;
  const phrasing = rule === "equal" ? "one per" : "no more than";

  return {
    type: "custom",
    description: `${tool} turn ${turn}: toPath lists ${phrasing} ${against[0]}`,
    assert: (turns) => {
      const calls = getToolCalls(turns, turn).filter(
        (call) => call.name === tool && call.args.toPath != null,
      );

      if (calls.length === 0) {
        throw new Error(`no ${tool} call in turn ${turn} carries a toPath`);
      }

      for (const call of calls) {
        const pairedWith = against.find((key) => call.args[key] != null);

        if (pairedWith == null) {
          throw new Error(
            `a toPath call names none of ${against.join("/")} — args: ${JSON.stringify(call.args)}`,
          );
        }

        const destinations = listEntries(call.args.toPath).length;
        const targets = listEntries(call.args[pairedWith]).length;
        const ok =
          rule === "equal" ? destinations === targets : destinations <= targets;

        if (!ok) {
          throw new Error(
            `${destinations} toPath entr${destinations === 1 ? "y" : "ies"} for ${targets} ${pairedWith} entr${targets === 1 ? "y" : "ies"} (${argText(call.args.toPath)} vs ${argText(call.args[pairedWith])})`,
          );
        }
      }

      return true;
    },
  };
}

/**
 * Grade a call's OWN result inside a turn. A scenario that navigates several
 * times in one conversation can't use a single end-of-run state read — that
 * only sees the last one.
 *
 * @param options - What to grade
 * @param options.turn - Turn index containing the call
 * @param options.tool - Tool name
 * @param options.what - What the result should show, for the description
 * @param options.check - Verdict over the parsed result
 * @returns A custom assertion
 */
export function assertCallResult(options: {
  turn: number;
  tool: string;
  what: string;
  check: (result: Record<string, unknown>) => boolean;
}): EvalAssertion {
  const { turn, tool, what, check } = options;

  return {
    type: "custom",
    description: `${tool} turn ${turn}: ${what}`,
    assert: (turns) => {
      const call = requireCall(turns, turn, tool);
      const result = parsedToolResult(call);

      if (result == null) {
        throw new Error(
          `no readable result — got ${String(call.result).slice(0, 160)}`,
        );
      }

      if (!check(result)) {
        throw new Error(
          `${what} — got ${JSON.stringify(result).slice(0, 240)}`,
        );
      }

      return true;
    },
  };
}

/** One arrangement clip on a read track, in overview form. */
interface ArrangementClipOverview {
  name?: string | null;
}

/**
 * Names of the arrangement clips on a read track.
 * @param result - Parsed ppal-read-track result
 * @returns Clip names, an unnamed clip reading as ""
 */
function arrangementClipNames(result: unknown): string[] {
  const track = result as { arrangementClips?: ArrangementClipOverview[] };

  return (track.arrangementClips ?? []).map((clip) => clip.name ?? "");
}

/**
 * A clip with this name sits in the track's arrangement, however the model
 * addressed it — by id, or by the path a result handed back. A warned-and-
 * skipped update leaves the old name in place, so this catches both.
 * @param options - Which track to read and what name to look for
 * @param options.trackIndex - 0-based track index
 * @param options.name - The name the clip should be carrying
 * @returns A state assertion over the track's arrangement clips
 */
export function assertArrangementClipNamed(options: {
  trackIndex: number;
  name: string;
}): EvalAssertion {
  const { trackIndex, name } = options;

  return {
    type: "state",
    tool: "ppal-read-track",
    args: { trackIndex, include: ["arrangement-clips"] },
    expect: (result) => arrangementClipNames(result).includes(name),
    explain: (result) =>
      `expected an arrangement clip named "${name}", got ${
        arrangementClipNames(result)
          .map((found) => `"${found}"`)
          .join(", ") || "no arrangement clips"
      }`,
  };
}
