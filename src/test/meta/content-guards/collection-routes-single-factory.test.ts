// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  findSourceFiles,
  projectRoot,
} from "#src/test/helpers/meta-test-helpers.ts";

// Memory and custom skills were once a verbatim read/remember/forget/list
// quartet each; they share rpc/collection-node-routes.ts now. A `.forget` route
// registered anywhere else means a third copy is growing — bind the factory
// instead, or widen it if the new collection genuinely needs something else.
const FACTORY = "src/mcp-server/rpc/collection-node-routes.ts";
const FORGET_ROUTE = /registerNodeRoute\([^)]*\.forget/;

describe("collection node routes", () => {
  it("registers the forget route from the shared factory only", () => {
    const registrars = findSourceFiles(path.join(projectRoot, "src"), true)
      .filter((file) => FORGET_ROUTE.test(fs.readFileSync(file, "utf8")))
      .map((file) => path.relative(projectRoot, file));

    expect(
      registrars,
      "a collection's read/remember/forget/list quartet belongs in makeCollectionNodeRoutes",
    ).toStrictEqual([FACTORY]);
  });
});
