// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Generic REST endpoints for a ~/.producer-pal markdown collection (memory,
// custom skills): GET lists, PUT creates/overwrites, DELETE removes, and a
// create-only PUT rejects a name collision with 409. The per-collection store
// bindings and request-body validation come from a config, so each collection's
// own route file is a thin binding — the same "generic + thin wrapper" shape as
// the webui's useDocCollection hook.

import { type Express, type Request, type Response } from "express";
import { requestBody } from "../helpers/http/request-body.ts";
import { rejectForeignOriginWrite } from "../helpers/http/request-origin.ts";

/** buildInput's result: the store input, or a 400 error message. */
export type BuildInputResult<TInput> = TInput | { error: string };

export interface CollectionRouteConfig<TInput, TEntry> {
  /** URL base, e.g. "/memory". */
  basePath: string;
  /** Human noun for the collision message, e.g. "memory" / "custom skill". */
  noun: string;
  /** List every stored entry (the GET payload). */
  list: () => TEntry[];
  /** Whether an entry with this name already exists (the create-only 409). */
  exists: (name: string) => boolean;
  /** Slugify a name (for the 409 message). */
  slugify: (name: string) => string;
  /** Delete an entry, reporting whether it existed. */
  forget: (name: string) => boolean;
  /** Persist an entry (throws on store-level validation failure). */
  remember: (input: TInput) => TEntry;
  /**
   * Rename an entry (write its current fields under the new name, delete the
   * old). Optional — only collections that expose renaming register the extra
   * `PUT /:name/rename` route.
   */
  rename?: (oldName: string, input: TInput) => TEntry;
  /** Validate a request body + name into a store input, or a 400 message. */
  buildInput: (
    name: string,
    reqBody: Record<string, unknown>,
  ) => BuildInputResult<TInput>;
}

/**
 * Register GET/PUT/DELETE for one markdown collection on the Express app. Writes
 * are localhost-origin-gated exactly like POST /config (authoring is a local
 * action); the GET stays ungated. Per-collection validation and store bindings
 * come from `config`.
 *
 * @param app - Express application
 * @param config - The collection's endpoints, store bindings, and validation
 */
export function registerCollectionRoutes<TInput, TEntry>(
  app: Express,
  config: CollectionRouteConfig<TInput, TEntry>,
): void {
  const { basePath, noun } = config;

  app.get(basePath, (_req: Request, res: Response): void => {
    // Device/AI/hand writes must surface on the next fetch — never cache.
    res.set("Cache-Control", "no-store");
    res.json({ entries: config.list() });
  });

  app.put(`${basePath}/:name`, (req: Request, res: Response): void => {
    if (rejectWrite(req, res, basePath)) return;

    const name = entryName(req);
    const body = requestBody(req);
    const built = config.buildInput(name, body);

    if (isError(built)) {
      res.status(400).json({ error: built.error });

      return;
    }

    // The editor's Create flow sets createOnly so a new entry can't silently
    // overwrite an existing one its name happens to slugify to (an edit targets
    // a known slug, where overwrite is intended).
    const createOnly = body.createOnly;

    if (createOnly === true && config.exists(name)) {
      res.status(409).json({
        error: `A ${noun} named "${config.slugify(name)}" already exists`,
      });

      return;
    }

    try {
      res.json({ entry: config.remember(built) });
    } catch (error) {
      // The store rejects an unslugifiable name or empty body — surface it as a
      // 400 so the editor can show why the save was refused.
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.delete(`${basePath}/:name`, (req: Request, res: Response): void => {
    if (rejectWrite(req, res, basePath)) return;

    res.json({ existed: config.forget(entryName(req)) });
  });

  registerRenameRoute(app, config);
}

// --- Helpers below main export ---

/**
 * Register `PUT /:name/rename` when the collection supports renaming: writes the
 * entry's current fields (from the request body) under `newName` and deletes the
 * old file. Renaming a never-created `:name` is a 404 (the store backstops this,
 * but the route owns the HTTP status). A collision with a *different* existing
 * entry is a 409, exactly like the create-only PUT; an invalid name / empty body
 * surfaces the store's message as a 400. Distinct two-segment path, so it never
 * shadows `PUT /:name`.
 *
 * @param app - Express application
 * @param config - The collection's endpoints, store bindings, and validation
 */
function registerRenameRoute<TInput, TEntry>(
  app: Express,
  config: CollectionRouteConfig<TInput, TEntry>,
): void {
  const { basePath, noun, rename } = config;

  if (rename == null) return;

  app.put(`${basePath}/:name/rename`, (req: Request, res: Response): void => {
    if (rejectWrite(req, res, basePath)) return;

    const oldName = entryName(req);
    const reqBody = requestBody(req);

    if (typeof reqBody.newName !== "string") {
      res.status(400).json({ error: "newName must be a string" });

      return;
    }

    const newName = reqBody.newName;
    const built = config.buildInput(newName, reqBody);

    if (isError(built)) {
      res.status(400).json({ error: built.error });

      return;
    }

    // Rename addresses an existing entry; a never-created oldName is a 404, not
    // a silent create. (Checked after body validation so a malformed rename body
    // still 400s, matching the missing-newName case.)
    if (!config.exists(oldName)) {
      res.status(404).json({
        error: `No ${noun} named "${config.slugify(oldName)}" exists`,
      });

      return;
    }

    // Renaming to a slug a different entry already owns would clobber it.
    if (
      config.slugify(newName) !== config.slugify(oldName) &&
      config.exists(newName)
    ) {
      res.status(409).json({
        error: `A ${noun} named "${config.slugify(newName)}" already exists`,
      });

      return;
    }

    try {
      res.json({ entry: rename(oldName, built) });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });
}

/**
 * Narrow a buildInput result to its error variant.
 * @param result - The buildInput result
 * @returns True when the result is a `{ error }` rejection
 */
function isError<TInput>(
  result: BuildInputResult<TInput>,
): result is { error: string } {
  return (
    typeof result === "object" &&
    result != null &&
    "error" in result &&
    typeof (result as { error: unknown }).error === "string"
  );
}

/**
 * The `:name` route param as a plain string. Express types params loosely, but a
 * matched `:name` segment is always a string; the store slugifies and validates
 * whatever it receives.
 *
 * @param req - Express request
 * @returns The raw name path segment
 */
function entryName(req: Request): string {
  return String(req.params.name);
}

/**
 * Reject a genuinely cross-site write with 403. Same-origin (incl. a LAN/tunnel
 * webui saving its own content), localhost, and non-browser clients pass. Returns
 * true when the request was rejected and the caller should stop.
 *
 * @param req - Express request
 * @param res - Express response (written on rejection)
 * @param basePath - The collection base path (for the error message)
 * @returns True when the request was rejected
 */
function rejectWrite(req: Request, res: Response, basePath: string): boolean {
  return rejectForeignOriginWrite(
    req,
    res,
    `cross-site ${basePath} writes are not allowed`,
  );
}
