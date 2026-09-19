// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  pingRemoteScript,
  remoteScriptRequest,
  replyError,
} from "../remote-script-client.ts";
import {
  type FakeAnswer,
  type FakeRemoteScript,
  startFakeRemoteScript,
} from "./remote-script-test-helpers.ts";

let fake: FakeRemoteScript | undefined;

afterEach(async () => {
  vi.useRealTimers();
  await fake?.close();
  fake = undefined;
});

/**
 * Start a stand-in remote script that gives every request the same answer.
 * @param answer - The answer
 * @returns The stand-in
 */
async function answerWith(answer: FakeAnswer): Promise<FakeRemoteScript> {
  fake = await startFakeRemoteScript(() => answer);

  return fake;
}

describe("remoteScriptRequest", () => {
  it("sends a GET with its query and hands back the answer", async () => {
    const remote = await answerWith({ body: { ok: true } });

    expect(
      await remoteScriptRequest({
        route: "/list",
        query: { type: "plugin", q: "pro q" },
      }),
    ).toStrictEqual({ available: true, status: 200, body: { ok: true } });
    expect(remote.requests).toStrictEqual([
      {
        method: "GET",
        route: "/list",
        query: { type: "plugin", q: "pro q" },
        body: undefined,
      },
    ]);
  });

  it("sends a POST body as JSON, and hands back an error status as an answer", async () => {
    const remote = await answerWith({ status: 400, body: { error: "bad" } });

    expect(
      await remoteScriptRequest({
        method: "POST",
        route: "/load",
        body: { type: "plugin", track_index: 2 },
      }),
    ).toStrictEqual({ available: true, status: 400, body: { error: "bad" } });
    expect(remote.requests[0]?.body).toStrictEqual({
      type: "plugin",
      track_index: 2,
    });
  });

  it("is unavailable when nothing takes the connection", async () => {
    expect(await remoteScriptRequest({ route: "/ping" })).toStrictEqual({
      available: false,
    });
  });

  it("is unavailable when whatever answers isn't sending a JSON object", async () => {
    await answerWith({ raw: "hello" });
    expect(await remoteScriptRequest({ route: "/ping" })).toStrictEqual({
      available: false,
    });

    await fake?.close();
    await answerWith({ raw: "[1]" });
    expect(await remoteScriptRequest({ route: "/ping" })).toStrictEqual({
      available: false,
    });
  });

  it("throws when the connection is taken but no answer comes", async () => {
    await answerWith(null);

    await expect(
      remoteScriptRequest({ route: "/list", timeoutMs: 50 }),
    ).rejects.toThrow("Live's browser did not answer within 0.05s");
  });

  it("is unavailable when the connection isn't taken in time", async () => {
    await answerWith({ body: { ok: true } });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    // Advancing before the event loop turns means the socket hasn't connected.
    const reply = remoteScriptRequest({ route: "/ping" });

    vi.advanceTimersByTime(1000);

    expect(await reply).toStrictEqual({ available: false });
  });

  it("throws when the connection is dropped after it was taken", async () => {
    await answerWith({ drop: true });

    await expect(
      remoteScriptRequest({ route: "/ping", timeoutMs: 5000 }),
    ).rejects.toThrow(/socket hang up|ECONNRESET/);
  });

  it("uses the default port when PPAL_REMOTE_SCRIPT_PORT isn't set", async () => {
    const remote = await answerWith({ body: { ok: true } });

    delete process.env.PPAL_REMOTE_SCRIPT_PORT;

    // Whatever is or isn't on the default port here, it isn't the stand-in,
    // which is listening on a port of its own. Either outcome is fine; what
    // matters is that the request didn't go to the port the env var named.
    await remoteScriptRequest({ route: "/ping", timeoutMs: 200 }).catch(
      () => null,
    );

    expect(remote.requests).toStrictEqual([]);
  });

  it("throws when the answer is cut off", async () => {
    await answerWith({ cut: '{"ok":' });

    await expect(
      remoteScriptRequest({ route: "/ping", timeoutMs: 5000 }),
    ).rejects.toThrow("aborted");
  });
});

describe("pingRemoteScript", () => {
  it("is true when the remote script answers ok", async () => {
    await answerWith({ body: { ok: true, live_version: "12.4.5" } });

    expect(await pingRemoteScript()).toBe(true);
  });

  it("is false for any other answer", async () => {
    await answerWith({ status: 500, body: { ok: false } });

    expect(await pingRemoteScript()).toBe(false);
  });

  it("is false when nothing is listening", async () => {
    expect(await pingRemoteScript()).toBe(false);
  });

  it("is false when the connection is taken but no answer comes", async () => {
    const remote = await answerWith(null);

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const ping = pingRemoteScript();

    await vi.waitFor(() => expect(remote.requests).toHaveLength(1));
    vi.advanceTimersByTime(1000);

    expect(await ping).toBe(false);
  });
});

describe("replyError", () => {
  it("uses the remote script's own error", () => {
    expect(
      replyError({ available: true, status: 404, body: { error: "no 'X'" } }),
    ).toBe("no 'X'");
  });

  it("falls back to the status", () => {
    expect(replyError({ available: true, status: 500, body: {} })).toBe(
      "Live's browser answered with status 500",
    );
  });
});
