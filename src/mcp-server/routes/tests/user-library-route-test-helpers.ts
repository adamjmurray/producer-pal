// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude Opus 5.5 (Anthropic)
// SPDX-License-Identifier: MIT

import { expect } from "vitest";
import { errorOf } from "../../tests/config-dir-test-helpers.ts";

/**
 * Checks that a route refuses a missing, blank or non-string userLibrary.
 * @param post - Sends a JSON body to the route
 */
export async function expectBlankUserLibraryRejected(
  post: (body: unknown) => Promise<Response>,
): Promise<void> {
  for (const body of [{}, { userLibrary: "  " }, { userLibrary: 7 }]) {
    const res = await post(body);

    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe("userLibrary must be a non-empty string");
  }
}
