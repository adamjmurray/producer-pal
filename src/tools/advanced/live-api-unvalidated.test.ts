// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The executor's own check for an operation type it has no case for, which
// validation normally refuses first.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { liveApi } from "#src/tools/advanced/live-api.ts";

vi.mock(import("#src/tools/advanced/live-api-operation-validation.ts"), () => ({
  validateOperations: vi.fn(),
  operationError: (index: number, error: unknown) =>
    `operations[${index}]: ${String(error)}`,
}));

describe("liveApi given an operation validation let through", () => {
  beforeEach(() => {
    clearMockRegistry();
    registerMockObject("1", { path: livePath.liveSet, type: "Song" });
  });

  it("reports the unknown type on the operation, after those that ran", () => {
    const result = liveApi({
      operations: [{ type: "exists" }, { type: "bogus" }],
    } as unknown as Parameters<typeof liveApi>[0]);

    expect(result).toStrictEqual({
      id: "1",
      results: [true],
      failed: { index: 1, detail: "Unknown operation type: bogus" },
    });
  });
});
