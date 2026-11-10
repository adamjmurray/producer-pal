// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type Request } from "express";
import { describe, expect, it } from "vitest";
import {
  isLocalOrigin,
  isSameOriginRequest,
  rejectCrossOriginWrite,
  rejectForeignOriginWrite,
  rejectRebindableOriginWrite,
} from "../../helpers/http/browser/request-origin.ts";
import { mockRes } from "./mock-express-response-test-helpers.ts";

/**
 * A minimal Express request exposing only the `Origin`/`Host` headers the
 * origin helpers read (case-insensitively, as Express does).
 * @param headers - The header values to expose
 * @param headers.origin - The `Origin` header value (omit for none)
 * @param headers.host - The `Host` header value (omit for none)
 * @returns A Request-shaped stub
 */
function mockReq(headers: { origin?: string; host?: string }): Request {
  return {
    get(name: string): string | undefined {
      const key = name.toLowerCase();

      if (key === "origin") {
        return headers.origin;
      }

      if (key === "host") {
        return headers.host;
      }

      return undefined;
    },
  } as unknown as Request;
}

describe("isLocalOrigin", () => {
  it("returns true for localhost origins", () => {
    expect(isLocalOrigin("http://localhost")).toBe(true);
    expect(isLocalOrigin("http://localhost:7777")).toBe(true);
    expect(isLocalOrigin("https://localhost:8080")).toBe(true);
  });

  it("returns true for 127.0.0.1 origins", () => {
    expect(isLocalOrigin("http://127.0.0.1")).toBe(true);
    expect(isLocalOrigin("http://127.0.0.1:7777")).toBe(true);
  });

  it("returns true for [::1] origins", () => {
    expect(isLocalOrigin("http://[::1]:7777")).toBe(true);
  });

  it("returns false for non-local origins", () => {
    expect(isLocalOrigin("https://example.com")).toBe(false);
    expect(isLocalOrigin("http://192.168.1.5:7777")).toBe(false);
  });

  it("returns false for unparseable origin strings", () => {
    expect(isLocalOrigin("not a url")).toBe(false);
    expect(isLocalOrigin("")).toBe(false);
  });
});

describe("isSameOriginRequest", () => {
  it("matches by host (hostname + port), ignoring scheme", () => {
    // A TLS-terminating tunnel: public https origin, forwarded Host header.
    expect(
      isSameOriginRequest(
        "https://demo.trycloudflare.com",
        mockReq({ host: "demo.trycloudflare.com" }),
      ),
    ).toBe(true);
    expect(
      isSameOriginRequest(
        "http://192.168.1.5:3350",
        mockReq({ host: "192.168.1.5:3350" }),
      ),
    ).toBe(true);
  });

  it("returns false when the origin host differs from the request host", () => {
    expect(
      isSameOriginRequest(
        "https://evil.example.com",
        mockReq({ host: "demo.trycloudflare.com" }),
      ),
    ).toBe(false);
    // Same host, different port is a different origin.
    expect(
      isSameOriginRequest(
        "http://192.168.1.5:9999",
        mockReq({ host: "192.168.1.5:3350" }),
      ),
    ).toBe(false);
  });

  it("returns false for an unparseable origin", () => {
    expect(isSameOriginRequest("not a url", mockReq({ host: "x" }))).toBe(
      false,
    );
  });
});

describe("rejectCrossOriginWrite", () => {
  it("allows a non-browser (Origin-less) request", () => {
    const { res, state } = mockRes();

    expect(rejectCrossOriginWrite(mockReq({}), res, "nope")).toBe(false);
    expect(state.status).toBeNull();
  });

  it("allows a localhost Origin", () => {
    const { res, state } = mockRes();
    const req = mockReq({ origin: "http://localhost:3350" });

    expect(rejectCrossOriginWrite(req, res, "nope")).toBe(false);
    expect(state.status).toBeNull();
  });

  it("rejects a non-localhost browser origin with 403, returning true", () => {
    // Unlike rejectForeignOriginWrite, this gate is localhost-ONLY: even a
    // same-origin LAN/tunnel write is rejected (it guards /config + token
    // minting). The `true` return tells the caller to bail after the 403.
    const { res, state } = mockRes();
    const req = mockReq({
      origin: "https://demo.trycloudflare.com",
      host: "demo.trycloudflare.com",
    });

    expect(rejectCrossOriginWrite(req, res, "config writes blocked")).toBe(
      true,
    );
    expect(state.status).toBe(403);
    expect(state.body).toStrictEqual({ error: "config writes blocked" });
  });

  it("rejects an unparseable Origin (treated as non-local)", () => {
    const { res, state } = mockRes();

    expect(
      rejectCrossOriginWrite(mockReq({ origin: "garbage" }), res, "x"),
    ).toBe(true);
    expect(state.status).toBe(403);
  });
});

