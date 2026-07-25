// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { renderHook, waitFor } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { BUILD_SHA, VERSION } from "#src/shared/config";

const { mockCheckForUpdate } = vi.hoisted(() => ({
  mockCheckForUpdate: vi.fn(),
}));

vi.mock(import("#src/shared/version-check"), () => ({
  checkForUpdate: mockCheckForUpdate,
  formatBuildMarker: vi.fn(),
  isNewerVersion: vi.fn(),
}));

// VERSION is imported directly and always truthy, no env mocking needed
import { useUpdateCheck } from "#webui/hooks/use-update-check";

describe("useUpdateCheck", () => {
  it("returns null when no update is available", async () => {
    mockCheckForUpdate.mockResolvedValue(null);

    const { result } = renderHook(() => useUpdateCheck());

    await waitFor(() => {
      // The build SHA goes along so a re-cut release of the same version is
      // still detected.
      expect(mockCheckForUpdate).toHaveBeenCalledWith(VERSION, BUILD_SHA);
    });

    expect(result.current).toBeNull();
  });

  it("returns the update when one is available", async () => {
    const update = { version: "2.0.0", isRebuild: false };

    mockCheckForUpdate.mockResolvedValue(update);

    const { result } = renderHook(() => useUpdateCheck());

    await waitFor(() => {
      expect(result.current).toStrictEqual(update);
    });
  });
});
