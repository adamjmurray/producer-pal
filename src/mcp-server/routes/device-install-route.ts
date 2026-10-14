// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// REST endpoints the chat UI uses to copy the running device into Live's User
// Library, where Live Sets and the remote script can find it.

import { type Express, type Request, type Response } from "express";
import { installRunningDevice } from "../rpc/device-install/device-install.ts";
import { deviceInstallStatus } from "../rpc/device-install/device-install-status.ts";
import { deviceSwapCheck } from "../rpc/device-install/device-swap-check.ts";
import { swapForLibraryCopy } from "../rpc/device-install/device-swap.ts";
import { remoteScriptPing } from "../rpc/remote-script/remote-script-client.ts";
import { rejectForeignOriginWrite } from "../helpers/http/request-origin.ts";
import { UserLibraryFolderError } from "../rpc/remote-script/user-library/user-library-folder.ts";

/**
 * Register GET /device-install (status), POST /device-install/install, and
 * POST /device-install/swap.
 *
 * The install is a same-origin write, like the remote script's. A refused
 * install (a development device, or a newer copy without `force`) is a 409; a
 * failed one is a 500 with what it changed; a User Library path that isn't an
 * existing absolute folder is a 400.
 *
 * A swap replaces the running device, so this server usually dies before it can
 * answer: the chat UI treats a dropped connection as the swap happening and
 * watches `GET /device-install` for the new device. A swap the server refuses
 * (no copy, an older copy, no remote script, Live said no) is a 409, and an
 * unreachable remote script a 502; neither changes the Set.
 *
 * @param app - Express application
 */
export function registerDeviceInstallRoutes(app: Express): void {
  app.get("/device-install", async (_req: Request, res: Response) => {
    // An install, or a copy changed by hand, must show up on the next fetch.
    res.set("Cache-Control", "no-store");

    const status = await deviceInstallStatus();
    const { allowed, reason } = await deviceSwapCheck(status, remoteScriptPing);

    res.json({ ...status, swap: { allowed, reason } });
  });

  app.post("/device-install/install", (req: Request, res: Response): void => {
    const posted = readPost(req, res);

    if (posted == null) {
      return;
    }

    try {
      const install = installRunningDevice(
        posted.userLibrary,
        posted.body?.force === true,
      );

      if (install.status === "done") {
        res.json(install.result);

        return;
      }

      res
        .status(install.status === "refused" ? 409 : 500)
        .json({ ...install.result, error: install.error });
    } catch (error) {
      libraryError(error, res);
    }
  });

  app.post(
    "/device-install/swap",
    async (req: Request, res: Response): Promise<void> => {
      const posted = readPost(req, res);

      if (posted == null) {
        return;
      }

      try {
        const swap = await swapForLibraryCopy(posted.userLibrary);

        if (swap.status === "swapping") {
          res.json({ swapping: true, confirmed: true, track: swap.track });
        } else if (swap.status === "unconfirmed") {
          // Live may have swapped: this server may be about to go away, so
          // say what we know and let the page watch for the new device.
          res.json({ swapping: true, confirmed: false, note: swap.error });
        } else {
          res
            .status(swap.status === "refused" ? 409 : 502)
            .json({ error: swap.error });
        }
      } catch (error) {
        libraryError(error, res);
      }
    },
  );
}

/**
 * Check a same-origin POST that names a User Library.
 *
 * @param req - The request
 * @param res - The response, answered here when the request is refused
 * @returns The User Library and body, or null once answered
 */
function readPost(
  req: Request,
  res: Response,
): {
  userLibrary: string;
  body: { force?: unknown } | undefined;
} | null {
  if (
    rejectForeignOriginWrite(
      req,
      res,
      "cross-site /device-install writes are not allowed",
    )
  ) {
    return null;
  }

  const body = req.body as
    | { userLibrary?: unknown; force?: unknown }
    | undefined;
  const userLibrary =
    typeof body?.userLibrary === "string" ? body.userLibrary.trim() : "";

  if (userLibrary === "") {
    res.status(400).json({ error: "userLibrary must be a non-empty string" });

    return null;
  }

  return { userLibrary, body };
}

/**
 * Answer a bad User Library path with a 400; anything else is not ours to
 * explain.
 *
 * @param error - What the install or swap threw
 * @param res - The response
 * @throws The error, when it isn't a bad User Library path
 */
function libraryError(error: unknown, res: Response): void {
  if (!(error instanceof UserLibraryFolderError)) {
    throw error;
  }

  res.status(400).json({ error: error.message });
}
