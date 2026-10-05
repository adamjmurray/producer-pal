// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RemoteScriptTimeout,
  pingRemoteScript,
  remoteScriptPing,
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

  it("is unavailable, but says something answered, when it isn't sending a JSON object", async () => {
    await answerWith({ raw: "hello" });
    expect(await remoteScriptRequest({ route: "/ping" })).toStrictEqual({
      available: false,
      otherAnswered: true,
    });

    await fake?.close();
    await answerWith({ raw: "[1]" });
    expect(await remoteScriptRequest({ route: "/ping" })).toStrictEqual({
      available: false,
      otherAnswered: true,
    });
  });

  it("throws when the connection is taken but no answer comes", async () => {
    await answerWith(null);

    await expect(
      remoteScriptRequest({ route: "/list", timeoutMs: 50 }),
    ).rejects.toThrow("Live's browser did not answer within 0.05s");
  });

  it("marks a timeout as sent, since Live may have acted on it", async () => {
    await answerWith(null);

    const error = await remoteScriptRequest({
      route: "/list",
      timeoutMs: 50,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RemoteScriptTimeout);
    expect(error).toHaveProperty("sent", true);
  });

  describe("with an expiry", () => {
    it("sends it as expires_in_ms: in the query of a GET, in the body of a POST", async () => {
      const remote = await answerWith({ body: { ok: true } });

      await remoteScriptRequest({ route: "/list", expiresInMs: 8000.7 });
      await remoteScriptRequest({
        method: "POST",
        route: "/load",
        body: { type: "plugin" },
        expiresInMs: 8000,
      });

      expect(remote.requests).toStrictEqual([
        {
          method: "GET",
          route: "/list",
          query: { expires_in_ms: "8000" },
          body: undefined,
        },
        {
          method: "POST",
          route: "/load",
          query: {},
          body: { type: "plugin", expires_in_ms: 8000 },
        },
      ]);
    });

    it("waits a moment past the expiry for the reply, not the fixed 35s", async () => {
      await answerWith(null);

      const started = Date.now();

      await expect(
        remoteScriptRequest({ route: "/list", expiresInMs: 100 }),
      ).rejects.toThrow("Live's browser did not answer within 0.15s");
      expect(Date.now() - started).toBeLessThan(2000);
    });

    it.each([0, -5])("sends nothing at %s", async (expiresInMs) => {
      const remote = await answerWith({ body: { ok: true } });
      const error = await remoteScriptRequest({
        route: "/list",
        expiresInMs,
      }).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(RemoteScriptTimeout);
      expect(error).toHaveProperty("sent", false);
      expect(remote.requests).toStrictEqual([]);
    });
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

  it("throws when the answer is cut off", async () => {
    await answerWith({ cut: '{"ok":' });

    await expect(
      remoteScriptRequest({ route: "/ping", timeoutMs: 5000 }),
    ).rejects.toThrow("aborted");
  });

  it("reads a reply with no status code as status 0", async () => {
    await answerWith({ body: { ok: true } });
    const realRequest = http.request;

    vi.spyOn(http, "request").mockImplementation(((
      options: http.RequestOptions,
      callback: (response: http.IncomingMessage) => void,
    ) =>
      realRequest(options, (response) => {
        response.statusCode = undefined;
        callback(response);
      })) as typeof http.request);

    expect(await remoteScriptRequest({ route: "/ping" })).toStrictEqual({
      available: true,
      status: 0,
      body: { ok: true },
    });
  });
});

describe("pingRemoteScript", () => {
  it("is true when the remote script answers ok", async () => {
    await answerWith({
      body: { ok: true, live_version: "12.4.5", script_version: "2.4.1" },
    });

    expect(await pingRemoteScript()).toBe(true);
  });

  it("is false for a reply without script_version: that isn't our script", async () => {
    await answerWith({ body: { ok: true, live_version: "12.4.5" } });

    expect(await pingRemoteScript()).toBe(false);
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

describe("remoteScriptPing", () => {
  it("reports the versions of our script", async () => {
    await answerWith({
      body: { ok: true, live_version: "12.4.5", script_version: "2.4.1" },
    });

    expect(await remoteScriptPing()).toStrictEqual({
      running: true,
      liveVersion: "12.4.5",
      scriptVersion: "2.4.1",
      otherOnPort: null,
    });
  });

  it("names the port when something else answers there", async () => {
    const remote = await answerWith({ body: { ok: true } });

    const ping = await remoteScriptPing();

    expect(ping.running).toBe(false);
    expect(ping.otherOnPort).toBe(remote.port);
  });

  it("names no port when nothing answers", async () => {
    const ping = await remoteScriptPing();

    expect(ping.otherOnPort).toBeNull();
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
