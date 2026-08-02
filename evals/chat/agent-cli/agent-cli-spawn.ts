// Producer Pal
// Copyright (C) 2026 Taylor Haun, Adam Murray
// AI assistance: Codex (OpenAI), Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { MAX_TOOL_STEPS } from "#evals/shared/step-budget.ts";
import { createStepBudgetWatcher } from "./agent-cli-step-budget.ts";
import {
  type AgentCliTransport,
  scrubAgentCliEnv,
} from "./agent-cli-transport.ts";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
/** Grace period between SIGTERM and SIGKILL when a turn is cut off. */
const SIGKILL_GRACE_MS = 2000;

export interface SpawnAgentCliOptions {
  cwd: string;
  timeoutMs?: number;
  /** Model actions the turn may complete before it is cut off. */
  stepBudget?: number;
}

/**
 * Spawn one restricted agent-CLI turn and return its JSONL stdout.
 *
 * The executable comes from the transport's `binEnvVar` when set, which is both
 * how a user points at a non-default install and how the tests swap in a
 * fixture that emits canned JSONL without touching the network.
 *
 * @param transport - Transport describing the CLI
 * @param args - CLI arguments
 * @param prompt - User prompt written to stdin
 * @param options - Working directory, optional timeout, optional step budget
 * @returns The CLI's JSONL stdout
 */
export function spawnAgentCli(
  transport: AgentCliTransport,
  args: string[],
  prompt: string,
  options: SpawnAgentCliOptions,
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const stepBudget = options.stepBudget ?? MAX_TOOL_STEPS;
  const executable = process.env[transport.binEnvVar] ?? transport.bin;
  const env = scrubAgentCliEnv(process.env, transport.strippedEnvVars);

  return new Promise<string>((resolve, reject) => {
    const child: ChildProcessWithoutNullStreams = spawn(executable, args, {
      cwd: options.cwd,
      env: env,
    });
    const budgetWatcher = createStepBudgetWatcher(transport, stepBudget);
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let overBudget = false;
    let killTimer: NodeJS.Timeout | undefined;

    /**
     * Stop the CLI, escalating only if SIGTERM is ignored. The kill timer is
     * captured so clearTimers() can drop it — left pending it holds the event
     * loop open past the rejection.
     */
    const terminate = (): void => {
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), SIGKILL_GRACE_MS);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, timeoutMs);

    /**
     * Drop both timers so neither keeps the event loop alive after settling.
     */
    const clearTimers = (): void => {
      clearTimeout(timer);
      if (killTimer != null) clearTimeout(killTimer);
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    // setEncoding above makes every chunk a string, but the event types it any.
    child.stdout.on("data", (data: string) => {
      stdout += data;

      if (!overBudget && budgetWatcher.push(data)) {
        overBudget = true;
        terminate();
      }
    });
    child.stderr.on("data", (data) => {
      stderr += data;
    });
    child.on("error", (error) => {
      clearTimers();
      reject(spawnError(transport, executable, error));
    });
    child.on("close", (code) => {
      clearTimers();

      if (overBudget) {
        reject(
          new Error(
            `${transport.label} hit the step budget of ${stepBudget} steps ` +
              `and was stopped. The model was probably looping.`,
          ),
        );
      } else if (timedOut) {
        reject(
          new Error(`${transport.label} timed out after ${timeoutMs / 1000}s`),
        );
      } else if (code !== 0) {
        reject(new Error(exitError(transport, code, stdout, stderr)));
      } else {
        resolve(stdout);
      }
    });
    child.stdin.on("error", (error) => {
      clearTimers();
      child.kill("SIGKILL");
      reject(error);
    });
    child.stdin.end(prompt);
  });
}

/**
 * Turn a spawn failure into something actionable. A missing CLI arrives as a
 * bare `spawn <bin> ENOENT`, which names neither the eval provider that asked
 * for it nor the way to point at a different install.
 *
 * @param transport - Transport describing the CLI
 * @param executable - Executable that failed to spawn
 * @param error - The spawn error
 * @returns Error to reject with
 */
function spawnError(
  transport: AgentCliTransport,
  executable: string,
  error: Error,
): Error {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") return error;

  return new Error(
    `${transport.label} executable "${executable}" not found. ` +
      `Install it, or set ${transport.binEnvVar} to its path.`,
    { cause: error },
  );
}

/**
 * Build a descriptive error for a non-zero exit. The failure event lands at the
 * END of the JSONL stream, so surface it via the transport's parser (whose
 * throw carries the CLI's own message) and fall back to the stdout tail — a
 * head-truncated slice would drop the actual cause.
 *
 * @param transport - Transport describing the CLI
 * @param code - Process exit code
 * @param stdout - Full JSONL stdout
 * @param stderr - Captured stderr
 * @returns Error message describing the failure
 */
function exitError(
  transport: AgentCliTransport,
  code: number | null,
  stdout: string,
  stderr: string,
): string {
  const parts = [`${transport.label} exited ${code}.`];

  let streamError = "";

  try {
    transport.parseStream(stdout);
  } catch (error) {
    streamError = error instanceof Error ? error.message : String(error);
  }

  if (streamError !== "") {
    parts.push(streamError);
  } else if (stdout.trim() !== "") {
    parts.push(`stdout: ${stdout.slice(-500)}`);
  }

  if (stderr.trim() !== "") {
    parts.push(`stderr: ${stderr.slice(-500)}`);
  }

  return parts.join(" ");
}
