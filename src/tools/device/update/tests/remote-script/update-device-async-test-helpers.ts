// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { updateDevice } from "../update-device-test-helpers.ts";

/**
 * Update a device. A call that goes through the remote script answers as a
 * promise whatever the type says, so this takes either and never throws
 * synchronously.
 *
 * @param args - The update-device args
 * @param ctx - The request context
 * @returns What the call answered
 */
export async function updateAsync(
  args: Parameters<typeof updateDevice>[0],
  ctx?: Partial<ToolContext>,
): Promise<unknown> {
  return await Promise.resolve().then(() => updateDevice(args, ctx));
}
