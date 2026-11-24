// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type ClientRequest, type IncomingMessage, request } from "node:http";
import express from "express";
import { describe, expect, it } from "vitest";
import { createExpressApp } from "../../../create-express-app.ts";
import { registerLocalAiRelayRoute } from "../../../helpers/http/browser/local-ai-relay-route.ts";
import { readResponse } from "../../express-app-test-helpers.ts";
import {
  errorBodyMessage,
  itStreamsUnbuffered,
  useFakeModelServer,
  useListeningApp,
} from "./model-server-forwarding-test-helpers.ts";

interface Sent {
  status: number;
  headers: IncomingMessage["headers"];
  text: string;
}

const ANSWER_TIMEOUT_MS = 200;

describe("/local-ai relay", () => {
  const fake = useFakeModelServer();

  // node:http, not fetch: fetch won't let a test choose Host or Origin, and it
  // tidies `..` out of a path.
  const open = (
    path: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    },
    onResponse: (res: IncomingMessage, req: ClientRequest) => void,
  ): ClientRequest => {
    const req = request(
      {
        host: "127.0.0.1",
        port: appPort(),
        path,
        method: options.method ?? "GET",
        agent: false,
        headers: { host: `192.168.1.20:${appPort()}`, ...options.headers },
      },
      (res) => onResponse(res, req),
    );

    req.on("error", () => undefined);
    req.end(options.body);

    return req;
  };

  const send = (
    path: string,
    options: Parameters<typeof open>[1] = {},
  ): Promise<Sent> =>
    new Promise((resolve) => {
      open(path, options, (res) =>
        readResponse(res, (status, text) =>
          resolve({ status, headers: res.headers, text }),
        ),
      );
    });

  const message = (sent: Sent): string => errorBodyMessage(sent.text);

  const ollamaName = (): string =>
    `Ollama on the computer running Live (127.0.0.1:${fake.port()})`;

  const appPort = useListeningApp(() => {
    const app = express();
    const target = `http://127.0.0.1:${fake.port()}`;

    registerLocalAiRelayRoute(app, {
      targets: { ollama: target, lmstudio: target },
      answerTimeoutMs: ANSWER_TIMEOUT_MS,
    });

    return app;
  });

  describe("forwarding", () => {
    it("forwards a chat request to Ollama with its body and auth only", async () => {
      // Answer once the whole body is in, so the hit holds all of it.
      fake.answerWith((req, res) => req.on("end", () => res.end("{}")));

      const sent = await send("/local-ai/ollama/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer not-needed",
          cookie: "secret=1",
          origin: `http://192.168.1.20:${appPort()}`,
        },
        body: '{"model":"qwen3"}',
      });

      expect(sent.status).toBe(200);
      expect(fake.hits()).toHaveLength(1);
      expect(fake.hits()[0]).toStrictEqual(
        expect.objectContaining({
          method: "POST",
          url: "/v1/chat/completions",
          body: '{"model":"qwen3"}',
        }),
      );
      expect(fake.hits()[0]?.headers.authorization).toBe("Bearer not-needed");
      expect(fake.hits()[0]?.headers.cookie).toBeUndefined();
      expect(fake.hits()[0]?.headers.origin).toBeUndefined();
    });

    it.each([
      ["ollama", "/api/tags"],
      ["ollama", "/api/ps"],
      ["ollama", "/v1/models"],
      ["lmstudio", "/api/v1/models"],
      ["lmstudio", "/v1/models"],
    ])("forwards %s %s", async (server, path) => {
      const sent = await send(`/local-ai/${server}${path}`);

      expect(sent.status).toBe(200);
      expect(sent.text).toBe('{"data":[]}');
      expect(fake.hits()[0]?.url).toBe(path);
    });

    it("passes the server's own error status through", async () => {
      fake.answerWith((_req, res) => {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end('{"error":{"message":"model not found"}}');
      });

      const sent = await send("/local-ai/ollama/api/show", { method: "POST" });

      expect(sent.status).toBe(404);
      expect(message(sent)).toBe("model not found");
      expect(sent.headers["x-producer-pal-proxy-error"]).toBeUndefined();
    });

    itStreamsUnbuffered(fake, (onResponse) => {
      open(
        "/local-ai/ollama/v1/chat/completions",
        { method: "POST" },
        onResponse,
      );
    });
  });

  describe("failures", () => {
    it("explains when the server isn't running", async () => {
      await fake.stop();

      const sent = await send("/local-ai/ollama/v1/models");

      expect(sent.status).toBe(502);
      expect(sent.headers["x-producer-pal-proxy-error"]).toBe("true");
      expect(message(sent)).toBe(
        `Couldn't reach ${ollamaName()}. Is it running?`,
      );
    });

    it("gives up on a server that never answers", async () => {
      fake.answerWith(() => undefined);

      const sent = await send("/local-ai/ollama/v1/models");

      expect(sent.status).toBe(504);
      expect(message(sent)).toBe(
        `${ollamaName()} didn't start answering in time.`,
      );
    });

    it("ends a streamed reply with an error event when the server drops", async () => {
      fake.answerWith((_req, res) => {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write("data: one\n\n");
        setTimeout(() => res.socket?.resetAndDestroy(), 10);
      });

      const sent = await send("/local-ai/ollama/v1/chat/completions", {
        method: "POST",
      });
      const events = sent.text.split("\n\n").filter(Boolean);

      expect(sent.status).toBe(200);
      expect(events[0]).toBe("data: one");
      expect(
        JSON.parse(events.at(-1)?.slice("data: ".length) ?? ""),
      ).toStrictEqual({
        error: {
          message: `Lost the connection to ${ollamaName()} in the middle of the reply.`,
        },
      });
    });

    it("does not follow a redirect", async () => {
      fake.answerWith((_req, res) => {
        res.writeHead(302, { Location: "http://example.com/v1/models" });
        res.end();
      });

      const sent = await send("/local-ai/ollama/v1/models");

      expect(sent.status).toBe(502);
      expect(message(sent)).toMatch(/redirect/);
      expect(fake.hits()).toHaveLength(1);
    });
  });

  describe("refusals", () => {
    it.each([
      ["an unknown server", "/local-ai/other/v1/models"],
      ["an Ollama path the chat doesn't use", "/local-ai/ollama/api/delete"],
      ["Ollama's model download", "/local-ai/ollama/api/pull"],
      ["a path that climbs out", "/local-ai/ollama/v1/../api/delete"],
      ["an Ollama-only path on Bionic", "/local-ai/lmstudio/api/tags"],
      ["the bare prefix", "/local-ai"],
      ["an inherited property name", "/local-ai/constructor/v1/models"],
    ])("refuses %s", async (_label, path) => {
      const sent = await send(path, { method: "POST" });

      expect(sent.status).toBe(404);
      expect(sent.headers["x-producer-pal-proxy-error"]).toBe("true");
      expect(fake.hits()).toHaveLength(0);
    });

    it("answers only GET and POST", async () => {
      const sent = await send("/local-ai/ollama/v1/models", { method: "PUT" });

      expect(sent.status).toBe(405);
      expect(sent.headers.allow).toBe("GET, POST");
      expect(fake.hits()).toHaveLength(0);
    });

    it("refuses another website's page", async () => {
      const sent = await send("/local-ai/ollama/v1/models", {
        headers: { origin: "https://evil.example" },
      });

      expect(sent.status).toBe(403);
      expect(fake.hits()).toHaveLength(0);
    });

    it("serves the chat page over a tunnel's own origin", async () => {
      const sent = await send("/local-ai/ollama/v1/models", {
        headers: {
          host: "abc.trycloudflare.com",
          origin: "https://abc.trycloudflare.com",
        },
      });

      expect(sent.status).toBe(200);
    });
  });
});

describe("/local-ai relay in the app", () => {
  const appPort = useListeningApp(createExpressApp);

  // A refused path proves the route is mounted without calling a real Ollama.
  it("is mounted ahead of the rest of the app", async () => {
    const res = await fetch(
      `http://127.0.0.1:${appPort()}/local-ai/ollama/api/pull`,
      { method: "POST", body: "{}" },
    );

    expect(res.status).toBe(404);
    expect(res.headers.get("x-producer-pal-proxy-error")).toBe("true");
  });
});
