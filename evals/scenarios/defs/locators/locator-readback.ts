// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared grading for the locator scenarios: the Set's locators read back, the
 * `update-live-set` calls a turn made, and the shape of the ids it sent.
 */

import { getToolCalls } from "../../assertions/index.ts";
import {
  type EvalAssertion,
  type EvalTurnResult,
  type ToolCall,
} from "../../types.ts";
import { listEntries } from "../path/path-assertions.ts";
import { argText } from "../arg-text.ts";

export const TOOL_UPDATE_LIVE_SET = "ppal-update-live-set";

/** A locator as the Set should hold it. */
export interface LocatorRow {
  name: string;
  /** Song position, "bar|beat" */
  time: string;
}

/** Live's own ids are all digits; `locator-1` is a model's invention. */
const LIVE_ID_LIST = /^\d+(,\d+)*$/;

/**
 * The successful `update-live-set` calls in a turn that ran one locator
 * operation.
 *
 * @param turns - All turn results
 * @param turn - Turn index to read
 * @param operation - The `locatorOperation` to look for
 * @returns The matching calls, in order
 */
export function locatorCalls(
  turns: EvalTurnResult[],
  turn: number,
  operation: "create" | "delete" | "rename",
): ToolCall[] {
  return getToolCalls(turns, turn).filter(
    (call) =>
      call.name === TOOL_UPDATE_LIVE_SET &&
      call.args.locatorOperation === operation,
  );
}

/**
 * Bar number then beat of a "bar|beat" position, for ordering locators.
 *
 * @param time - Position such as "17|1"
 * @returns A number that grows with the position
 */
function positionOrder(time: string): number {
  const [bar = "0", beat = "0"] = time.split("|");

  return Number(bar) * 1000 + Number(beat);
}

/**
 * Locators on a read-live-set result, in song order.
 *
 * @param result - Parsed ppal-read-live-set result
 * @returns Each locator's name and time
 */
function locatorRows(result: unknown): LocatorRow[] {
  const { locators = [] } = result as { locators?: Partial<LocatorRow>[] };

  return locators
    .map((locator) => ({
      name: locator.name ?? "?",
      time: locator.time ?? "?",
    }))
    .toSorted((a, b) => positionOrder(a.time) - positionOrder(b.time));
}

/**
 * Describe locators for a failure message.
 *
 * @param rows - Locators to describe
 * @returns "Name@bar|beat, ..." or "none"
 */
function describeRows(rows: LocatorRow[]): string {
  return rows.length === 0
    ? "none"
    : rows.map((row) => `${row.name}@${row.time}`).join(", ");
}

/**
 * The Set holds exactly these locators, read back through the tools.
 *
 * @param expected - Locators in song order
 * @returns A state assertion over read-live-set
 */
export function assertLocatorsAre(expected: LocatorRow[]): EvalAssertion {
  return {
    type: "state",
    tool: "ppal-read-live-set",
    args: { include: ["locators"] },
    expect: (result) =>
      describeRows(locatorRows(result)) === describeRows(expected),
    explain: (result) =>
      `expected locators ${describeRows(expected)}, got ${describeRows(locatorRows(result))}`,
  };
}

/**
 * Every `locatorId` the model sent is a Live id. An invented `locator-1`
 * either errors or, worse, names nothing and is skipped.
 *
 * @returns A custom assertion over the whole run
 */
export function assertLocatorIdsAreLives(): EvalAssertion {
  return {
    type: "custom",
    description: "every locatorId sent is one of Live's own (all digits)",
    assert: (turns) => {
      const bad = getToolCalls(turns)
        .filter((call) => call.name === TOOL_UPDATE_LIVE_SET)
        .map((call) => argText(call.args.locatorId))
        .filter(
          (id) => id !== "" && !LIVE_ID_LIST.test(id.replaceAll(" ", "")),
        );

      if (bad.length > 0) {
        throw new Error(`not Live ids: ${bad.join("; ")}`);
      }

      return true;
    },
  };
}

/**
 * One create call made every locator: the times and names are lists, not one
 * call per locator.
 *
 * @param turn - Turn index of the create
 * @param count - How many locators the turn adds
 * @returns A custom assertion
 */
export function assertCreatedInOneCall(
  turn: number,
  count: number,
): EvalAssertion {
  return {
    type: "custom",
    description: `turn ${turn}: all ${count} locators made in one create call`,
    assert: (turns) => {
      const calls = locatorCalls(turns, turn, "create");

      if (calls.length !== 1) {
        throw new Error(`${calls.length} create calls, expected 1`);
      }

      const times = listEntries(calls[0]?.args.locatorTime).length;

      if (times !== count) {
        throw new Error(`${times} locatorTime entries, expected ${count}`);
      }

      return true;
    },
  };
}
