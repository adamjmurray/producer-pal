// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario runner - executes evaluation scenarios against Ableton Live
 */

import { styleText } from "node:util";
import { formatScenarioHeader, orange } from "#evals/chat/shared/formatting.ts";
import { type ThinkingLevel } from "#evals/chat/shared/types.ts";
import { resetConfig, setConfig } from "#evals/shared/config.ts";
import { fetchLocalModelInfo } from "./run-scenario/local-model-info.ts";
import { MCP_URL } from "#evals/shared/mcp-url.ts";
import { type StatelessMcpServer } from "#src/mcp-server/helpers/http/stateless-mcp.ts";
import { SYSTEM_INSTRUCTION } from "#src/shared/config.ts";
import {
  createEvalSession,
  getDefaultModel,
  type EvalSession,
} from "./eval-session.ts";
import { isQuietMode } from "./helpers/quiet-mode.ts";
import { openLiveSetWithRecovery } from "./helpers/open-live-set/open-live-set-recovery.ts";
import { type RunEnv } from "./run-env/run-env.ts";
import { clearProjectContextBackup } from "./run-scenario/clear-project-context-backup.ts";
import { startToolOverrideProxy } from "./run-scenario/tool-override-proxy.ts";
import {
  computeTotalUsage,
  runMessageTurns,
} from "./run-scenario/message-turns.ts";
import {
  mergeConfigs,
  resolveLiveSetPath,
} from "./run-scenario/scenario-config.ts";
import { type DeciderSettings } from "./helpers/judge/decider-first-judge.ts";
import {
  runAllAssertions,
  type JudgeOverride,
} from "./helpers/scenario-sections.ts";
import {
  type EvalScenario,
  type EvalScenarioResult,
  type EvalTurnResult,
  type EvalProvider,
} from "./types.ts";
import { errorMessage } from "#src/shared/error-message.ts";

export interface RunScenarioOptions {
  provider: EvalProvider;
  model?: string;
  skipLiveSetOpen?: boolean;
  judgeOverride?: JudgeOverride;
  /** The active run environment (CLI-driven), applied via setConfig. */
  runEnv: RunEnv;
  /** Label for the run environment (see `envLabel`), used in output/results. */
  envLabel: string;
  usage?: boolean;
  /** Max output tokens per model call; absent uses the provider's default. */
  outputTokens?: number;
  /** Thinking level for the model's turns; absent keeps the provider default. */
  thinking?: ThinkingLevel;
  skipJudge?: boolean;
  /** Judge with the decider first, escalating to the LLM judge (see `--decider`). */
  decider?: DeciderSettings;
  /** Skip the post-failure self-reflection turn (default: inject one). */
  skipReflection?: boolean;
  /** Seed the opening connect turn instead of paying the model for it
   *  (default: true). See `seed-connect.ts`. */
  seedConnect?: boolean;
}

/**
 * Run a single evaluation scenario
 *
 * @param scenario - The scenario to run
 * @param options - Run options including provider/model
 * @returns Scenario result with turns, assertions, and pass/fail status
 */
