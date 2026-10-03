// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The eval harness's own open retry, so there is no e2e case: it runs before
 * anything e2e exercises exists.
 */
import { describe, expect, it, vi } from "vitest";
import { openLiveSet } from "../../open-live-set.ts";
import { LiveStuckError } from "./open-live-set-dialogs.ts";
import { openLiveSetWithRecovery } from "./open-live-set-recovery.ts";

vi.mock(import("../../open-live-set.ts"), () => ({
  openLiveSet: vi.fn(),
}));

describe("openLiveSetWithRecovery", () => {
  it("fails at once, without retrying or killing Live, when Live is stuck", async () => {
    vi.mocked(openLiveSet).mockRejectedValue(new LiveStuckError("stuck"));

    await expect(openLiveSetWithRecovery("/x.als")).rejects.toThrow("stuck");
    expect(openLiveSet).toHaveBeenCalledTimes(1);
  });
});
