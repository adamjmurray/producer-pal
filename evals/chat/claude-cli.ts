// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Subprocess IO for the Claude-CLI eval transport. Spawns `claude` with the
 * Anthropic API key scrubbed (→ Max OAuth billing) and the prompt on stdin.
 *
 * Kept separate from claude-cli-protocol.ts (pure arg/parse logic) so the network/
 * subprocess boundary is isolated and the pure helpers stay unit-testable.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { tmpdir } from "node:os";
import { scrubAnthropicKey } from "./claude-cli-protocol.ts";

/** Anthropic outages have hung the CLI for minutes; cap a single turn. */
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export interface SpawnClaudeOptions {
  /** Kill the subprocess after this long. */
  timeoutMs?: number;
  /**
   * Working directory. Defaults to the OS temp dir so no project CLAUDE.md is
   * auto-discovered into the eval prompt (keeps runs comparable / fair).
   */
  cwd?: string;
}

/**
 * Spawn `claude` with the given argv, write `prompt` to stdin, and resolve its
 * stdout. The Anthropic API key is stripped from the child env so it bills against
 * Claude Max. A missing `claude` binary (ENOENT) rejects immediately — no point
 * retrying — so callers can surface a clear "install Claude Code" message.
 *
 * @param args - argv built by claude-cli-protocol (buildSessionArgs / buildJudgeArgs)
 * @param prompt - The user prompt, written to the child's stdin
 * @param options - Timeout and working directory overrides
 * @returns The child's stdout
 * @throws On non-zero exit, timeout, or spawn error (with stderr context)
 */
export function spawnClaude(
  args: string[],
  prompt: string,
  options: SpawnClaudeOptions = {},
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cwd = options.cwd ?? tmpdir();
  const env = scrubAnthropicKey(process.env);

  return new Promise<string>((resolve, reject) => {
    const child: ChildProcessWithoutNullStreams = spawn("claude", args, {
      cwd,
      env: env as NodeJS.ProcessEnv,
    });

    let out = "";
    let err = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* already gone */
        }
      }, 2000);
    }, timeoutMs);

    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);

      if (timedOut) {
        reject(
          new Error(
            `claude CLI timed out after ${timeoutMs / 1000}s. stderr: ${err.slice(0, 500)}`,
          ),
        );
      } else if (code !== 0) {
        reject(
          new Error(
            `claude CLI exited ${code}. stderr: ${err.slice(0, 500)}\nstdout: ${out.slice(0, 500)}`,
          ),
        );
      } else {
        resolve(out);
      }
    });

    // If the child closes stdin early (errored/exited), writing surfaces as an
    // 'error' (EPIPE) on the stdin stream, not on the child. With no listener Node
    // throws it as unhandled and crashes the batch — capture it as a rejection.
    child.stdin.on("error", (e) => {
      clearTimeout(timer);

      try {
        child.kill("SIGKILL");
      } catch {
        /* already gone */
      }

      reject(e);
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}
