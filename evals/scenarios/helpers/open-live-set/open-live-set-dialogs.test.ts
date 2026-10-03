// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The eval harness's own dialog watcher, so there is no e2e case: it runs
 * before anything e2e exercises exists. The osascript calls are faked.
 */
import { describe, expect, it } from "vitest";
import {
  LiveStuckError,
  NO_WINDOWS_LIMIT_MS,
  createDialogWatcher,
  startDialogWatcher,
  type OsascriptResult,
  type WatcherDeps,
} from "./open-live-set-dialogs.ts";

const ok = (output: string): OsascriptResult => ({ output, error: null });
const fail = (error: string): OsascriptResult => ({ output: null, error });

/**
 * A watcher fed a scripted list of osascript results (the last repeats), with
 * a clock the test advances by hand.
 */
function setup(results: OsascriptResult[]) {
  let clock = 0;
  let calls = 0;
  const deps: WatcherDeps = {
    run: async () => {
      const result = results[Math.min(calls, results.length - 1)];

      calls++;

      return await Promise.resolve(result as OsascriptResult);
    },
    now: () => clock,
    sleep: async () => await new Promise((resolve) => setImmediate(resolve)),
  };

  return {
    watcher: createDialogWatcher(deps),
    deps,
    advance: (ms: number) => {
      clock += ms;
    },
    calls: () => calls,
  };
}

describe("dialog watcher: Live with no windows", () => {
  it("is not stuck when a window shows up before the limit", async () => {
    const { watcher, advance } = setup([ok("windows 0\n"), ok("windows 1\n")]);

    await watcher.tick();
    advance(NO_WINDOWS_LIMIT_MS - 1000);
    expect(() => watcher.assertNotStuck()).not.toThrow();

    await watcher.tick();
    advance(NO_WINDOWS_LIMIT_MS);
    expect(() => watcher.assertNotStuck()).not.toThrow();
  });

  it("clears the dialog that appears after a spell with no windows", async () => {
    const { watcher, advance } = setup([
      ok("windows 0\n"),
      ok("windows 0\n"),
      ok("windows 1\nclicked recovery\n"),
      ok("windows 1\n"),
    ]);

    await watcher.tick();
    advance(10_000);
    await watcher.tick();
    advance(10_000);
    await watcher.tick();
    await watcher.tick();

    expect(() => watcher.assertNotStuck()).not.toThrow();
  });

  it("throws a clear, non-retriable error when windows never show", async () => {
    const { watcher, advance } = setup([ok("windows 0\n")]);

    await watcher.tick();
    advance(NO_WINDOWS_LIMIT_MS);
    await watcher.tick();

    expect(() => watcher.assertNotStuck()).toThrow(LiveStuckError);
    expect(() => watcher.assertNotStuck()).toThrow(/stuck on a dialog/);
  });

  it("does not count Live not running yet as stuck", async () => {
    const { watcher, advance } = setup([ok("no-process")]);

    await watcher.tick();
    advance(NO_WINDOWS_LIMIT_MS * 2);
    await watcher.tick();

    expect(() => watcher.assertNotStuck()).not.toThrow();
  });

  it("does not count windows at 0 while a dialog is being clicked", async () => {
    const { watcher, advance } = setup([ok("windows 0\nclicked recovery\n")]);

    await watcher.tick();
    advance(NO_WINDOWS_LIMIT_MS * 2);
    await watcher.tick();

    expect(() => watcher.assertNotStuck()).not.toThrow();
  });

  it("only reports stuck from assertNotStuck, not assertClean", async () => {
    const { watcher, advance } = setup([ok("windows 0\n")]);

    await watcher.tick();
    advance(NO_WINDOWS_LIMIT_MS);
    await watcher.tick();

    expect(() => watcher.assertClean()).not.toThrow();
  });
});

describe("dialog watcher: dismissing fails", () => {
  it("throws once a click keeps failing", async () => {
    const { watcher } = setup([ok("windows 1\nfailed no button\n")]);

    for (let i = 0; i < 2; i++) {
      await watcher.tick();
    }

    expect(() => watcher.assertClean()).not.toThrow();

    await watcher.tick();

    expect(() => watcher.assertClean()).toThrow(/Could not clear a dialog/);
    expect(() => watcher.assertNotStuck()).toThrow(/no button/);
  });

  it("throws when osascript itself keeps failing or times out", async () => {
    const { watcher } = setup([fail("timed out")]);

    for (let i = 0; i < 3; i++) {
      await watcher.tick();
    }

    expect(() => watcher.assertClean()).toThrow(/osascript failed: timed out/);
  });

  it("recovers when a later tick succeeds", async () => {
    const { watcher } = setup([
      fail("timed out"),
      fail("timed out"),
      fail("timed out"),
      ok("windows 1\n"),
    ]);

    for (let i = 0; i < 4; i++) {
      await watcher.tick();
    }

    expect(() => watcher.assertClean()).not.toThrow();
  });
});

describe("startDialogWatcher", () => {
  it("polls until stopped, then stops polling", async () => {
    const { deps, calls } = setup([ok("windows 1\n")]);
    const watcher = startDialogWatcher(deps);

    await new Promise((resolve) => setTimeout(resolve, 20));
    await watcher.stop();

    const callsAtStop = calls();

    expect(callsAtStop).toBeGreaterThan(1);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls()).toBe(callsAtStop);
  });
});
