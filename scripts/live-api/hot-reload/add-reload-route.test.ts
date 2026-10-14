// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addReloadRoute } from "./add-reload-route.ts";

const ROUTES_PY = 'ROUTES = {"/ping": None}\nPOST_ONLY = ("/load",)\n';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "add-reload-route-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("addReloadRoute", () => {
  it("registers /reload as a POST-only route, without the license header", () => {
    writeFileSync(join(dir, "routes.py"), ROUTES_PY);

    addReloadRoute(dir);

    const routes = readFileSync(join(dir, "routes.py"), "utf8");

    expect(routes.startsWith(ROUTES_PY)).toBe(true);
    expect(routes).toContain("from .hot_reload import reload_route");
    expect(routes).toContain('ROUTES["/reload"] = _reload_route');
    expect(routes).toContain('POST_ONLY = POST_ONLY + ("/reload",)');
    expect(routes).not.toContain("Copyright");
  });

  it("fails loudly when routes.py no longer defines ROUTES and POST_ONLY", () => {
    writeFileSync(join(dir, "routes.py"), "HANDLERS = {}\n");

    expect(() => addReloadRoute(dir)).toThrow(
      /no longer defines ROUTES and POST_ONLY/,
    );
  });
});
