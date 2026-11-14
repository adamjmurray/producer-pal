// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { execFileSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { liveAppMajorVersion } from "./live-app-major-version.ts";

vi.mock(import("node:child_process"), () => ({ execFileSync: vi.fn() }));

describe("liveAppMajorVersion", () => {
  beforeEach(() => {
    vi.mocked(execFileSync).mockReset();
  });

  it("returns the leading number of the bundle version", () => {
    vi.mocked(execFileSync).mockReturnValue("13.0b25 (2026-11-03_abc123)\n");

    expect(liveAppMajorVersion("Some Live")).toBe(13);
  });

  it("reads the Info.plist of an app name under /Applications", () => {
    vi.mocked(execFileSync).mockReturnValue("12.3\n");
    liveAppMajorVersion("Some Live");

    expect(vi.mocked(execFileSync).mock.calls[0]?.[1]).toContain(
      "/Applications/Some Live.app/Contents/Info.plist",
    );
  });

  it("reads the Info.plist of an absolute bundle path as given", () => {
    vi.mocked(execFileSync).mockReturnValue("12.3\n");
    liveAppMajorVersion("/elsewhere/Some Live.app");

    expect(vi.mocked(execFileSync).mock.calls[0]?.[1]).toContain(
      "/elsewhere/Some Live.app/Contents/Info.plist",
    );
  });

  it("returns null when the version doesn't start with a number", () => {
    vi.mocked(execFileSync).mockReturnValue("beta\n");

    expect(liveAppMajorVersion("Some Live")).toBeNull();
  });

  it("returns null when the bundle can't be read", () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("no such file");
    });

    expect(liveAppMajorVersion("Some Live")).toBeNull();
  });
});
