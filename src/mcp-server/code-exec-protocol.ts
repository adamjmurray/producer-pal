// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Node-side handler for code execution requests from V8.
 * Receives code + globals, runs in sandbox, sends result back.
 */

import Max from "max-api";
import { executeSandboxedCode } from "./code-executor.ts";
import * as console from "./node-for-max-logger.ts";

/**
 * Handle a code execution request from V8.
 * Runs the code in a sandboxed VM and sends the result back.
 *
 * @param requestId - The request ID to correlate with the response
 * @param requestJson - JSON string with { code, globals }
 */
export async function handleCodeExecRequest(
  requestId: string,
  requestJson: string,
): Promise<void> {
  let code: string;
  let globals: Record<string, unknown>;

  try {
    const request = JSON.parse(requestJson) as {
      code: string;
      globals?: Record<string, unknown>;
    };

    code = request.code;
    globals = request.globals ?? {};
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error(
      `Failed to parse code_exec_request: ${message} [requestId=${requestId}]`,
    );

    await sendCodeExecResult(requestId, {
      success: false,
      error: `Failed to parse request: ${message}`,
    });

    return;
  }

  console.info(`code_exec_request(requestId=${requestId})`);

  const result = executeSandboxedCode(code, globals);

  await sendCodeExecResult(requestId, result);
}

/**
 * Send code execution result back to V8.
 *
 * @param requestId - The request ID
 * @param result - The execution result
 * @param result.success - Whether execution succeeded
 * @param result.result - The return value (on success)
 * @param result.error - Error message (on failure)
 */
async function sendCodeExecResult(
  requestId: string,
  result: { success: boolean; result?: unknown; error?: string },
): Promise<void> {
  try {
    await Max.outlet("code_exec_result", requestId, JSON.stringify(result));
  } catch (error) {
    console.error(
      `Failed to send code_exec_result: ${String(error)} [requestId=${requestId}]`,
    );
  }
}
