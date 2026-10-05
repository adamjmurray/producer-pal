// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { execFile } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadFailure,
  runDialogScript,
} from "../../../examples/skills/ableton-open-live-set/open-live-set.mjs";

vi.mock(import("node:child_process"), () => ({
  execFile: vi.fn() as unknown as typeof execFile,
}));

describe("open-live-set loadFailure", () => {
  it("lists the candidates when the browser has more than one device", () => {
    const message = loadFailure(409, {
      error: "'Producer_Pal' matches 2 items - pass one as path",
      candidates: ["User Library/A.amxd", "User Library/B.amxd"],
    });

    expect(message).toContain("more than one Producer_Pal device");
    expect(message).toContain("User Library/A.amxd, User Library/B.amxd");
  });

  it("passes on the error when the Set already has Producer Pal", () => {
    const error =
      "Producer Pal is already in this Live Set, on track 0 'Bass' - a Set can only have one";

    const message = loadFailure(409, { error });

    expect(message.startsWith(`${error}. It didn't answer on port `)).toBe(
      true,
    );
    expect(message).toContain("check that device, or set PPAL_PORT");
  });
});

describe("open-live-set runDialogScript", () => {
  const discard = { unsaved: false, recovery: false };
  const denied =
    "System Events got an error: osascript is not allowed assistive access. (-25211)";
  const execFileMock = vi.mocked(execFile);

  /**
   * Answer each osascript call in turn (the last repeats); killall succeeds.
   * @param osascriptErrors - The error each osascript call fails with, or null
   */
  function fakeCalls(osascriptErrors: (string | null)[]): void {
    let calls = 0;

    execFileMock.mockImplementation(((
      command: string,
      _args: string[],
      callback: (err: Error | null, stdout: string, stderr: string) => void,
    ) => {
      if (command !== "osascript") {
        callback(null, "", "");

        return;
      }

      const error =
        osascriptErrors[Math.min(calls++, osascriptErrors.length - 1)];

      callback(error == null ? null : new Error(error), "", error ?? "");
    }) as unknown as typeof execFile);
  }

  const commands = (): unknown[] => execFileMock.mock.calls.map((c) => c[0]);

  beforeEach(() => {
    execFileMock.mockReset();
  });

  it("restarts System Events and retries once when access is refused", async () => {
    fakeCalls([denied, null]);

    await expect(runDialogScript(discard)).resolves.toBeNull();
    expect(commands()).toStrictEqual(["osascript", "killall", "osascript"]);
  });

  it("names the permission when the retry is refused too", async () => {
    fakeCalls([denied]);

    await expect(runDialogScript(discard)).rejects.toThrow(
      /refused System Events access to Live.*Privacy & Security/,
    );
  });

  it("does not restart System Events for other failures", async () => {
    fakeCalls(["timed out"]);

    await expect(runDialogScript(discard)).resolves.toBeNull();
    expect(commands()).toStrictEqual(["osascript"]);
  });
});
