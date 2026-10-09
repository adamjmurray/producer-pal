// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { type RemoteScriptReply } from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";
import { RemoteScriptConnectionLost } from "#src/mcp-server/rpc/remote-script/remote-script-errors.ts";
import { VERSION } from "#src/shared/config.ts";
import {
  failure,
  requestAnswers,
  responseText,
  SENT_TIMEOUT,
  UNSENT_TIMEOUT,
} from "../../offline/tests/offline-add-producer-pal-test-helpers.ts";
import {
  DOWN,
  fakeDevice,
  OLD,
  SWAPPED,
  updateCall,
  updateDeps,
} from "./update-test-helpers.ts";

const CHECK = `Wait a few seconds, then call ppal-connect to see which version is running (it was ${OLD}). If it is still ${OLD}, call update-producer-pal again.`;

/**
 * Run an update whose swap request gets these answers, against an old device.
 * @param answers - What the remote script does with successive swap requests
 * @returns The text, whether it was an error, and what was asked
 */
async function swapAnswering(
  ...answers: Array<RemoteScriptReply | Error>
): Promise<{ text: string; isError: boolean; requests: number }> {
  const deps = updateDeps({ request: requestAnswers(...answers) });
  const device = fakeDevice(OLD);
  const response = await updateCall(device, deps);

  expect(device.toolsChanged).not.toHaveBeenCalled();

  return {
    text: responseText(response),
    isError: response.isError === true,
    requests: vi.mocked(deps.request).mock.calls.length,
  };
}

describe("update-producer-pal when the swap is refused", () => {
  it("says an outdated remote script, and one that lacks the route, changed nothing", async () => {
    const { text, isError } = await swapAnswering({
      available: false,
      outdated: "the Producer Pal remote script is out of date (running 2.5.0)",
    });

    expect(isError).toBe(true);
    expect(text).toBe(
      "Error: the Producer Pal remote script is out of date (running 2.5.0). Nothing was changed.",
    );
  });

  it("says a remote script that stopped answering changed nothing", async () => {
    const { text } = await swapAnswering({ available: false });

    expect(text).toBe(
      "Error: the remote script stopped answering. Nothing was changed.",
    );
  });

  it.each([
    [409, "Producer Pal isn't in this Live Set"],
    [409, "Producer Pal is in this Live Set 2 times (t0, t1)"],
    [400, "type 'file' needs the file's absolute path"],
  ])(
    "says a %i from the remote script changed nothing",
    async (status, why) => {
      const { text, isError, requests } = await swapAnswering(
        failure(status, why),
      );

      expect(isError).toBe(true);
      expect(text).toBe(
        `Error: Live couldn't replace Producer Pal: ${why}. Nothing was changed.`,
      );
      expect(requests).toBe(1);
    },
  );

  it("says an expired request never ran", async () => {
    const { text } = await swapAnswering(
      failure(504, "the request expired before Live ran it"),
    );

    expect(text).toBe(
      "Error: Live couldn't replace Producer Pal: the request expired before Live ran it. Nothing was changed.",
    );
  });

  it("asks again while Live's browser hasn't seen the file", async () => {
    const deps = updateDeps({
      request: requestAnswers(failure(404, "no device found"), SWAPPED),
    });
    const response = await updateCall(fakeDevice(OLD, VERSION), deps);

    expect(response.isError).toBeUndefined();
    expect(deps.request).toHaveBeenCalledTimes(2);
  });

  it("gives up on a file the browser never finds, and says nothing changed", async () => {
    const { text, isError } = await swapAnswering(
      failure(404, "no device found"),
    );

    expect(isError).toBe(true);
    expect(text).toBe(
      "Error: Live's browser hasn't found the device file yet (no device found). Nothing was changed. Call update-producer-pal again in a moment.",
    );
  });
});

describe("update-producer-pal when the swap may have happened", () => {
  it.each([
    ["no answer", SENT_TIMEOUT, "Live's browser did not answer within 20s"],
    [
      "a lost connection",
      new RemoteScriptConnectionLost(new Error("reset")),
      "the connection to the Producer Pal remote script was lost before it answered",
    ],
  ])("says %s may have replaced the device", async (_why, error, detail) => {
    const { text, isError } = await swapAnswering(error);

    expect(isError).toBe(true);
    expect(text).toBe(
      `Error: Live didn't answer the request to replace Producer Pal (${detail}), so it may have been replaced. ${CHECK}`,
    );
  });

  it.each([
    [500, "RuntimeError: boom", undefined],
    [504, "Live started the request but didn't finish it within 30s", true],
  ])(
    "says a %i after Live may have started may have replaced it",
    async (status, why, started) => {
      const { text } = await swapAnswering({
        available: true,
        status,
        body: { error: why, ...(started ? { started } : {}) },
      });

      expect(text).toBe(
        `Error: Live reported a problem while replacing Producer Pal (${why}), so it may have been replaced. ${CHECK}`,
      );
    },
  );

  it("says a request that never left changed nothing", async () => {
    const { text } = await swapAnswering(UNSENT_TIMEOUT);

    expect(text).toBe(
      "Error: ran out of time before the request reached Live, so nothing was changed. Call update-producer-pal again.",
    );
  });
});

describe("update-producer-pal when the new device doesn't answer", () => {
  it("says Live replaced the device and to wait, when nothing answers", async () => {
    const device = fakeDevice(OLD, DOWN);
    const response = await updateCall(device);

    expect(response.isError).toBe(true);
    expect(responseText(response)).toBe(
      "Error: Live replaced the Producer Pal device on t3 \"3-MIDI\", but the new one hasn't answered yet. Wait a few seconds, then call ppal-connect. Don't call update-producer-pal again.",
    );
    expect(device.toolsChanged).not.toHaveBeenCalled();
    // Left for the next call to connect afresh.
    expect(device.reset.mock.calls.length).toBeGreaterThan(1);
  });

  it("says so when the old version keeps answering", async () => {
    const response = await updateCall(fakeDevice(OLD));

    expect(responseText(response)).toBe(
      `Error: Live replaced the Producer Pal device on t3 "3-MIDI", but the old version (${OLD}) is still answering. Ask the user to check the Producer Pal device in Live, then call ppal-connect.`,
    );
  });

  it("leaves the track out when the remote script didn't name one", async () => {
    const deps = updateDeps({
      request: requestAnswers({ available: true, status: 200, body: {} }),
    });
    const response = await updateCall(fakeDevice(OLD, DOWN), deps);

    expect(responseText(response)).toContain(
      "Error: Live replaced the Producer Pal device, but the new one",
    );
  });
});
