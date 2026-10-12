// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VERSION } from "#src/shared/config.ts";
import { UserLibraryFolderError } from "../../remote-script/user-library/user-library-folder.ts";
import {
  CONNECTION_LOST,
  RemoteScriptConnectionLost,
  RemoteScriptTimeout,
} from "../../remote-script/remote-script-errors.ts";
import {
  remoteScriptPing,
  type RemoteScriptReply,
  type RemoteScriptRequest,
  remoteScriptRequest,
} from "../../remote-script/remote-script-client.ts";
import { swapForLibraryCopy, type SwapDeps } from "../device-swap.ts";
import {
  frozenDevice,
  RUNNING_PING,
  useDeviceScratch,
} from "./device-install-test-helpers.ts";

const { findUserLibraryPath } = vi.hoisted(() => ({
  findUserLibraryPath: vi.fn<() => Promise<string | null>>(),
}));

vi.mock(import("../../../live-library/query/user-library-path.ts"), () => ({
  findUserLibraryPath,
}));

// The real ones would talk to a Live running on the developer's machine.
vi.mock(
  import("../../remote-script/remote-script-client.ts"),
  async (importOriginal) => ({
    ...(await importOriginal()),
    remoteScriptPing: vi.fn(),
    remoteScriptRequest: vi.fn(),
  }),
);

/**
 * @param status - HTTP status
 * @param body - JSON body
 * @returns An answer from the remote script
 */
function answer(
  status: number,
  body: Record<string, unknown> = {},
): RemoteScriptReply {
  return { available: true, status, body };
}

