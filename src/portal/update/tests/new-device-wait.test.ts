// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { waitForNewDevice } from "../new-device-wait.ts";
import { fakeDevice, updateDeps } from "./update-test-helpers.ts";

describe("waitForNewDevice", () => {
  it("takes the first server that reports a newer version", async () => {
    const version = await waitForNewDevice(
      { from: "2.4.0" },
      fakeDevice("2.4.0", "2.5.0"),
      updateDeps(),
    );

    expect(version).toBe("2.5.0");
  });

  it("takes the version the new device file names even when a version can't be ordered against the old one", async () => {
    const version = await waitForNewDevice(
      { from: "2.5.0-rc1", expected: "2.5.0-rc2" },
      fakeDevice("2.5.0-rc1", "2.5.0-rc2"),
      updateDeps(),
    );

    expect(version).toBe("2.5.0-rc2");
  });

  it("doesn't take the old version for the expected one", async () => {
    await expect(
      waitForNewDevice(
        { from: "2.4.0", expected: "2.4.0" },
        fakeDevice("2.4.0"),
        updateDeps(),
      ),
    ).rejects.toThrow("old version (2.4.0) is still answering");
  });
});
