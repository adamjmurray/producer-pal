// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Where a tool call lands when the device doesn't answer.

import { type McpResponse } from "#src/shared/mcp-responses.ts";
import { type OfflineDeps } from "./offline-deps.ts";
import { offlineGuidance } from "./offline-guidance.ts";
import { offlineManage } from "./offline-manage.ts";

export const MANAGE_TOOL = "ppal-manage";

export interface OfflineCall {
  name: string;
  args: Record<string, unknown>;
  /** Whether this portal lists ppal-manage (small-model mode and `--disable-tools` drop it) */
  manageOffered: boolean;
  /** Connect to the device's server; throws until it answers */
  connect: () => Promise<void>;
}

/**
 * Answer a call the device didn't: ppal-manage does what it can on its own,
 * and anything else is told how to get Producer Pal running.
 * @param call - The tool call and what this portal offers
 * @param deps - What the answers reach out to
 * @returns The response
 */
export async function answerOfflineCall(
  call: OfflineCall,
  deps: OfflineDeps,
): Promise<McpResponse> {
  if (call.name === MANAGE_TOOL && call.manageOffered) {
    const answer = await offlineManage(call.args, call.connect, deps);

    if (answer != null) {
      return answer;
    }
  }

  return await offlineGuidance(call.manageOffered, deps);
}
