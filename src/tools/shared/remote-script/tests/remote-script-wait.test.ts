// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import { REMOTE_SCRIPT_REQUEST_TIMEOUT_MS } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import {
  remoteScriptExpiry,
  remoteScriptReplyWait,
  remoteScriptWait,
} from "../remote-script-wait.ts";

afterEach(() => {
  vi.useRealTimers();
});

describe("remoteScriptWait", () => {
  it("waits its usual time with no deadline", () => {
    expect(remoteScriptWait(null)).toBe(REMOTE_SCRIPT_REQUEST_TIMEOUT_MS);
  });

  it("is cut to the time left, less what's reserved", () => {
    vi.useFakeTimers({ now: 1_000_000, toFake: ["Date"] });

    expect(remoteScriptWait(1_010_000)).toBe(10_000);
    expect(remoteScriptWait(1_010_000, 2000)).toBe(8000);
  });

  it("has nothing to wait when no time is left", () => {
    vi.useFakeTimers({ now: 1_000_000, toFake: ["Date"] });

    expect(remoteScriptWait(1_002_000, 2000)).toBeNull();
  });
});

describe("remoteScriptReplyWait", () => {
  it("is a moment past the expiry, at most a second", () => {
    expect(remoteScriptReplyWait(8000)).toBe(9000);
    expect(remoteScriptReplyWait(1000)).toBe(1500);
  });

  // Node must answer before V8 stops waiting, or V8 reports a generic timeout.
  it.each([1, 100, 1000, 3999, 4000, 10_000, REMOTE_SCRIPT_REQUEST_TIMEOUT_MS])(
    "ends before V8's wait of %s ms",
    (waitMs) => {
      expect(remoteScriptReplyWait(remoteScriptExpiry(waitMs))).toBeLessThan(
        waitMs,
      );
    },
  );
});
