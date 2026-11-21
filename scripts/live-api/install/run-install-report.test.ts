// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runInstallReport } from "./run-install-report.ts";

let exitCode: typeof process.exitCode;

beforeEach(() => {
  exitCode = process.exitCode;
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  process.exitCode = exitCode;
  vi.restoreAllMocks();
});

describe("runInstallReport", () => {
  it("prints each line and exits 0 when the install worked", async () => {
    await runInstallReport(() => ({ lines: ["one", "two"], ok: true }));

    expect(console.log).toHaveBeenCalledWith("one");
    expect(console.log).toHaveBeenCalledWith("two");
    expect(process.exitCode).toBe(0);
  });

  it("exits 1 when the report says it failed", async () => {
    await runInstallReport(async () => ({ lines: ["nope"], ok: false }));

    expect(console.log).toHaveBeenCalledWith("nope");
    expect(process.exitCode).toBe(1);
  });

  it("prints the error and exits 1 when the install throws", async () => {
    await runInstallReport(() => {
      throw new Error("boom");
    });

    expect(console.error).toHaveBeenCalledWith("boom");
    expect(process.exitCode).toBe(1);
  });
});
