// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import {
  connectResponse,
  fakeInnerCall,
} from "#src/mcp-server/tests/config-dir-test-helpers.ts";
import { currentRemoteScriptStatus } from "#src/mcp-server/rpc/remote-script/tests/remote-script-test-helpers.ts";
import { type RemoteScriptStatus } from "#src/mcp-server/rpc/remote-script/remote-script-status.ts";
import { VERSION } from "#src/shared/config.ts";
import { UP_TO_DATE_NEW_CHAT } from "#src/shared/version-check.ts";
import { withUpToDate } from "../up-to-date-inject.ts";

/**
 * Run withUpToDate over a ppal-connect call.
 * @param status - The remote script status, or a read that fails
 * @param portalVersion - The portal version the request carries, if any
 * @returns The response content blocks' text
 */
async function connectThrough(
  status: Partial<RemoteScriptStatus> | Error = {},
  portalVersion?: string,
): Promise<string[]> {
  const getStatus = (): Promise<RemoteScriptStatus> =>
    status instanceof Error
      ? Promise.reject(status)
      : Promise.resolve(currentRemoteScriptStatus(status));

  const result = await withUpToDate(
    fakeInnerCall(connectResponse()),
    getStatus,
    () => portalVersion,
  )("ppal-connect", {});

  return result.content.map((block) => block.text);
}

describe("withUpToDate", () => {
  it("suggests a new chat when the script is current and there is no portal", async () => {
    expect(await connectThrough()).toStrictEqual([
      expect.any(String),
      UP_TO_DATE_NEW_CHAT,
    ]);
  });

  it("suggests a new chat when the portal matches the device", async () => {
    expect(await connectThrough({}, VERSION)).toContain(UP_TO_DATE_NEW_CHAT);
  });

  it.each([
    ["older than the device", "1.0.0"],
    ["newer than the device", "99.0.0"],
  ])("says nothing when the portal is %s", async (_why, portalVersion) => {
    expect(await connectThrough({}, portalVersion)).toHaveLength(1);
  });

  it.each([
    [
      "not installed",
      { installed: false, installedVersion: null, running: false },
    ],
    ["not running", { running: false, runningVersion: null }],
    [
      "installed behind the device",
      { installedVersion: "0.0.1", updateAvailable: true },
    ],
    [
      "running another copy than the installed one",
      { runningVersion: "0.0.1" },
    ],
    ["another program on the port", { running: false, otherOnPort: 3350 }],
  ])("says nothing when the script is %s", async (_why, status) => {
    expect(await connectThrough(status)).toHaveLength(1);
  });

  it("says nothing when the installed script is newer than the device", async () => {
    const content = await connectThrough({
      installedVersion: "999.0.0",
      runningVersion: "999.0.0",
      installedNewer: true,
    });

    expect(content).toHaveLength(1);
  });

  it("says nothing when the script runs but its copy wasn't found and it isn't this version", async () => {
    const content = await connectThrough({
      installed: false,
      installedVersion: null,
      runningVersion: "0.0.1",
    });

    expect(content).toHaveLength(1);
  });

  it("accepts a running script whose copy wasn't found when it is this version", async () => {
    const content = await connectThrough({
      installed: false,
      installedVersion: null,
      runningVersion: VERSION,
    });

    expect(content).toContain(UP_TO_DATE_NEW_CHAT);
  });

  it("says nothing when the status can't be read", async () => {
    expect(await connectThrough(new Error("db locked"))).toHaveLength(1);
  });

  it("leaves other tools alone", async () => {
    const getStatus = vi.fn<() => Promise<RemoteScriptStatus>>();
    const result = await withUpToDate(
      fakeInnerCall(connectResponse()),
      getStatus,
      () => undefined,
    )("ppal-read-live-set", {});

    expect(result.content).toHaveLength(1);
    expect(getStatus).not.toHaveBeenCalled();
  });
});
