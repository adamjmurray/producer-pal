// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type ClientRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
  createServer,
  request,
} from "node:http";
import { type AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isOwnServer } from "../../../helpers/http/browser/local-model-proxy-route.ts";
import { createExpressApp } from "../../../create-express-app.ts";
import {
  type HttpListeners,
  startHttpListeners,
} from "../../../helpers/http/http-listeners.ts";
import { readResponse } from "../../express-app-test-helpers.ts";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

interface Sent {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  text: string;
}

// The route inside the whole app, in front of a fake model server, so the
// rebinding guard, CORS and the JSON parser run as they do for a real request.
describe("/local-model-proxy", () => {
  let listeners: HttpListeners;
  let port = 0;
  let upstream: Server;
  let upstreamPort = 0;
  let upstreamHandler: Handler;
  let upstreamHits: { method?: string; url?: string; headers: object }[];

  const target = (path = "/v1/models"): string =>
    `http://127.0.0.1:${upstreamPort}${path}`;

  // fetch won't let a test choose Host or Origin, so use node:http.
  const open = (
    headers: Record<string, string | undefined>,
    options: { method?: string; body?: Buffer | string },
    onResponse: (res: IncomingMessage, req: ClientRequest) => void,
  ): ClientRequest => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        path: "/local-model-proxy",
        method: options.method ?? "GET",
        agent: false,
        headers: { host: `localhost:${port}`, ...headers },
      },
      (res) => onResponse(res, req),
    );

    req.end(options.body);

    return req;
  };

  const send = (
    headers: Record<string, string | undefined>,
    options: { method?: string; body?: Buffer | string } = {},
  ): Promise<Sent> =>
    new Promise((resolve, reject) => {
      open(headers, options, (res) =>
        readResponse(res, (status, text) =>
          resolve({ status, headers: res.headers, text }),
        ),
      ).on("error", reject);
    });

  // Streaming tests: call `onResponse` with the live response of a GET to the
  // fake model server.
  const stream = (
    onResponse: (res: IncomingMessage, req: ClientRequest) => void,
  ): void => {
    open({ "x-local-model-url": target() }, {}, onResponse).on(
      "error",
      () => undefined,
    );
  };

  const message = (sent: Sent): string =>
    (JSON.parse(sent.text) as { error: { message: string } }).error.message;

  beforeEach(async () => {
    upstreamHits = [];

    upstreamHandler = (_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end('{"data":[]}');
    };

    upstream = createServer((req, res) => {
      upstreamHits.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
      });
      upstreamHandler(req, res);
    });
    await new Promise<void>((resolve) =>
      upstream.listen(0, "127.0.0.1", resolve),
    );
    upstreamPort = (upstream.address() as AddressInfo).port;

    listeners = await startHttpListeners(createExpressApp(), { port: 0 });
    port = listeners.addresses()[0]?.port ?? 0;
  });

  afterEach(async () => {
    await listeners.close();
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
  });

  describe("forwarding", () => {
    it("forwards a GET with its status and content type", async () => {
      upstreamHandler = (_req, res) => {
        res.statusCode = 201;
        res.setHeader("Content-Type", "text/x-test");
        res.end("hello");
      };

      const res = await send({ "x-local-model-url": target("/v1/models?a=1") });

      expect(res.status).toBe(201);
      expect(res.headers["content-type"]).toBe("text/x-test");
      expect(res.text).toBe("hello");
      expect(upstreamHits[0]).toStrictEqual(
        expect.objectContaining({ method: "GET", url: "/v1/models?a=1" }),
      );
    });

    it("forwards a POST body", async () => {
      upstreamHandler = (req, res) => {
        req.pipe(res);
      };

      const res = await send(
        {
          "x-local-model-url": target("/v1/chat/completions"),
          "content-type": "application/json",
        },
        { method: "POST", body: '{"model":"m"}' },
      );

      expect(res.text).toBe('{"model":"m"}');
      expect(upstreamHits[0]?.method).toBe("POST");
    });

    it("passes a body past the app's 2 MB JSON limit", async () => {
      upstreamHandler = (req, res) => {
        let bytes = 0;

        req.on("data", (chunk: Buffer) => (bytes += chunk.length));
        req.on("end", () => res.end(String(bytes)));
      };

      const body = Buffer.alloc(5 * 1024 * 1024, "a");
      const res = await send(
        {
          "x-local-model-url": target(),
          "content-type": "application/json",
        },
        { method: "POST", body },
      );

      expect(res.text).toBe(String(body.length));
    });

    it("forwards only the headers a model server needs", async () => {
      await send(
        {
          "x-local-model-url": target(),
          authorization: "Bearer k",
          accept: "text/event-stream",
          "content-type": "application/json",
          cookie: "session=secret",
          origin: `http://localhost:${port}`,
          referer: `http://localhost:${port}/chat`,
          "x-extra": "1",
        },
        { method: "POST", body: "{}" },
      );

      const headers = upstreamHits[0]?.headers as Record<string, string>;

      expect(headers.authorization).toBe("Bearer k");
      expect(headers.accept).toBe("text/event-stream");
      expect(headers["content-type"]).toBe("application/json");
      expect(headers.host).toBe(`127.0.0.1:${upstreamPort}`);

      for (const name of [
        "cookie",
        "origin",
        "referer",
        "x-extra",
        "x-local-model-url",
      ]) {
        expect(headers).not.toHaveProperty(name);
      }
    });

    it("streams chunks as they arrive, before the upstream ends", async () => {
      let finish = (): void => undefined;

      upstreamHandler = (_req, res) => {
        res.setHeader("Content-Type", "text/event-stream");
        res.write("data: one\n\n");
        finish = () => res.end("data: two\n\n");
      };

      const first = await new Promise<string>((resolve) => {
        stream((res) => {
          res.once("data", (chunk: Buffer) => resolve(chunk.toString()));
        });
      });

      // The upstream hasn't ended: only the first chunk has crossed.
      expect(first).toBe("data: one\n\n");
      finish();
    });

    it("stops the upstream request when the browser disconnects", async () => {
      const closed = new Promise<void>((resolve) => {
        upstreamHandler = (_req, res) => {
          res.write("data: one\n\n");
          res.on("close", resolve);
        };
      });

      stream((res, req) => {
        res.once("data", () => req.destroy());
      });

      await expect(closed).resolves.toBeUndefined();
    });

    it("cuts the browser's stream when the upstream dies mid-answer", async () => {
      upstreamHandler = (_req, res) => {
        res.write("data: one\n\n");
        setTimeout(() => res.destroy(), 10);
      };

      const ended = await new Promise<string>((resolve) => {
        stream((res) => {
          res.on("data", () => undefined);
          res.on("error", () => resolve("error"));
          res.on("close", () => resolve(res.complete ? "end" : "cut"));
        });
      });

      expect(ended).not.toBe("end");
    });
  });

  describe("unreachable and redirecting servers", () => {
    it("explains when nothing is listening", async () => {
      const dead = await new Promise<number>((resolve) => {
        const probe = createServer().listen(0, "127.0.0.1", () => {
          const free = (probe.address() as AddressInfo).port;

          probe.close(() => resolve(free));
        });
      });
      const res = await send({
        "x-local-model-url": `http://127.0.0.1:${dead}/v1/models`,
      });

      expect(res.status).toBe(502);
      expect(res.headers["x-producer-pal-proxy-error"]).toBe("true");
      expect(message(res)).toBe(
        `Couldn't reach the local model server at http://127.0.0.1:${dead}. Is it running?`,
      );
    });

    it("does not follow a redirect", async () => {
      let elsewhereHits = 0;
      const elsewhere = createServer((_req, res) => {
        elsewhereHits++;
        res.end("secret");
      });

      await new Promise<void>((resolve) =>
        elsewhere.listen(0, "127.0.0.1", resolve),
      );
      const elsewherePort = (elsewhere.address() as AddressInfo).port;

      upstreamHandler = (_req, res) => {
        res.statusCode = 302;
        res.setHeader("Location", `http://127.0.0.1:${elsewherePort}/`);
        res.end();
      };

      const res = await send({ "x-local-model-url": target() });

      elsewhere.close();

      expect(res.status).toBe(502);
      expect(res.headers).not.toHaveProperty("location");
      expect(message(res)).toMatch(/redirect/);
      expect(elsewhereHits).toBe(0);
    });
  });

  describe("targets", () => {
    it.each([
      ["another host", "http://example.com/v1/models"],
      ["a LAN address", "http://192.168.1.5:8000/v1/models"],
      ["localhost as a subdomain", "http://localhost.example.com/v1/models"],
      ["userinfo naming another host", "http://127.0.0.1@evil.com/v1/models"],
      [
        "userinfo on a loopback host",
        "http://user:pw@127.0.0.1:8000/v1/models",
      ],
      ["another scheme", "ftp://127.0.0.1/v1/models"],
      ["a file URL", "file:///etc/passwd"],
      ["junk", "not a url"],
      ["nothing", ""],
    ])("refuses %s", async (_name, url) => {
      const res = await send({ "x-local-model-url": url });

      expect(res.status).toBe(400);
      expect(res.headers["x-producer-pal-proxy-error"]).toBe("true");
      expect(message(res)).toMatch(/only reaches servers on this computer/);
      expect(upstreamHits).toHaveLength(0);
    });

    it.each([
      "/models",
      "/v1/models?a=1",
      "/v1/models?x=/config",
      "/v1/chat/completions",
      "/openai/v1/completions",
      "/v1/responses",
      "/v1/messages",
    ])("forwards the model API path %s", async (path) => {
      const res = await send({ "x-local-model-url": target(path) });

      expect(res.status).toBe(200);
      expect(upstreamHits[0]?.url).toBe(path);
    });

    it.each([
      "/",
      "/config",
      "/v1",
      "/v1/models/",
      "/v1/modelsX",
      "/v1/models/extra",
      "/v1/chat/completions/extra",
      "/v1/chat",
      "/v1/models/../config",
      "/xmodels",
    ])("refuses the path %s", async (path) => {
      const res = await send({ "x-local-model-url": target(path) });

      expect(res.status).toBe(400);
      expect(res.headers["x-producer-pal-proxy-error"]).toBe("true");
      expect(message(res)).toMatch(
        /\/models, \/chat\/completions, \/completions, \/responses or \/messages/,
      );
      expect(upstreamHits).toHaveLength(0);
    });

    it("refuses Producer Pal's own port", async () => {
      const res = await send({
        "x-local-model-url": `http://127.0.0.1:${port}/v1/models`,
      });

      expect(res.status).toBe(400);
      expect(message(res)).toMatch(/can't call Producer Pal itself/);
    });

    it("refuses a request with no target", async () => {
      const res = await send({});

      expect(res.status).toBe(400);
    });

    it("answers only GET and POST", async () => {
      const res = await send(
        { "x-local-model-url": target() },
        { method: "PUT" },
      );

      expect(res.status).toBe(405);
      expect(res.headers.allow).toBe("GET, POST");
      expect(upstreamHits).toHaveLength(0);
    });
  });

  describe("callers", () => {
    it("serves Producer Pal's own page", async () => {
      const res = await send({
        "x-local-model-url": target(),
        origin: `http://localhost:${port}`,
      });

      expect(res.status).toBe(200);
    });

    it("serves a request with no Origin (same-origin GET, scripts)", async () => {
      const res = await send({ "x-local-model-url": target() });

      expect(res.status).toBe(200);
    });

    describe("the Vite dev server's origin", () => {
      const fromDevServer = (): Promise<Sent> =>
        send({
          "x-local-model-url": target(),
          origin: "http://localhost:5173",
        });

      afterEach(() => {
        vi.unstubAllEnvs();
      });

      it("is served in a dev build", async () => {
        vi.stubEnv("ENABLE_LIVE_API", "true");

        const res = await fromDevServer();

        expect(res.status).toBe(200);
        expect(res.headers["access-control-allow-origin"]).toBe(
          "http://localhost:5173",
        );
        expect(res.headers["access-control-expose-headers"]).toBe(
          "x-producer-pal-proxy-error",
        );
      });

      it("lets its preflight with Authorization through in a dev build", async () => {
        vi.stubEnv("ENABLE_LIVE_API", "true");

        const preflight = await send(
          {
            origin: "http://localhost:5173",
            "access-control-request-method": "POST",
            "access-control-request-headers":
              "authorization,content-type,x-local-model-url",
          },
          { method: "OPTIONS" },
        );

        expect(preflight.status).toBe(200);
        expect(preflight.headers["access-control-allow-headers"]).toBe(
          "*, Authorization",
        );
      });

      it("is refused in a release build", async () => {
        const res = await fromDevServer();

        expect(res.status).toBe(403);
        expect(upstreamHits).toHaveLength(0);
      });

      it("is refused on a non-loopback host, even in a dev build", async () => {
        vi.stubEnv("ENABLE_LIVE_API", "true");

        const res = await send({
          "x-local-model-url": target(),
          origin: "http://192.168.1.5:5173",
        });

        expect(res.status).toBe(403);
      });
    });

    it.each([
      ["a foreign origin", { origin: "https://evil.example" }],
      ["a LAN origin", { origin: "http://192.168.1.5:3350" }],
      ["a null origin", { origin: "null" }],
      ["another page on localhost", { origin: "http://localhost:9999" }],
      ["another page on 127.0.0.1", { origin: "http://127.0.0.1:9999" }],
      ["this server's port on another host", { origin: "http://127.0.0.1:1" }],
      ["a proxied request", { "x-forwarded-for": "203.0.113.9" }],
    ])("refuses %s", async (_name, headers) => {
      const res = await send({ "x-local-model-url": target(), ...headers });

      expect(res.status).toBe(403);
      expect(message(res)).toMatch(/computer running Live/);
      expect(upstreamHits).toHaveLength(0);
    });

    it("refuses a Host a website could rebind", async () => {
      const res = await send({
        "x-local-model-url": target(),
        host: `evil.example:${port}`,
      });

      expect(res.status).toBe(403);
      expect(upstreamHits).toHaveLength(0);
    });

    it("refuses a tunnel's Host", async () => {
      const res = await send({
        "x-local-model-url": target(),
        host: "demo.trycloudflare.com",
      });

      expect(res.status).toBe(403);
      expect(upstreamHits).toHaveLength(0);
    });
  });
});

describe("isOwnServer", () => {
  it.each([
    ["an explicit port", "http://127.0.0.1:3350/v1/models", 3350, true],
    ["another port", "http://127.0.0.1:8000/v1/models", 3350, false],
    ["the default http port", "http://localhost/v1/models", 80, true],
    [
      "an explicit default http port",
      "http://localhost:80/v1/models",
      80,
      true,
    ],
    ["the default https port", "https://localhost/v1/models", 443, true],
    ["http on port 443", "http://localhost/v1/models", 443, false],
    ["https on port 80", "https://localhost/v1/models", 80, false],
    ["no local port", "http://localhost/v1/models", undefined, false],
  ])("for %s", (_what, url, localPort, expected) => {
    expect(isOwnServer(new URL(url), localPort)).toBe(expected);
  });
});
