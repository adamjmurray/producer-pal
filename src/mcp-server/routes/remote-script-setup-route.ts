// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// REST endpoints the chat UI uses to install Live's Producer Pal remote script.
// The script's Python sources ride along inside this bundle, so installing is
// just writing them into the User Library — nothing is downloaded.

import { type Express, type Request, type Response } from "express";
import { VERSION } from "#src/shared/config.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import { nodeError } from "../node-for-max-logger.ts";
import { syncDeviceInstallNotice } from "../rpc/device-install/device-install-notice.ts";
import {
  answerUserLibraryError,
  readUserLibraryPost,
} from "../helpers/http/user-library-post.ts";
import { UserLibraryFolderError } from "../rpc/remote-script/user-library/user-library-folder.ts";
import { installRemoteScript } from "../rpc/remote-script/install/remote-script-install.ts";
import { installLeftText } from "../rpc/remote-script/install/remote-script-install-reply.ts";
import { remoteScriptStatus } from "../rpc/remote-script/remote-script-status.ts";

/**
 * Register GET /remote-script (status) and POST /remote-script/install.
 *
 * The install is a same-origin write, like the other content endpoints, so a
 * LAN or tunnel chat UI can run it and only a foreign browser origin 403s. A
 * User Library path that isn't an existing absolute folder (after a leading
 * `~`) is a 400; a failed install is a 500 saying what it left.
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
    const posted = readUserLibraryPost(req, res, "/remote-script");

    if (posted == null) {
      return;
    }

    try {
      const { path } = installRemoteScript(posted.userLibrary);

      // The device's "Finish installation" notice may be done with.
      void syncDeviceInstallNotice();
      res.json({ path, version: VERSION });
    } catch (error) {
      if (error instanceof UserLibraryFolderError) {
        answerUserLibraryError(error, res);

        return;
      }

      const message = errorMessage(error);

      nodeError(`Remote script install failed: ${message}`);
      res.status(500).json({
        error: `Couldn't install the remote script (${message}). ${installLeftText(message)}`,
      });
    }
  });
}
