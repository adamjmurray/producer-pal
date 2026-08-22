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
import { lastSuccessfulToolCall } from "../../assertions/index.ts";
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
  expected: string | string[];
}): EvalAssertion {
  const { turn, tool, param, expected } = options;
  const accepted = typeof expected === "string" ? [expected] : expected;

  return {
    type: "custom",
    description: `${tool} turn ${turn}: ${param} is '${accepted.join("' or '")}'`,
    assert: (turns) => {
      const call = requireCall(turns, turn, tool);
      const raw = call.args[param];

      if (raw == null) {
        throw new Error(
          `no ${param} — hidden location params: ${hiddenSpellings(call)}`,
        );
      }

      const actual = argText(raw).replaceAll(" ", "");

      if (!accepted.includes(actual)) {
        throw new Error(
          `expected ${param} '${accepted.join("' or '")}', got '${actual}'`,
        );
      }

      return true;
    },
  };
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
