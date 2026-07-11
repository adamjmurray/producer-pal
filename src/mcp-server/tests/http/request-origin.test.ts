// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Request, type Response } from "express";
import { describe, expect, it } from "vitest";
import {
  isLocalOrigin,
  isSameOriginRequest,
  rejectForeignOriginWrite,
} from "../../helpers/http/request-origin.ts";

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

      if (key === "origin") return headers.origin;
      if (key === "host") return headers.host;

      return undefined;
    },
  } as unknown as Request;
}

/**
 * A Response stub capturing the status + JSON body a rejection writes.
 * @returns The stub response plus the captured status/body state
 */
function mockRes(): {
  res: Response;
  state: { status: number | null; body: unknown };
} {
  const state: { status: number | null; body: unknown } = {
    status: null,
    body: undefined,
  };
  const res = {
    status(code: number): Response {
      state.status = code;

      return res;
    },
    json(payload: unknown): Response {
      state.body = payload;

      return res;
    },
  } as unknown as Response;

  return { res, state };
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