export async function runScenario(
  scenario: EvalScenario,
  options: RunScenarioOptions,
): Promise<EvalScenarioResult> {
  const { provider, model, skipLiveSetOpen, judgeOverride } = options;
  const startTime = Date.now();
  const turns: EvalTurnResult[] = [];
  let session: EvalSession | null = null;
  let proxy: StatelessMcpServer | null = null;
  const instructions =
    scenario.instructions === null
      ? undefined
      : (scenario.instructions ?? SYSTEM_INSTRUCTION);
  const liveSetPath = resolveLiveSetPath(scenario.liveSet);

  try {
    clearProjectContextBackup(liveSetPath);

    // 1. Open Live Set and wait for MCP
    if (!skipLiveSetOpen) {
      if (!isQuietMode()) {
        console.log(
          "\n" + styleText("gray", "Opening Live Set: " + liveSetPath),
        );
      }

      await openLiveSetWithRecovery(liveSetPath);
    }

    // 2. Apply the run environment (CLI-driven) merged with scenario-bound config
    const mergedConfig = mergeConfigs(scenario.config, options.runEnv);

    await setConfig(mergedConfig);

    // 3. Create evaluation session
    const effectiveModel = model ?? getDefaultModel(provider);

    logScenarioHeader(
      scenario,
      provider,
      effectiveModel,
      options.envLabel,
      options.thinking,
    );

    if (scenario.toolOverrides != null) {
      proxy = await startToolOverrideProxy(
        MCP_URL,
        scenario.toolOverrides,
        mergedConfig.smallModelMode === true,
      );
    }

    session = await createEvalSession({
      provider,
      model,
      instructions,
      usage: options.usage,
      thinking: options.thinking,
      outputTokens: options.outputTokens,
      ...(proxy != null && { mcpUrl: proxy.url }),
    });

    // 3b. Scenario-specific setup (e.g. clear stale clip slots, so a run
    // against an already-open Live Set still starts clean)
    await scenario.setup?.(session.mcpClient);

    // 4. Run each message turn
    await runMessageTurns(
      scenario,
      session,
      turns,
      options.seedConnect ?? true,
    );

    // 5. Run all assertions (correctness, efficiency, judge)
    const assertionResults = await runAllAssertions(
      scenario,
      turns,
      session,
      provider,
      judgeOverride,
      options.skipJudge ?? false,
      options.skipReflection ?? false,
      options.decider,
    );

    const totalDurationMs = Date.now() - startTime;
    const localModel =
      provider === "local"
        ? await fetchLocalModelInfo(effectiveModel)
        : undefined;

    return {
      scenario,
      configProfileId: options.envLabel,
      instructions,
      ...thinkingField(options.thinking),
      turns,
      assertions: assertionResults,
      totalDurationMs,
      totalUsage: computeTotalUsage(turns),
      ...(localModel && { localModel }),
    };
  } catch (error) {
    return {
      scenario,
      configProfileId: options.envLabel,
      instructions,
      ...thinkingField(options.thinking),
      turns,
      assertions: [],
      totalDurationMs: Date.now() - startTime,
      error: errorMessage(error),
    };
  } finally {
    if (session) {
      // Scenario-specific cleanup, while the MCP session is still usable:
      // restores machine-global state (~/.producer-pal context + memory) that
      // resetConfig() below knows nothing about. Swallow failures — the
      // scenario result is already determined and must not be masked.
      try {
        await scenario.teardown?.(session.mcpClient);
      } catch (error) {
        console.warn(
          styleText(
            "yellow",
            `teardown failed for "${scenario.id}": ${errorMessage(error)}`,
          ),
        );
      }

      await session.close();
    }

    await resetAfterScenario(proxy, liveSetPath);
  }
}

/**
 * Undo what a scenario changed outside its MCP session. Failures are only
 * logged: the scenario result is already determined.
 *
 * @param proxy - The scenario's tool-override proxy, if it had one
 * @param liveSetPath - Path to the scenario's .als file
 */
async function resetAfterScenario(
  proxy: StatelessMcpServer | null,
  liveSetPath: string,
): Promise<void> {
  try {
    await proxy?.close();
  } catch {
    // Nothing left to serve
  }

  try {
    await resetConfig();
  } catch {
    // Ignore reset errors
  }

  try {
    clearProjectContextBackup(liveSetPath);
  } catch (error) {
    console.warn(
      styleText(
        "yellow",
        `could not delete the project context backup: ${errorMessage(error)}`,
      ),
    );
  }
}

/**
 * Print the scenario header, plus optional environment/instructions context lines.
 *
 * @param scenario - The scenario being run
 * @param provider - LLM provider being used
 * @param effectiveModel - Resolved model id
 * @param label - Active run-environment label ("default" is hidden)
 * @param thinking - Thinking level, when one was set
 */
function logScenarioHeader(
  scenario: EvalScenario,
  provider: EvalProvider,
  effectiveModel: string,
  label: string,
  thinking: ThinkingLevel | undefined,
): void {
  console.log(
    formatScenarioHeader(
      scenario.id,
      scenario.description,
      provider,
      effectiveModel,
    ),
  );

  if (label !== "default") {
    console.log(`${orange("|")} ${styleText("gray", "Environment:")} ${label}`);
  }

  if (thinking != null) {
    console.log(`${orange("|")} ${styleText("gray", "Thinking:")} ${thinking}`);
  }

  const instructionsLabel =
    scenario.instructions !== undefined
      ? scenario.instructions == null
        ? "none"
        : "custom"
      : "default";

  console.log(
    `${orange("|")} ${styleText("gray", "Instructions:")} ${instructionsLabel}`,
  );
}

/**
 * @param thinking - Thinking level, when one was set
 * @returns The result field recording it, or nothing
 */
function thinkingField(thinking: ThinkingLevel | undefined): {
  thinking?: string;
} {
  return thinking == null ? {} : { thinking };
}

export { type JudgeOverride };
