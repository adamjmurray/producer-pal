// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Codex (OpenAI)
// SPDX-License-Identifier: GPL-3.0-or-later

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { scrubOpenAiKeys } from "./codex-cli-protocol.ts";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export interface SpawnCodexOptions {
  cwd: string;
  timeoutMs?: number;
}

/**
 * Spawn a restricted Codex turn and return its JSONL stdout.
 * @param args - Codex CLI arguments
 * @param prompt - User prompt written to stdin
 * @param options - Working directory and optional timeout
 * @returns Codex JSONL stdout
 */
export function spawnCodex(
  args: string[],
  prompt: string,
  options: SpawnCodexOptions,
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const executable = process.env.CODEX_BIN ?? "codex";
  const env = scrubOpenAiKeys(process.env);

  return new Promise<string>((resolve, reject) => {
    const child: ChildProcessWithoutNullStreams = spawn(executable, args, {
      cwd: options.cwd,
      env: env,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2000);
    }, timeoutMs);

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);

      if (timedOut) {
        reject(new Error(`codex CLI timed out after ${timeoutMs / 1000}s`));
      } else if (code !== 0) {
        reject(
          new Error(
            `codex CLI exited ${code}. stderr: ${stderr.slice(0, 500)}\n` +
              `stdout: ${stdout.slice(0, 500)}`,
          ),
        );
      } else {
        resolve(stdout);
      }
    });
    child.stdin.on("error", (error) => {
      clearTimeout(timer);
      child.kill("SIGKILL");
      reject(error);
    });
    child.stdin.end(prompt);
  });
}
