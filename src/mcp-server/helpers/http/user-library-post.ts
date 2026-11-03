// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type Request, type Response } from "express";
import { UserLibraryFolderError } from "../../rpc/remote-script/user-library/user-library-folder.ts";
import { rejectRebindableOriginWrite } from "./request-origin.ts";

const INSTALL_REFUSED =
  "Can't install from this address. Open the chat UI at localhost or this computer's IP address to install.";

/**
 * Check a same-origin POST that names a User Library. A browser must reach the
 * server by localhost or an IP address, never a DNS name (which can be rebound
 * to this machine by another site).
 *
 * @param req - The request
 * @param res - The response, answered here when the request is refused
 * @returns The trimmed User Library and the body, or null once answered
 */
export function readUserLibraryPost(
  req: Request,
  res: Response,
): { userLibrary: string; body: Record<string, unknown> | undefined } | null {
  if (rejectRebindableOriginWrite(req, res, INSTALL_REFUSED)) {
    return null;
  }

  const body = req.body as Record<string, unknown> | undefined;
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
 * @param error - What the request's work threw
 * @param res - The response
 * @throws The error, when it isn't a bad User Library path
 */
export function answerUserLibraryError(error: unknown, res: Response): void {
  if (!(error instanceof UserLibraryFolderError)) {
    throw error;
  }

  res.status(400).json({ error: error.message });
}
