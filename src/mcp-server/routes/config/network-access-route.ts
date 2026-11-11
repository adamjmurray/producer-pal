// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// "Allow other devices to connect", for the chat UI. The device toggle does the
// same through the Max message; both end in the listeners' setAllowNetwork,
// which saves the setting and shows it on the device. Not part of /settings:
// that file's keys never open the network.

import { type Express, type Request, type Response } from "express";
import {
  TURN_ON_REFUSED,
  isFromThisComputer,
} from "../../helpers/http/browser/from-this-computer.ts";
import {
  type SwitchResult,
  isNetworkAccessAllowed,
  switchNetworkAccess,
} from "../../helpers/http/network-access-state.ts";

const ROUTE = "/network-access";

/**
 * Register GET /network-access and PUT /network-access. Both answer
 * `{ allowNetwork }` with what the server is actually listening for, which can
 * differ from what a PUT asked for if the switch failed (then `message` says
 * what is true now).
 *
 * Turning it ON is refused (403) unless the request provably comes from this
 * computer (see isFromThisComputer). Turning it OFF is allowed from anywhere
 * that can reach the route, since it only shuts others out. The body must be
 * `application/json` for both. A web page of another site can't send that
 * cross-site: the preflight has to pass first, and the CORS middleware answers
 * only for localhost origins and doesn't list PUT among the methods it allows.
 * The same-origin check in isFromThisComputer backs that up for ON.
 *
 * The switch closes every other open connection but keeps the one this request
 * came on until the answer is sent, then closes it (`Connection: close`). A
 * device turned away this way still gets the answer, then loses the connection.
 * If re-listening needs that connection gone, the answer is never sent.
 *
 * @param app - Express application
 */
export function registerNetworkAccessRoutes(app: Express): void {
  app.get(ROUTE, (_req: Request, res: Response): void => {
    res.set("Cache-Control", "no-store");
    res.json({ allowNetwork: isNetworkAccessAllowed() });
  });

  app.put(ROUTE, async (req: Request, res: Response): Promise<void> => {
    if (!req.is("application/json")) {
      res.status(403).json({
        error: 'Send {"allowNetwork": true or false} as application/json.',
      });

      return;
    }

    const body = req.body as { allowNetwork?: unknown } | undefined;
    const requested = body?.allowNetwork;

    if (typeof requested !== "boolean") {
      res.status(400).json({ error: "allowNetwork must be true or false" });

      return;
    }

    if (requested && !isFromThisComputer(req)) {
      res.status(403).json({ error: TURN_ON_REFUSED });

      return;
    }

    // The switch may close the listener this connection came in on, so it
    // never stays open for another request.
    res.set("Connection", "close");

    const switched = await switchNetworkAccess(requested, {
      keep: req.socket,
      answer: (result) => answer(req, res, requested, result),
    });

    if (!switched) {
      res.status(503).json({ error: "The server isn't ready to switch yet." });
    }
  });
}

/**
 * Send the PUT's answer and wait until it is out (or the connection is gone).
 *
 * @param req - The PUT request
 * @param res - Its response
 * @param requested - What the PUT asked for
 * @param result - What the server ended up as
 * @returns Resolves once the response is flushed or the connection closed
 */
function answer(
  req: Request,
  res: Response,
  requested: boolean,
  result: SwitchResult,
): Promise<void> {
  return new Promise((resolve) => {
    if (req.socket.destroyed) {
      resolve();

      return;
    }

    res.once("finish", resolve);
    res.once("close", resolve);
    res.json({
      allowNetwork: result.allowNetwork,
      ...(!result.listening && {
        message:
          "Couldn't restart the server, so nothing can connect right now. " +
          "The Max console has the reason.",
      }),
      ...(result.listening &&
        result.allowNetwork !== requested && {
          message:
            "Couldn't change it, so only this computer can connect. " +
            "The Max console has the reason.",
        }),
    });
  });
}
