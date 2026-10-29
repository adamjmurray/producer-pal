// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * The scenario runner's Judge section: runs the judge (Jev first with `--jev`)
 * and prints the verdict.
 */

import { styleText } from "node:util";
import { formatSubsectionHeader } from "#evals/chat/shared/formatting.ts";
import {
  assertWithLlmJudge,
  type CheckSummary,
} from "../../assertions/index.ts";
import { jevJudgeNote } from "../reporting/jev-judge-report.ts";
import { isQuietMode } from "../quiet-mode.ts";
import {
  type EvalAssertion,
  type EvalAssertionResult,
  type EvalProvider,
  type EvalTurnResult,
} from "../../types.ts";
import {
  assertWithJevFirst,
  type JevFirstDetails,
  type JevSettings,
} from "./jev-first-judge.ts";

/** CLI override for the judge model, when one was passed. */
export interface JudgeOverride {
  provider: EvalProvider;
  model?: string;
}

/**
 * Run and print the Judge section
 *
 * @param assertions - Judge assertions
 * @param turns - Conversation turns
 * @param provider - LLM provider
 * @param judgeOverride - Optional judge override
 * @param checkSummaries - Check results for judge context
 * @param jev - When set, Jev judges first
 * @returns Judge assertion results
 */
export async function printJudgeSection(
  assertions: EvalAssertion[],
  turns: EvalTurnResult[],
  provider: EvalProvider,
  judgeOverride: JudgeOverride | undefined,
  checkSummaries: CheckSummary[],
  jev?: JevSettings,
): Promise<EvalAssertionResult[]> {
  if (assertions.length === 0) {
    return [];
  }

  const results: EvalAssertionResult[] = [];

  for (const assertion of assertions) {
    if (assertion.type !== "llm_judge") {
      continue;
    }

    console.log("\n" + formatSubsectionHeader("Judge"));

    const result =
      jev == null
        ? await assertWithLlmJudge(
            assertion,
            turns,
            provider,
            judgeOverride,
            checkSummaries,
          )
        : await assertWithJevFirst(
            assertion,
            turns,
            provider,
            judgeOverride,
            checkSummaries,
            jev,
          );

    results.push(result);

    const details = result.details as JudgeDetailsView | undefined;

    printJudgeDetails(details);
  }

  return results;
}

/** What the console shows of a judge result. */
type JudgeDetailsView = { pass: boolean; issues: string[] } & Partial<
  Pick<JevFirstDetails, "decidedBy" | "jev">
>;

/**
 * Print judge issues and pass/fail result
 *
 * @param details - Judge result details
 */
function printJudgeDetails(details: JudgeDetailsView | undefined): void {
  const pass = details?.pass ?? false;
  const issues = details?.issues ?? [];

  if (!isQuietMode() && issues.length > 0) {
    console.log("");

    for (const issue of issues) {
      console.log("  " + styleText("red", `✗ ${issue}`));
    }
  }

  const label = pass ? "pass" : "fail";
  const color = pass ? "green" : "red";
  const issueSuffix = issues.length > 0 ? ` — ${issues.length} issue(s)` : "";

  console.log("\n  " + styleText(color, `${label}${issueSuffix}`));

  const note = details == null ? undefined : jevJudgeNote(details);

  if (note != null) {
    console.log("  " + styleText("gray", note));
  }
}
