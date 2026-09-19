// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// REST endpoints the chat UI uses to install Live's Producer Pal remote script.
// The script's Python sources ride along inside this bundle, so installing is
// just writing them into the User Library — nothing is downloaded.

import { type Express, type Request, type Response } from "express";
import { VERSION } from "#src/shared/config.ts";
import { rejectForeignOriginWrite } from "../helpers/http/request-origin.ts";
import {
  RemoteScriptInstallError,
  installRemoteScript,
} from "../rpc/remote-script/remote-script-install.ts";
import { remoteScriptStatus } from "../rpc/remote-script/remote-script-status.ts";

/**
 * Register GET /remote-script (status) and POST /remote-script/install.
 *
 * The install is a same-origin write, like the other content endpoints, so a
 * LAN or tunnel chat UI can run it and only a foreign browser origin 403s. A
 * User Library path that isn't absolute (after a leading `~`) is a 400.
 *
 * @param app - Express application
 */
export function registerRemoteScriptSetupRoutes(app: Express): void {
  app.get("/remote-script", async (_req: Request, res: Response) => {
    // An install, a Live restart, or a hand-edited script must show up on the
    // next fetch.
    res.set("Cache-Control", "no-store");
    res.json(await remoteScriptStatus());
  });

  app.post("/remote-script/install", (req: Request, res: Response): void => {
    if (
      rejectForeignOriginWrite(
        req,
        res,
        "cross-site /remote-script writes are not allowed",
      )
    ) {
      return;
    }

    const body = req.body as { userLibrary?: unknown } | undefined;
    const userLibrary =
      typeof body?.userLibrary === "string" ? body.userLibrary.trim() : "";

    if (userLibrary === "") {
      res.status(400).json({ error: "userLibrary must be a non-empty string" });

      return;
    }

    try {
      res.json({
        path: installRemoteScript(userLibrary).path,
        version: VERSION,
      });
    } catch (error) {
      if (!(error instanceof RemoteScriptInstallError)) {
        throw error;
      }

      res.status(400).json({ error: error.message });
    }
  });
}