describe("swapForLibraryCopy", () => {
  const scratch = useDeviceScratch();
  const request =
    vi.fn<(r: RemoteScriptRequest) => Promise<RemoteScriptReply>>();
  let clock = 0;
  const deps: SwapDeps = {
    ping: async () => RUNNING_PING,
    request,
    now: () => clock,
    // Time only passes when something sleeps.
    sleep: async (ms) => {
      clock += ms;
    },
  };

  beforeEach(() => {
    clock = 0;
    request.mockReset();
    findUserLibraryPath.mockReset();

    const { runFromDownloads, installed, put } = scratch();

    runFromDownloads(frozenDevice(VERSION));
    put(installed, frozenDevice(VERSION, "library copy"));
  });

  it("asks the remote script to replace the device with the library copy", async () => {
    request.mockResolvedValue(
      answer(200, { track: { path: "t2", name: "Pal" }, device: {} }),
    );

    expect(await swapForLibraryCopy(scratch().library, deps)).toStrictEqual({
      status: "swapping",
      track: { path: "t2", name: "Pal" },
    });
    expect(request).toHaveBeenCalledExactlyOnceWith({
      method: "POST",
      route: "/replace-producer-pal",
      body: { path: scratch().installed },
      expiresInMs: 20_000,
    });
  });

  it("reports a swap that names no track", async () => {
    request.mockResolvedValue(answer(200));

    expect(await swapForLibraryCopy(scratch().library, deps)).toStrictEqual({
      status: "swapping",
    });
  });

  it("throws for a User Library that isn't a folder, before asking anything", async () => {
    await expect(
      swapForLibraryCopy(join(scratch().library, "nope"), deps),
    ).rejects.toBeInstanceOf(UserLibraryFolderError);
    expect(request).not.toHaveBeenCalled();
  });

  it("refuses without asking when the swap isn't allowed", async () => {
    const { installed } = scratch();

    scratch().put(installed, frozenDevice("0.0.1"));

    expect(await swapForLibraryCopy(scratch().library, deps)).toStrictEqual({
      status: "refused",
      error: expect.stringContaining("older than this device"),
    });
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    { status: 409, text: "Producer Pal isn't in this Live Set" },
    { status: 400, text: "type 'file' needs the file's absolute path" },
  ])(
    "refuses, saying the Set is unchanged, when Live answers $status",
    async ({ status, text }) => {
      request.mockResolvedValue(answer(status, { error: text }));

      expect(await swapForLibraryCopy(scratch().library, deps)).toStrictEqual({
        status: "refused",
        error: `Live couldn't swap the device: ${text}. The Live Set was not changed.`,
      });
    },
  );

  it("asks again while Live's browser hasn't found the file, then gives up", async () => {
    request.mockResolvedValue(answer(404, { error: "not found" }));

    expect(await swapForLibraryCopy(scratch().library, deps)).toStrictEqual({
      status: "refused",
      error: expect.stringContaining("hasn't found the User Library copy yet"),
    });
    expect(request.mock.calls.length).toBeGreaterThan(2);
  });

  it("goes ahead once the browser finds the file", async () => {
    request
      .mockResolvedValueOnce(answer(404, { error: "not found" }))
      .mockResolvedValueOnce(answer(200));

    expect(await swapForLibraryCopy(scratch().library, deps)).toStrictEqual({
      status: "swapping",
    });
  });

  it.each([
    answer(500, { error: "boom" }),
    answer(504, { error: "timed out", started: true }),
  ])("calls it unconfirmed when Live answers %j", async (reply) => {
    request.mockResolvedValue(reply);

    expect(await swapForLibraryCopy(scratch().library, deps)).toStrictEqual({
      status: "unconfirmed",
      error: expect.stringContaining("so it may have been swapped"),
    });
  });

  it("refuses when Live's job never started", async () => {
    request.mockResolvedValue(answer(504, { error: "queue expired" }));

    expect(await swapForLibraryCopy(scratch().library, deps)).toStrictEqual({
      status: "refused",
      error: expect.stringContaining("The Live Set was not changed."),
    });
  });

  it("calls it unconfirmed when the connection drops mid-swap, as it does when this server dies with the old device", async () => {
    request.mockRejectedValue(new RemoteScriptConnectionLost(new Error("x")));

    expect(await swapForLibraryCopy(scratch().library, deps)).toStrictEqual({
      status: "unconfirmed",
      error: expect.stringContaining(CONNECTION_LOST),
    });
  });

  it("calls it unconfirmed when the request went out and no answer came", async () => {
    request.mockRejectedValue(new RemoteScriptTimeout("no answer", true));

    expect(await swapForLibraryCopy(scratch().library, deps)).toStrictEqual({
      status: "unconfirmed",
      error: expect.stringContaining("no answer"),
    });
  });

  it("fails, leaving the Set alone, when the request never left", async () => {
    request.mockRejectedValue(new RemoteScriptTimeout("out of time", false));

    expect(await swapForLibraryCopy(scratch().library, deps)).toStrictEqual({
      status: "failed",
      error: expect.stringContaining("Live Set was not changed"),
    });
  });

  it("fails when the remote script stops answering", async () => {
    request.mockResolvedValue({ available: false });

    expect(await swapForLibraryCopy(scratch().library, deps)).toStrictEqual({
      status: "failed",
      error:
        "The remote script stopped answering, so the Live Set was not changed.",
    });
  });

  it("fails with the remote script's own reason when it is out of date", async () => {
    request.mockResolvedValue({ available: false, outdated: "it is too old" });

    expect(await swapForLibraryCopy(scratch().library, deps)).toStrictEqual({
      status: "failed",
      error: "it is too old, so the Live Set was not changed.",
    });
  });

  it("uses the real remote script client and clock unless given others", async () => {
    vi.useFakeTimers();

    try {
      findUserLibraryPath.mockResolvedValue(scratch().library);
      vi.mocked(remoteScriptPing).mockResolvedValue(RUNNING_PING);
      vi.mocked(remoteScriptRequest)
        .mockResolvedValueOnce(answer(404, { error: "not found" }))
        .mockResolvedValueOnce(answer(200));

      const swap = swapForLibraryCopy(scratch().library);

      await vi.advanceTimersByTimeAsync(1000);

      expect(await swap).toStrictEqual({ status: "swapping" });
    } finally {
      vi.useRealTimers();
    }
  });
});
