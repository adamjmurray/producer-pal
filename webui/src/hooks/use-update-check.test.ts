// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { renderHook, waitFor } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { VERSION } from "#src/shared/version";

const { mockCheckForUpdate } = vi.hoisted(() => ({
  mockCheckForUpdate: vi.fn(),
}));

vi.mock(import("#src/shared/version-check"), () => ({
  checkForUpdate: mockCheckForUpdate,
  isNewerVersion: vi.fn(),
}));

// VERSION is imported directly and always truthy, no env mocking needed
import { useUpdateCheck } from "#webui/hooks/use-update-check";

describe("useUpdateCheck", () => {
  it("returns null when no update is available", async () => {
    mockCheckForUpdate.mockResolvedValue(null);

    const { result } = renderHook(() => useUpdateCheck());

    await waitFor(() => {
      expect(mockCheckForUpdate).toHaveBeenCalledWith(VERSION);
    });

    expect(result.current).toBeNull();
  });

  it("returns latest version when update is available", async () => {
    mockCheckForUpdate.mockResolvedValue({ version: "2.0.0" });

    const { result } = renderHook(() => useUpdateCheck());

    await waitFor(() => {
      expect(result.current).toBe("2.0.0");
    });
  });
});