describe("rejectForeignOriginWrite", () => {
  it("allows a non-browser (Origin-less) request", () => {
    const { res, state } = mockRes();

    expect(rejectForeignOriginWrite(mockReq({}), res, "nope")).toBe(false);
    expect(state.status).toBeNull();
  });

  it("allows a localhost Origin regardless of host", () => {
    const { res, state } = mockRes();
    const req = mockReq({ origin: "http://localhost:9999", host: "anything" });

    expect(rejectForeignOriginWrite(req, res, "nope")).toBe(false);
    expect(state.status).toBeNull();
  });

  it("allows a same-origin remote write (LAN/tunnel webui saving its own content)", () => {
    const { res, state } = mockRes();
    const req = mockReq({
      origin: "https://demo.trycloudflare.com",
      host: "demo.trycloudflare.com",
    });

    expect(rejectForeignOriginWrite(req, res, "nope")).toBe(false);
    expect(state.status).toBeNull();
  });

  it("rejects a genuinely foreign browser origin with 403 + message", () => {
    const { res, state } = mockRes();
    const req = mockReq({
      origin: "https://evil.example.com",
      host: "demo.trycloudflare.com",
    });

    expect(
      rejectForeignOriginWrite(req, res, "cross-site writes blocked"),
    ).toBe(true);
    expect(state.status).toBe(403);
    expect(state.body).toStrictEqual({ error: "cross-site writes blocked" });
  });

  it("rejects an unparseable Origin (neither localhost nor same-origin)", () => {
    const { res, state } = mockRes();
    const req = mockReq({ origin: "garbage", host: "demo.trycloudflare.com" });

    expect(rejectForeignOriginWrite(req, res, "nope")).toBe(true);
    expect(state.status).toBe(403);
  });
});

describe("rejectRebindableOriginWrite", () => {
  it("allows a non-browser (Origin-less) request", () => {
    const { res, state } = mockRes();
    const req = mockReq({ host: "evil.example:3350" });

    expect(rejectRebindableOriginWrite(req, res, "nope")).toBe(false);
    expect(state.status).toBeNull();
  });

  it.each([
    ["localhost", "http://localhost:3350", "localhost:3350"],
    ["127.0.0.1", "http://127.0.0.1:3350", "127.0.0.1:3350"],
    ["[::1]", "http://[::1]:3350", "[::1]:3350"],
    ["a LAN IP", "http://192.168.1.5:3350", "192.168.1.5:3350"],
    ["a LAN IPv6", "http://[fd00::5]:3350", "[fd00::5]:3350"],
    ["a *.localhost name", "http://pp.localhost:3350", "pp.localhost:3350"],
  ])("allows a same-origin request on %s", (_name, origin, host) => {
    const { res, state } = mockRes();

    expect(
      rejectRebindableOriginWrite(mockReq({ origin, host }), res, "x"),
    ).toBe(false);
    expect(state.status).toBeNull();
  });

  it("rejects DNS rebinding: a DNS-name Host that matches the Origin", () => {
    const { res, state } = mockRes();
    const req = mockReq({
      origin: "http://evil.example:3350",
      host: "evil.example:3350",
    });

    expect(rejectRebindableOriginWrite(req, res, "no install")).toBe(true);
    expect(state.status).toBe(403);
    expect(state.body).toStrictEqual({ error: "no install" });
  });

  it("rejects a tunnel's DNS name", () => {
    const { res, state } = mockRes();
    const req = mockReq({
      origin: "https://demo.trycloudflare.com",
      host: "demo.trycloudflare.com",
    });

    expect(rejectRebindableOriginWrite(req, res, "x")).toBe(true);
    expect(state.status).toBe(403);
  });

  it("rejects a local Origin with a non-loopback Host", () => {
    const { res } = mockRes();

    expect(
      rejectRebindableOriginWrite(
        mockReq({ origin: "http://localhost:3350", host: "192.168.1.5:3350" }),
        res,
        "x",
      ),
    ).toBe(true);
  });

  it("rejects a foreign Origin even when the Host is an IP literal", () => {
    const { res } = mockRes();

    expect(
      rejectRebindableOriginWrite(
        mockReq({ origin: "https://evil.example", host: "192.168.1.5:3350" }),
        res,
        "x",
      ),
    ).toBe(true);
  });

  it("rejects a browser request with no Host header", () => {
    const { res } = mockRes();

    expect(
      rejectRebindableOriginWrite(
        mockReq({ origin: "http://localhost:3350" }),
        res,
        "x",
      ),
    ).toBe(true);
  });
});
