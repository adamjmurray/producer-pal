// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Lets the chat UI use a model server on this computer that sends no CORS
// headers (DwarfStar's ds4-server, for one): the browser calls this route and
// the server makes the call.

import { type Express, type Request, type Response } from "express";
import {
  LOCAL_MODEL_PROXY_ERROR_HEADER,
  LOCAL_MODEL_PROXY_PATH,
  LOCAL_MODEL_URL_HEADER,
  parseLocalModelUrl,
} from "#src/shared/config.ts";
import { isOwnPageOrigin } from "./request-origin.ts";
import { isLocalPeerRequest } from "../test-switch-guard.ts";
import {
  forwardToModelServer,
  refuseProxyRequest as refuse,
} from "./model-server-forwarding.ts";

const MODEL_API_PATH =
  /\/(?:models|chat\/completions|completions|responses|messages)$/;

/**
 * Register the local model proxy route. Mount it before the app's JSON body
 * parser: it streams the request body straight through, with no size limit.
 *
 * Only Producer Pal's own chat page on this computer may use it (see
 * {@link isFromOwnPage}), and only for a model API on `localhost`, `127.0.0.1`
 * or `[::1]`, never Producer Pal itself.
 *
 * @param app - Express application
 */
export function registerLocalModelProxyRoute(app: Express): void {
  app.all(LOCAL_MODEL_PROXY_PATH, (req: Request, res: Response): void => {
    // Readable by the page when it's served from another port (the dev server).
    res.setHeader(
      "Access-Control-Expose-Headers",
      LOCAL_MODEL_PROXY_ERROR_HEADER,
    );

    if (req.method !== "GET" && req.method !== "POST") {
      res.set("Allow", "GET, POST");
      refuse(res, 405, "The local model proxy only supports GET and POST.");

      return;
    }

    if (!isFromOwnPage(req)) {
      refuse(
        res,
        403,
        "The local model proxy only works from Producer Pal's own chat page " +
          "on the computer running Live.",
      );

      return;
    }

    const target = parseLocalModelUrl(req.get(LOCAL_MODEL_URL_HEADER) ?? "");

    if (target == null) {
      refuse(
        res,
        400,
        "The local model proxy only reaches servers on this computer " +
          "(localhost, 127.0.0.1 or [::1]) over http or https.",
      );

      return;
    }

    if (!MODEL_API_PATH.test(target.pathname)) {
      refuse(
        res,
        400,
        "The local model proxy only forwards to a model API: a URL ending in " +
          "/models, /chat/completions, /completions, /responses or /messages.",
      );

      return;
    }

    if (isOwnServer(target, req.socket.localPort)) {
      refuse(res, 400, "The local model proxy can't call Producer Pal itself.");

      return;
    }

    forwardToModelServer(req, res, target, {
      serverName: `the local model server at ${target.origin}`,
    });
  });
}

/**
 * Whether the request is from Producer Pal's own chat page, or a non-browser
 * client, on this computer. The connection must be loopback with a loopback
 * Host and no proxy headers. A browser's Origin, if sent, must be this server's
 * own (same host and port as the request came in on), or in a dev build the
 * Vite dev server's. Any other page on this computer, even on localhost, is
 * refused.
 *
 * @param req - Express request
 * @returns true when the request may use the proxy
 */
function isFromOwnPage(req: Request): boolean {
  return isLocalPeerRequest(req) && isOwnPageOrigin(req);
}

/**
 * Whether a target is this very server: its port (explicit, or the scheme's
 * default) is the one the request arrived on. Targets are loopback already.
 *
 * @param target - The parsed target URL
 * @param localPort - The port the request arrived on
 * @returns true when forwarding would call Producer Pal's own routes
 */
export function isOwnServer(
  target: URL,
  localPort: number | undefined,
): boolean {
  const port = target.port || (target.protocol === "https:" ? "443" : "80");

  return Number(port) === localPort;
}
