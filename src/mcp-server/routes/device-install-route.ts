// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// REST endpoints the chat UI uses to copy the running device into Live's User
// Library, where Live Sets and the remote script can find it.

import { type Express, type Request, type Response } from "express";
import { installRunningDevice } from "../rpc/device-install/device-install.ts";
import { deviceInstallStatus } from "../rpc/device-install/device-install-status.ts";
import { rejectForeignOriginWrite } from "../helpers/http/request-origin.ts";
import { UserLibraryFolderError } from "../rpc/remote-script/user-library/user-library-folder.ts";

/**
 * Register GET /device-install (status) and POST /device-install/install.
 *
 * The install is a same-origin write, like the remote script's. A refused
 * install (a development device, or a newer copy without `force`) is a 409; a
 * failed one is a 500 with what it changed; a User Library path that isn't an
 * existing absolute folder is a 400.
 *
 * @param app - Express application
 */
export function registerDeviceInstallRoutes(app: Express): void {
  app.get("/device-install", async (_req: Request, res: Response) => {
    // An install, or a copy changed by hand, must show up on the next fetch.
    res.set("Cache-Control", "no-store");
    res.json(await deviceInstallStatus());
  });

  app.post("/device-install/install", (req: Request, res: Response): void => {
    if (
      rejectForeignOriginWrite(
        req,
        res,
        "cross-site /device-install writes are not allowed",
      )
    ) {
      return;
    }

    const body = req.body as
      | { userLibrary?: unknown; force?: unknown }
      | undefined;
    const userLibrary =
      typeof body?.userLibrary === "string" ? body.userLibrary.trim() : "";

    if (userLibrary === "") {
      res.status(400).json({ error: "userLibrary must be a non-empty string" });

      return;
    }

    try {
      const install = installRunningDevice(userLibrary, body?.force === true);

      if (install.status === "done") {
        res.json(install.result);

        return;
      }

      res
        .status(install.status === "refused" ? 409 : 500)
        .json({ ...install.result, error: install.error });
    } catch (error) {
      if (!(error instanceof UserLibraryFolderError)) {
        throw error;
      }

      res.status(400).json({ error: error.message });
    }
  });
}
