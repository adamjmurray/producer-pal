// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type Express, type Request, type Response } from "express";
import {
  LOCAL_AI_DEFAULT_URLS,
  LOCAL_AI_RELAY_PATH,
  LOCAL_MODEL_PROXY_ERROR_HEADER,
  type LocalAiServer,
} from "#src/shared/config.ts";
import {
  type ForwardOptions,
  forwardToModelServer,
  refuseProxyRequest,
} from "./model-server-forwarding.ts";
import { isOwnPageOrigin } from "./request-origin.ts";

// Only what the chat UI calls. Anything else (Ollama can delete and download
// models) stays out of reach of the network.
const RELAYED_PATHS: Record<LocalAiServer, ReadonlySet<string>> = {
  ollama: new Set([
    "/v1/models",
    "/v1/chat/completions",
    "/api/tags",
    "/api/ps",
    "/api/show",
  ]),
  lmstudio: new Set(["/v1/models", "/v1/chat/completions", "/api/v1/models"]),
};

const SERVER_NAMES: Record<LocalAiServer, string> = {
  ollama: "Ollama",
  lmstudio: "Bionic / LM Studio",
};

export interface LocalAiRelayOptions {
  /** Where each server listens. Tests point these at fake servers. */
  targets?: Record<LocalAiServer, string>;
  /** How long a server may take to start answering. */
  answerTimeoutMs?: ForwardOptions["answerTimeoutMs"];
}

/**
 * Register the local AI relay: `/local-ai/ollama/<path>` and
 * `/local-ai/lmstudio/<path>` forward to that server's fixed address on this
 * computer, so the chat UI opened on a phone or another computer can use it.
 * The request never names the address, so the relay can't reach anything else
 * on the network. Mount it before the app's JSON body parser: it streams the
 * request body straight through.
 *
 * Anyone who can reach Producer Pal can use the local AI through it, like they
 * can already use Live. A browser's Origin must be this server's own, so other
 * websites can't.
 *
 * @param app - Express application
 * @param options - Target addresses and timeout
 */
export function registerLocalAiRelayRoute(
  app: Express,
  options: LocalAiRelayOptions = {},
): void {
  const targets = options.targets ?? LOCAL_AI_DEFAULT_URLS;

  app.use(LOCAL_AI_RELAY_PATH, (req: Request, res: Response): void => {
    // Readable by the page when it's served from another port (the dev server).
    res.setHeader(
      "Access-Control-Expose-Headers",
      LOCAL_MODEL_PROXY_ERROR_HEADER,
    );

    const route = parseRelayPath(req.path);

    if (route == null) {
      refuseProxyRequest(
        res,
        404,
        "The local AI relay only forwards the chat's calls to Ollama or " +
          "Bionic / LM Studio.",
      );

      return;
    }

    if (req.method !== "GET" && req.method !== "POST") {
      res.set("Allow", "GET, POST");
      refuseProxyRequest(
        res,
        405,
        "The local AI relay only supports GET and POST.",
      );

      return;
    }

    if (!isOwnPageOrigin(req)) {
      refuseProxyRequest(
        res,
        403,
        "The local AI relay only works from Producer Pal's own chat page.",
      );

      return;
    }

    const base = new URL(targets[route.server]);

    forwardToModelServer(req, res, new URL(route.path, base), {
      serverName: `${SERVER_NAMES[route.server]} on the computer running Live (${base.host})`,
      answerTimeoutMs: options.answerTimeoutMs,
    });
  });
}

/**
 * Split `/<server>/<path>` and check the path is one the chat UI calls.
 *
 * @param path - The request path below the relay prefix
 * @returns The server and its path, or null when it isn't relayed
 */
function parseRelayPath(
  path: string,
): { server: LocalAiServer; path: string } | null {
  const match = /^\/([^/]+)(\/.*)$/.exec(path);
  const server = match?.[1];
  const rest = match?.[2];

  if (server == null || rest == null || !Object.hasOwn(RELAYED_PATHS, server)) {
    return null;
  }

  const known = server as LocalAiServer;

  return RELAYED_PATHS[known].has(rest) ? { server: known, path: rest } : null;
}
