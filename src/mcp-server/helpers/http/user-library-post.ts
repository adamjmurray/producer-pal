// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type Request, type Response } from "express";
import { UserLibraryFolderError } from "../../rpc/remote-script/user-library/user-library-folder.ts";
import { rejectForeignOriginWrite } from "./request-origin.ts";

/**
 * Check a same-origin POST that names a User Library.
 *
 * @param req - The request
 * @param res - The response, answered here when the request is refused
 * @param route - The route family, named in the cross-site refusal
 * @returns The trimmed User Library and the body, or null once answered
 */
export function readUserLibraryPost(
  req: Request,
  res: Response,
  route: string,
): { userLibrary: string; body: Record<string, unknown> | undefined } | null {
  if (
    rejectForeignOriginWrite(
      req,
      res,
      `cross-site ${route} writes are not allowed`,
    )
  ) {
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
