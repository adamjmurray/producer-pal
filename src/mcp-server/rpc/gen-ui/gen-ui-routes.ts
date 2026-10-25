// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// REST and SSE endpoints for the experimental generative UI view:
//   GET    /api/ui/widgets       the snapshot (widgets + version)
//   POST   /api/ui/widgets       create a widget
//   PUT    /api/ui/widgets/:id   change a widget
//   DELETE /api/ui/widgets/:id   remove a widget
//   GET    /api/ui/events        server-sent events: a snapshot, then changes
// Registered only when the build has ENABLE_GEN_UI.

import { type Express, type Request, type Response } from "express";
import {
  GEN_UI_EVENTS_PATH,
  GEN_UI_WIDGETS_PATH,
  type GenUiEvent,
} from "#src/shared/gen-ui-types.ts";
import { subscribe } from "./gen-ui-hub.ts";
import {
  createWidget,
  getSnapshot,
  removeWidget,
  updateWidget,
  type StoreResult,
} from "./widget-store.ts";
import { requestBody } from "../../helpers/http/request-body.ts";
import { rejectForeignOriginWrite } from "../../helpers/http/request-origin.ts";

const HEARTBEAT_MS = 25_000;

/**
 * Register the generative-UI endpoints.
 * @param app - Express application
 */
export function registerGenUiRoutes(app: Express): void {
  app.get(GEN_UI_WIDGETS_PATH, (_req: Request, res: Response): void => {
    res.set("Cache-Control", "no-store");
    res.json(getSnapshot());
  });

  app.post(GEN_UI_WIDGETS_PATH, (req: Request, res: Response): void => {
    if (rejectWrite(req, res)) {
      return;
    }

    reply(res, createWidget(requestBody(req)), 201);
  });

  app.put(`${GEN_UI_WIDGETS_PATH}/:id`, (req: Request, res: Response): void => {
    if (rejectWrite(req, res)) {
      return;
    }

    reply(res, updateWidget(String(req.params.id), requestBody(req)), 200);
  });

  app.delete(
    `${GEN_UI_WIDGETS_PATH}/:id`,
    (req: Request, res: Response): void => {
      if (rejectWrite(req, res)) {
        return;
      }

      reply(res, removeWidget(String(req.params.id)), 200);
    },
  );

  app.get(GEN_UI_EVENTS_PATH, openEventStream);
}

/**
 * Start a server-sent event stream: the snapshot first, then each change. A
 * viewer that reconnects gets a fresh snapshot, and one that sees a version
 * jump in the changes reloads from GET /api/ui/widgets.
 * @param req - Express request
 * @param res - Express response, kept open
 */
function openEventStream(req: Request, res: Response): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Keeps a reverse proxy (a tunnel) from holding the stream back.
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 2000\n\n");
  send(res, { type: "snapshot", ...getSnapshot() });

  // Send the snapshot first and subscribe second. Neither awaits, so no change
  // can land between them.
  const unsubscribe = subscribe((event) => send(res, event));
  const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);

  heartbeat.unref();
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}

/**
 * @param res - The open stream
 * @param event - The event to write; its version is the SSE id
 */
function send(res: Response, event: GenUiEvent): void {
  res.write(`id: ${event.version}\ndata: ${JSON.stringify(event)}\n\n`);
}

/**
 * @param res - Express response
 * @param result - What the store answered
 * @param okStatus - The status for success
 */
function reply(res: Response, result: StoreResult, okStatus: number): void {
  if (result.ok) {
    res.status(okStatus).json({ widget: result.widget });

    return;
  }

  res
    .status(result.notFound === true ? 404 : 400)
    .json({ error: result.error });
}

/**
 * @param req - Express request
 * @param res - Express response (a 403 is written when rejected)
 * @returns True when the request was rejected
 */
function rejectWrite(req: Request, res: Response): boolean {
  return rejectForeignOriginWrite(
    req,
    res,
    "cross-site /api/ui writes are not allowed",
  );
}
