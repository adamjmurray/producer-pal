// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type Request } from "express";
import { describe, expect, it } from "vitest";
import { isFromThisComputer } from "../../../helpers/http/browser/from-this-computer.ts";

/**
 * A request as the server sees it.
 *
 * @param remoteAddress - The socket's peer address
 * @param headers - Request headers, lowercase
 * @returns A fake request
 */
function fakeRequest(
  remoteAddress: string | undefined,
  headers: Record<string, string> = {},
): Request {
  const all: Record<string, string> = { host: "localhost:3350", ...headers };

  return {
    socket: { remoteAddress },
    headers: all,
    get: (name: string) => all[name.toLowerCase()],
  } as unknown as Request;
}

describe("isFromThisComputer", () => {
  it.each([
    "127.0.0.1",
    "127.5.6.7",
    "::1",
    "::ffff:127.0.0.1",
    "::FFFF:127.0.0.1",
  ])("accepts a connection from %s", (address) => {
    expect(isFromThisComputer(fakeRequest(address))).toBe(true);
  });

  it.each([
    ["a network address", "192.168.1.20"],
    ["a mapped network address", "::ffff:192.168.1.20"],
    ["a public address", "203.0.113.9"],
    ["an IPv6 network address", "fd00::5"],
    ["a lookalike", "127.0.0.1.evil"],
    ["no address", undefined],
  ])("refuses %s", (_name, address) => {
    expect(isFromThisComputer(fakeRequest(address))).toBe(false);
  });

  it("ignores X-Forwarded-For when judging the address", () => {
    expect(
      isFromThisComputer(
        fakeRequest("192.168.1.20", { "x-forwarded-for": "127.0.0.1" }),
      ),
    ).toBe(false);
  });

  it("refuses a loopback connection that names another host", () => {
    expect(
      isFromThisComputer(
        fakeRequest("127.0.0.1", { host: "demo.trycloudflare.com" }),
      ),
    ).toBe(false);
  });

  it("accepts its own origin and refuses any other", () => {
    const own = { origin: "http://localhost:3350" };

    expect(isFromThisComputer(fakeRequest("::1", own))).toBe(true);
    expect(
      isFromThisComputer(
        fakeRequest("::1", { origin: "http://localhost:3351" }),
      ),
    ).toBe(false);
    expect(isFromThisComputer(fakeRequest("::1", { origin: "null" }))).toBe(
      false,
    );
  });

  it.each([
    ["same-origin", true],
    ["none", true],
    ["same-site", false],
    ["cross-site", false],
  ])("treats Sec-Fetch-Site %s as %s", (site, accepted) => {
    expect(
      isFromThisComputer(fakeRequest("::1", { "sec-fetch-site": site })),
    ).toBe(accepted);
  });
});
