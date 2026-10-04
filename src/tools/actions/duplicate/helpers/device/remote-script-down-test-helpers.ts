// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";

/**
 * Make the remote script answer that it isn't running, so a device copy takes
 * the temp-track route. The test file mocks the node-request module.
 */
export function remoteScriptDown(): void {
  vi.mocked(requestNode).mockResolvedValue({
    success: true,
    result: { available: false },
  });
}
