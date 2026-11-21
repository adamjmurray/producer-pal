// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { keepDisplayAwake } from "./keep-display-awake.ts";

function fakeSpawn() {
  const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
  const spawnProcess = vi.fn(() => child);

  return { child, spawnProcess: spawnProcess as unknown as typeof spawn };
}

describe("keepDisplayAwake", () => {
  it("holds a display-sleep assertion tied to this process on macOS", () => {
    const { child, spawnProcess } = fakeSpawn();

    keepDisplayAwake("darwin", spawnProcess);

    expect(spawnProcess).toHaveBeenCalledWith(
      "caffeinate",
      ["-d", "-i", "-w", String(process.pid)],
      { stdio: "ignore" },
    );
    expect(child.unref).toHaveBeenCalled();
  });

  it("does nothing on other platforms", () => {
    const { spawnProcess } = fakeSpawn();

    keepDisplayAwake("linux", spawnProcess);

    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it("survives caffeinate failing to start", () => {
    const { child, spawnProcess } = fakeSpawn();

    keepDisplayAwake("darwin", spawnProcess);

    expect(() => child.emit("error", new Error("ENOENT"))).not.toThrow();
  });
});
