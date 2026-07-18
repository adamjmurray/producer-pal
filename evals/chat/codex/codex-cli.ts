// Producer Pal
// Copyright (C) 2026 Taylor Haun, Adam Murray
// AI assistance: Codex (OpenAI), Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { parseCodexStream, scrubOpenAiKeys } from "./codex-cli-protocol.ts";

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

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (data) => {
      stdout += data;
    });
    child.stderr.on("data", (data) => {
      stderr += data;
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
        reject(new Error(codexExitError(code, stdout, stderr)));
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

/**
 * Build a descriptive error for a non-zero Codex exit. The `turn.failed`/`error`
 * event lands at the END of the JSONL stream, so surface it via parseCodexStream
 * (whose throw carries getErrorMessage's text) and fall back to the stdout tail
 * — a head-truncated slice would drop the actual cause.
 * @param code - Process exit code
 * @param stdout - Full JSONL stdout
 * @param stderr - Captured stderr
 * @returns Error message describing the failure
 */
function codexExitError(
  code: number | null,
  stdout: string,
  stderr: string,
): string {
  const parts = [`codex CLI exited ${code}.`];

  let streamError = "";

  try {
    parseCodexStream(stdout);
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
