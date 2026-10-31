// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type Request } from "express";
import { describe, expect, it } from "vitest";
import {
  isLocalPeerRequest,
  rejectNonLocalTestSwitches,
} from "../../helpers/http/test-switch-guard.ts";
import { mockRes } from "./mock-express-response-test-helpers.ts";

/**
 * A minimal Express request with a peer address, headers and Host.
 * @param peer - The socket's remote address (undefined for none)
 * @param headers - Extra request headers, lower-case names
 * @param host - The Host header
 * @returns A Request-shaped stub
 */
function mockReq(
  peer: string | undefined,
  headers: Record<string, string> = {},
  host: string | undefined = "localhost:3350",
): Request {
  const all: Record<string, string> = host ? { host, ...headers } : headers;

  return {
    socket: { remoteAddress: peer },
    headers: all,
    get: (name: string) => all[name.toLowerCase()],
  } as unknown as Request;
}

describe("isLocalPeerRequest", () => {
  it.each([
    "127.0.0.1",
    "127.1.2.3",
    "::1",
    "::ffff:127.0.0.1",
    "::FFFF:127.0.0.5",
  ])("accepts loopback peer %s", (peer) => {
    expect(isLocalPeerRequest(mockReq(peer))).toBe(true);
  });

  it.each(["127.0.0.1:3350", "[::1]:3350", "localhost", "LocalHost:3350"])(
    "accepts Host %s",
    (host) => {
      expect(isLocalPeerRequest(mockReq("127.0.0.1", {}, host))).toBe(true);
    },
  );

  it.each([
    "192.168.1.20",
    "10.0.0.5",
    "::ffff:192.168.1.20",
    "fe80::1",
    "128.0.0.1",
    "1127.0.0.1",
    "::ffff:1127.0.0.1",
    "127.0.0.1.evil",
  ])("refuses non-loopback peer %s", (peer) => {
    expect(isLocalPeerRequest(mockReq(peer))).toBe(false);
  });

  it("refuses a request with no peer address", () => {
    expect(isLocalPeerRequest(mockReq(undefined))).toBe(false);
  });

  it.each([
    "x-forwarded-for",
    "x-forwarded-host",
    "forwarded",
    "via",
    "x-real-ip",
    "cf-connecting-ip",
  ])("refuses a loopback peer carrying %s (a local tunnel)", (header) => {
    expect(
      isLocalPeerRequest(mockReq("127.0.0.1", { [header]: "1.2.3.4" })),
    ).toBe(false);
  });

  it.each([
    "abc-123.trycloudflare.com",
    "example.ngrok.app",
    "192.168.1.5:3350",
    "evil.com@localhost",
    "localhost/x",
    "localhost:abc",
    "localhost.evil.com",
    "localhost:3350@evil.com",
  ])("refuses a loopback peer with Host %s", (host) => {
    expect(isLocalPeerRequest(mockReq("127.0.0.1", {}, host))).toBe(false);
  });

  it("refuses a loopback peer with no Host", () => {
    expect(isLocalPeerRequest(mockReq("127.0.0.1", {}, ""))).toBe(false);
  });
});

describe("rejectNonLocalTestSwitches", () => {
  it.each([
    { remoteScriptEnabled: false },
    { remoteScriptMinVersion: "9.0.0" },
    { remoteScriptMinVersion: null },
    { smallModelMode: true, remoteScriptEnabled: true },
  ])("403s %j from a LAN peer", (body) => {
    const { res, state } = mockRes();

    expect(rejectNonLocalTestSwitches(mockReq("192.168.1.20"), res, body)).toBe(
      true,
    );
    expect(state.status).toBe(403);
    expect(state.body).toStrictEqual({
      error: expect.stringContaining("can only be set from the machine"),
    });
  });

  it("lets a loopback peer set them", () => {
    const { res, state } = mockRes();

    expect(
      rejectNonLocalTestSwitches(mockReq("::1"), res, {
        remoteScriptEnabled: false,
      }),
    ).toBe(false);
    expect(state.status).toBeNull();
  });

  it("lets a LAN peer send a body without the switches", () => {
    const { res, state } = mockRes();

    expect(
      rejectNonLocalTestSwitches(mockReq("192.168.1.20"), res, {
        smallModelMode: true,
        remoteScriptEnabled: undefined,
      }),
    ).toBe(false);
    expect(state.status).toBeNull();
  });
});
