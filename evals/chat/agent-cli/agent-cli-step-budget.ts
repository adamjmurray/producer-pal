// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * The step budget that bounds a runaway agent-CLI turn.
 *
 * Neither CLI takes a step limit on argv that we can rely on, so the bound is
 * ours: watch stdout as it arrives, count the model's actions with the
 * transport's counter, and report when it has gone past its budget. The caller
 * kills the subprocess — a model stuck retrying one tool then fails as a blown
 * budget in seconds instead of burning the whole wall-clock timeout.
 */

import { type TurnResult } from "#evals/chat/shared/types.ts";
import { parseJsonlLine } from "./agent-cli-stream.ts";
import { type AgentCliTransport } from "./agent-cli-transport.ts";

export interface StepBudgetWatcher {
  /**
   * Feed a stdout chunk.
   *
   * @param chunk - Decoded stdout text, at any chunk boundary
   * @returns True once the turn has started a step beyond its budget
   */
  push: (chunk: string) => boolean;
}

/**
 * Watch a CLI's stdout and report when its step budget is spent.
 *
 * @param transport - Transport whose counter reads the events
 * @param budget - Steps the turn may complete before it is cut off
 * @returns A watcher fed one stdout chunk at a time
 */
export function createStepBudgetWatcher(
  transport: AgentCliTransport,
  budget: number,
): StepBudgetWatcher {
  // Chunks split anywhere, so hold the trailing partial line until it finishes.
  let pending = "";
  let steps = 0;

  return {
    push: (chunk: string): boolean => {
      pending += chunk;
      const lines = pending.split("\n");

      pending = lines.pop() ?? "";

      for (const line of lines) {
        const event = parseJsonlLine(line);

        if (event != null) {
          steps += transport.countSteps(event);
        }
      }

      // Strictly greater: a turn that spends its budget exactly and stops is
      // not a runaway, so only the step past the budget cuts it off.
      return steps > budget;
    },
  };
}

/** The budget stopped the CLI. Keeps what it printed, so the turn isn't lost. */
export class StepBudgetError extends Error {
  readonly stdout: string;

  constructor(message: string, stdout: string) {
    super(message);
    this.name = "StepBudgetError";
    this.stdout = stdout;
  }
}

/** A stopped turn, parsed: what the model did before the budget stopped it. */
export class StoppedTurnError extends Error {
  readonly turn: TurnResult;

  constructor(message: string, turn: TurnResult) {
    super(message);
    this.name = "StoppedTurnError";
    this.turn = turn;
  }
}
