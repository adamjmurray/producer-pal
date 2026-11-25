// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { styleText } from "node:util";
import { type ModelSpec } from "#evals/shared/parse-model-arg.ts";
import { type DeciderSettings } from "../judge/decider-first-judge.ts";
import { type JudgeOverride } from "../judge/judge-section.ts";
import {
  describeThinking,
  type ThinkingByModel,
} from "../../run-env/parse-thinking-arg.ts";

export interface RunHeader {
  scenarioCount: number;
  modelSpecs: ModelSpec[];
  repeatCount: number;
  /** Environment label; "default" prints nothing */
  label: string;
  /** `--context` tokens, when given */
  context?: number;
  thinking: ThinkingByModel;
  judgeOverride: JudgeOverride;
  decider?: DeciderSettings;
  /** A decider was asked for but `--skip-judge` turns it off */
  deciderIgnored: boolean;
}

/**
 * @param text - Line to print in gray
 */
function gray(text: string): void {
  console.log(styleText("gray", text));
}

/**
 * Print what the run is about to do: how many runs, then each setting in use.
 *
 * @param header - The run's settings
 */
export function printRunHeader(header: RunHeader): void {
  const { scenarioCount, modelSpecs, repeatCount, thinking } = header;
  const totalRuns = scenarioCount * modelSpecs.length * repeatCount;
  const repeatLabel = repeatCount > 1 ? ` × ${repeatCount} trial(s)` : "";

  console.log(
    styleText(
      "bold",
      `Running ${scenarioCount} scenario(s) × ${modelSpecs.length} model(s)` +
        `${repeatLabel} = ${totalRuns} run(s)...`,
    ),
  );

  if (header.label !== "default") {
    gray(`Environment: ${header.label}`);
  }

  if (header.context != null) {
    const copies = modelSpecs
      .filter((spec) => spec.provider === "local")
      .map((spec) => spec.model);

    gray(`Context: ${header.context} tokens (${copies.join(", ")})`);
  }

  if (thinking.size > 0) {
    gray(`Thinking: ${describeThinking(thinking)}`);
  }

  if (header.judgeOverride.thinking != null) {
    gray(`Judge thinking: ${String(header.judgeOverride.thinking)}`);
  }

  if (header.decider != null) {
    gray(
      `Judge: decider ${header.decider.provider}/${header.decider.model} first; LLM judge for escalations`,
    );
  } else if (header.deciderIgnored) {
    gray("--skip-judge: the decider is not used");
  }
}
