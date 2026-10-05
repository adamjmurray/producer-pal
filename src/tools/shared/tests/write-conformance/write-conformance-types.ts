// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type MockWrite } from "#src/test/mocks/registry/mock-write-log.ts";

/** A tool call's args. */
export type ToolArgs = Record<string, unknown>;

/**
 * The rules every write tool answers to, one id per check. Each ties to one of
 * the numbered cases in the suite's README comment (write-conformance.test.ts).
 */
export const CASE_IDS = [
  "order",
  "lone",
  "namedTwice",
  "newTwice",
  "replacedLater",
  "unparsable",
  "unparsableDestination",
  "unappliable",
  "midway",
  "afterChange",
  "wrongLength",
  "refusals",
  "countWithDestinations",
  "loneSkipped",
] as const;

export type CaseId = (typeof CASE_IDS)[number];

/** A call and the entries it should come back with, one per target named. */
export interface Scenario {
  args: ToolArgs;
  /** What each entry should contain (a subset match), in the order named */
  expected: object[];
}

/** A call that names one object twice. */
export interface RepeatScenario extends Scenario {
  /** The same call with only the last mention, for comparing what is written */
  keptArgs: ToolArgs;
  /** Which entries are the earlier mentions; the rest match `expected` */
  skipped: number[];
}

/** A call where one target fails. */
export interface FailureScenario extends Scenario {
  /** Which target fails */
  failIndex: number;
  /** Part of the message Live throws, which the entry's detail must carry */
  message: string;
}

/** A call that throws after a target already changed Live. */
export interface AfterChangeScenario extends FailureScenario {
  /** What that target's entry holds once the change landed (a subset) */
  changed: object;
  /** What the entry's detail calls the change that landed before the throw */
  landed: string;
}

/** A call where a later target replaces an earlier one. */
export interface ReplacedScenario extends Scenario {
  /** The earlier targets a later one replaces */
  replaced: number[];
  /** The later target for each, as the caller wrote it */
  by: string[];
  /** The same call without the replaced targets, for comparing what is written */
  keptArgs: ToolArgs;
}

/** A call with one target that can't be applied. */
export interface UnappliableScenario extends Scenario {
  /** Which target can't be applied */
  badIndex: number;
  /** Writes the other targets must have made (a subset match on each) */
  landed: Array<Partial<MockWrite>>;
}

/** A call whose lone target is skipped. */
export interface LoneScenario {
  args: ToolArgs;
  /** Part of the skip's detail, which the call throws with */
  detail: string;
}

/**
 * What the suite needs to know about one write tool. Every hook sets up its
 * own mock objects and returns the call to make; the suite clears the mock
 * between hooks. A case that doesn't apply is listed in `na` with a reason
 * instead of getting a hook.
 */
export interface WriteToolAdapter {
  tool: string;
  run: (args: ToolArgs) => unknown;
  /** Cases that can't apply to this tool, and why */
  na?: Partial<Record<CaseId, string>>;

  /** `n` targets named out of order, so the order of the entries means something */
  many?: (n: number) => Scenario;
  /** One object named twice, in two spellings where the tool takes both */
  repeat?: () => RepeatScenario;
  /** Two new objects named in one call, which is two targets */
  newTwice?: () => Scenario;
  /** A later target that fully replaces an earlier one */
  replacedLater?: () => ReplacedScenario;
  /** A call with an entry that can't be parsed */
  unparsable?: () => ToolArgs;
  /** Calls whose destination list holds an entry that can't be parsed, one per kind of destination */
  unparsableDestinations?: Array<() => ToolArgs>;
  unappliable?: () => UnappliableScenario;
  midway?: () => FailureScenario;
  afterChange?: () => AfterChangeScenario;
  /** A list that doesn't match the number of targets */
  wrongLength?: () => ToolArgs;
  /** Other calls the tool refuses up front, each set up when it is called */
  refusals?: Array<() => ToolArgs>;
  /** `count` together with a list of destinations */
  countWithDestinations?: () => ToolArgs;
  loneSkipped?: () => LoneScenario;
}
