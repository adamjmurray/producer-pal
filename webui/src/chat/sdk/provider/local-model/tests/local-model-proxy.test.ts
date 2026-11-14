// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proxyFetchFor } from "#webui/chat/sdk/provider/local-model/local-model-proxy";

/**
 * Serve the "page" from this origin for the test.
 * @param origin - The page's origin
 */
function pageAt(origin: string): void {
  const { hostname, port, protocol } = new URL(origin);

  vi.stubGlobal("window", {
    location: { origin, hostname, port, protocol },
  });
}

describe("proxyFetchFor", () => {
  beforeEach(() => {
    pageAt("http://localhost:3350");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    "http://127.0.0.1:8000/v1",
    "http://localhost:8000/v1",
    "http://[::1]:8000/v1",
    "https://localhost/v1",
    " http://127.0.0.1:8000/v1 ",
  ])("proxies the custom provider for %s", (url) => {
    expect(proxyFetchFor("custom", url)).toBeTypeOf("function");
  });

  it.each([
    "https://api.example.com/v1",
    "http://192.168.1.5:8000/v1",
    "http://localhost.example.com/v1",
    "http://127.0.0.1@evil.com/v1",
    "ftp://localhost/v1",
    "not a url",
    "",
  ])("calls the custom provider directly for %s", (url) => {
    expect(proxyFetchFor("custom", url)).toBeUndefined();
  });

  it.each([
    "http://localhost:3350",
    "http://127.0.0.1:3350",
    "http://[::1]:3350",
    "http://localhost:5173",
  ])("proxies when the page is on this computer at %s", (origin) => {
    pageAt(origin);

    expect(proxyFetchFor("custom", "http://127.0.0.1:8000/v1")).toBeTypeOf(
      "function",
    );
  });

  // A page opened over the LAN or a tunnel: `localhost` in the URL means the
  // browsing device, which the browser can call directly.
  it.each([
    "http://192.168.1.20:3350",
    "http://my-mac.local:3350",
    "https://demo.trycloudflare.com",
    "http://localhost.evil.com:3350",
  ])("calls directly when the page is at %s", (origin) => {
    pageAt(origin);

    expect(proxyFetchFor("custom", "http://localhost:8000/v1")).toBeUndefined();
  });

  it("calls directly when there is no page", () => {
    vi.stubGlobal("window", undefined);

    expect(proxyFetchFor("custom", "http://localhost:8000/v1")).toBeUndefined();
  });

  it("calls a custom provider with no URL directly", () => {
    expect(proxyFetchFor("custom", undefined)).toBeUndefined();
  });

  it.each(["lmstudio", "ollama", "openai", "anthropic"])(
    "never proxies %s, even on this computer",
    (provider) => {
      expect(
        proxyFetchFor(provider, "http://127.0.0.1:8000/v1"),
      ).toBeUndefined();
    },
  );
});

describe("the proxying fetch", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    pageAt("http://localhost:3350");
    mockFetch.mockResolvedValue(new Response("ok"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  const proxy = (): typeof fetch =>
    proxyFetchFor("custom", "http://127.0.0.1:8000/v1") as typeof fetch;

  it("sends a POST to the proxy with the real URL in a header", async () => {
    const signal = new AbortController().signal;

    await proxy()("http://127.0.0.1:8000/v1/chat/completions", {
      method: "POST",
      body: '{"a":1}',
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer k",
      },
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;

    expect(url).toBe("http://localhost:3350/local-model-proxy");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"a":1}');
    expect(init.signal).toBe(signal);
    expect(headers.get("x-local-model-url")).toBe(
      "http://127.0.0.1:8000/v1/chat/completions",
    );
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("authorization")).toBe("Bearer k");
  });

  it("defaults to GET", async () => {
    await proxy()("http://127.0.0.1:8000/v1/models");

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];

    expect(init.method).toBe("GET");
  });

  it("takes the URL, method and headers from a Request", async () => {
    await proxy()(
      new Request("http://127.0.0.1:8000/v1/x", {
        method: "POST",
        headers: { "X-Thing": "1" },
      }),
    );

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;

    expect(init.method).toBe("POST");
    expect(headers.get("x-thing")).toBe("1");
    expect(headers.get("x-local-model-url")).toBe("http://127.0.0.1:8000/v1/x");
  });

  it("sends a Request's own body, signal and method", async () => {
    const signal = new AbortController().signal;

    await proxy()(
      new Request("http://127.0.0.1:8000/v1/chat/completions", {
        method: "POST",
        body: '{"a":1}',
        signal,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];

    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe('{"a":1}');
    expect(init.method).toBe("POST");
    expect(init.signal?.aborted).toBe(false);
    expect((init.headers as Headers).get("content-type")).toBe(
      "application/json",
    );
  });

  it("lets init override a Request's body", async () => {
    await proxy()(
      new Request("http://127.0.0.1:8000/v1/x", {
        method: "POST",
        body: "from the request",
      }),
      { body: "from init" },
    );

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];

    expect(init.body).toBe("from init");
  });

  it("sends no body for a GET Request", async () => {
    await proxy()(new Request("http://127.0.0.1:8000/v1/models"));

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];

    expect(init.body).toBeUndefined();
  });

  it("accepts a URL object", async () => {
    await proxy()(new URL("http://localhost:8000/v1/models"));

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];

    expect((init.headers as Headers).get("x-local-model-url")).toBe(
      "http://localhost:8000/v1/models",
    );
  });
});
