// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// REST endpoints for the LLM-managed memory collection
// (~/.producer-pal/memory/<slug>.md) — a thin binding of the generic
// collection-route factory to the memory store. The webui manager lists (GET),
// saves (PUT), and deletes (DELETE); the backend re-derives MEMORY.md on each
// write.

import { type Express } from "express";
import {
  forgetMemory,
  listMemoryEntries,
  memoryExists,
  rememberMemory,
  slugifyMemoryName,
} from "../helpers/memory/global-memory-store.ts";
import { registerCollectionRoutes } from "./collection-route.ts";

/**
 * Register the /memory collection REST endpoints on the Express app.
 * @param app - Express application
 */
export function registerMemoryCollectionRoutes(app: Express): void {
  registerCollectionRoutes(app, {
    basePath: "/memory",
    noun: "memory",
    list: listMemoryEntries,
    exists: memoryExists,
    slugify: slugifyMemoryName,
    forget: forgetMemory,
    remember: rememberMemory,
    buildInput: (name, reqBody) => {
      if (typeof reqBody.content !== "string") {
        return { error: "content must be a string" };
      }

      return {
        name,
        description:
          typeof reqBody.description === "string" ? reqBody.description : "",
        body: reqBody.content,
      };
    },
  });
}
