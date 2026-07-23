// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Locator, type Page, type Route, expect } from "@playwright/test";
import { BUILT_UI_PATH } from "./ui-test-helpers";

// Stubbed, CI-runnable harness for the `/context` webui app (the Project |
// Global | Instructions | Skills | Memory editor). Unlike the chat UI (whose
// state lives client-side in IndexedDB), every context tab round-trips through a
// REST endpoint, so this fulfils those endpoints with a small STATEFUL in-memory
// backend: a GET reflects the latest write, so "edit → save → reload persists"
// is a real assertion. One fresh `ContextBackend` per test closes over the route
// handlers; tests read it back to assert the server-side round-trip landed.

// Reuse the console-capture helpers from the live suite (same reason as
// ui-test-helpers — keep the two suites in lockstep and avoid a duplicate copy).
export {
  expectNoConsoleOutput,
  setupConsoleCapture,
} from "../webui/webui-test-helpers";

/** One stored memory, matching the `/memory` collection's entry shape. */
export interface FakeMemory {
  name: string;
  description: string;
  body: string;
}

/** One overridable skills fragment, matching the `/skill-overrides` shape. */
export interface FakeSkillSlot {
  name: string;
  title: string;
  description: string;
  builtIn: string;
  override: string;
  drifted: boolean;
  provenance: { producerPalVersion: string } | null;
}

/** The in-memory backend state behind the five `/context` REST endpoints. */
export interface ContextBackend {
  /** Project context blob (via `/config` `projectContext`). */
  projectContext: string;
  /** Machine-global context (`/global-context`). */
  globalContext: string;
  /** Custom system prompt (`/system-prompt`); "" means use the built-in. */
  systemPrompt: string;
  /** Overridable skills fragments (`/skill-overrides`). */
  slots: FakeSkillSlot[];
  /** LLM-managed memory collection (`/memory`). */
  memories: FakeMemory[];
}

/**
 * Build a fresh backend with sensible defaults (everything empty, two skills
 * slots so the Skills dropdown has options). Override any field via `overrides`.
 * @param overrides - Fields to override on the default backend
 * @returns A fresh, mutable backend
 */
export function makeContextBackend(
  overrides: Partial<ContextBackend> = {},
): ContextBackend {
  return {
    projectContext: "",
    globalContext: "",
    systemPrompt: "",
    slots: [
      makeSlot("slot-one", "Built-in fragment one."),
      makeSlot("slot-two", "Built-in fragment two."),
    ],
    memories: [],
    ...overrides,
  };
}

/**
 * Full setup for a stubbed `/context` test: build a fresh backend, install its
 * route stubs, load the `/context` bundle, and wait for the tab strip to render.
 * @param page - Playwright page
 * @param overrides - Initial backend field overrides
 * @returns The mutable backend, for reading back after writes
 */
export async function setupContextTest(
  page: Page,
  overrides: Partial<ContextBackend> = {},
): Promise<ContextBackend> {
  const state = makeContextBackend(overrides);

  await installContextStubs(page, state);
  await page.goto("/context");
  // The Project tab is active by default; the strip's presence means the
  // ContextTabs shell (and all five hooks) mounted and loaded.
  await expect(
    page.getByRole("button", { name: "Global", exact: true }),
  ).toBeVisible();

  return state;
}

/**
 * Install all `/context` route stubs against the given backend. Must run before
 * the first navigation. The document (`/context`) is served from the built
 * bundle; the five data endpoints are stateful (see the module comment).
 * @param page - Playwright page
 * @param state - The mutable backend the handlers read/write
 */
export async function installContextStubs(
  page: Page,
  state: ContextBackend,
): Promise<void> {
  await page.route(
    (url) => url.pathname === "/context",
    (route) =>
      route.fulfill({
        path: BUILT_UI_PATH,
        contentType: "text/html; charset=utf-8",
      }),
  );
  await page.route(
    (url) => url.pathname === "/config",
    (route) => handleConfig(route, state),
  );
  await page.route(
    (url) => url.pathname === "/global-context",
    (route) => handleContentDoc(route, state, "globalContext"),
  );
  await page.route(
    (url) => url.pathname === "/system-prompt",
    (route) => handleContentDoc(route, state, "systemPrompt"),
  );
  await page.route(
    (url) => url.pathname === "/skill-overrides",
    (route) => fulfillJson(route, { slots: state.slots }),
  );
  await page.route(
    (url) => url.pathname.startsWith("/skill-overrides/"),
    (route) => handleSkillSlot(route, state),
  );
  await page.route(
    (url) => url.pathname === "/memory",
    (route) => fulfillJson(route, { entries: state.memories }),
  );
  await page.route(
    (url) => url.pathname.startsWith("/memory/"),
    (route) => handleMemoryEntry(route, state),
  );
}

/**
 * Click a context editor tab by its label.
 * @param page - Playwright page
 * @param label - The tab to open
 */
export async function openContextTab(
  page: Page,
  label: "Project" | "Global" | "Instructions" | "Skills" | "Memory",
): Promise<void> {
  await page.getByRole("button", { name: label, exact: true }).click();
}

/**
 * The primary editable CodeMirror region on screen. For the plain doc tabs it is
 * the only editor; in override mode (Instructions/Skills) it is the editable
 * override pane, rendered before any revealed built-in reference.
 * @param page - Playwright page
 * @returns Locator for the primary editor's content region
 */
export function primaryEditor(page: Page): Locator {
  return page.locator(".cm-content").first();
}

/**
 * Type into the primary editor. CodeMirror only observes real keystrokes (not
 * `fill()`), so this focuses and presses each character; `replace` select-alls
 * first so the typed text fully replaces the seeded content.
 * @param page - Playwright page
 * @param text - Text to type
 * @param replace - Select all before typing (replace rather than append)
 */
export async function typeInPrimaryEditor(
  page: Page,
  text: string,
  replace = false,
): Promise<void> {
  const editor = primaryEditor(page);

  await editor.click();
  if (replace) await page.keyboard.press("ControlOrMeta+a");
  await editor.pressSequentially(text);
}

/**
 * Fork the current built-in into an editable override (the "Customize" button on
 * the Instructions / Skills tabs) and wait for the editable pane to appear (the
 * "Reset to default" affordance only shows once there is an override).
 * @param page - Playwright page
 */
export async function customizeOverride(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Customize" }).click();
  await expect(
    page.getByRole("button", { name: "Reset to default" }),
  ).toBeVisible();
}

// --- Endpoint handlers below main exports ---

/** Standard config fields the webui reads (only `projectContext` is exercised). */
const BASE_CONFIG = {
  smallModelMode: false,
  liveApiEnabled: false,
  liveApiForcedOn: false,
};

/**
 * `/config`: GET echoes the config (incl. project `projectContext`); a partial
 * POST merges `projectContext` and echoes the full config.
 * @param route - The intercepted route
 * @param state - The mutable backend
 */
async function handleConfig(
  route: Route,
  state: ContextBackend,
): Promise<void> {
  if (route.request().method() === "POST") {
    const body = readJsonBody(route);

    if (typeof body.projectContext === "string") {
      state.projectContext = body.projectContext;
    }
  }

  await fulfillJson(route, {
    ...BASE_CONFIG,
    projectContext: state.projectContext,
  });
}

/**
 * A single-content markdown doc endpoint (`/global-context`, `/system-prompt`):
 * GET echoes `{content}`; PUT stores the body's content and echoes it back.
 * @param route - The intercepted route
 * @param state - The mutable backend
 * @param key - Which backend field this endpoint stores
 */
async function handleContentDoc(
  route: Route,
  state: ContextBackend,
  key: "globalContext" | "systemPrompt",
): Promise<void> {
  if (route.request().method() === "PUT") {
    state[key] = readJsonBody(route).content ?? "";
  }

  await fulfillJson(route, { content: state[key] });
}

/**
 * `/skill-overrides/:slot`: PUT stores that slot's override; DELETE resets it to
 * the built-in. Both echo the updated slot.
 * @param route - The intercepted route
 * @param state - The mutable backend
 */
async function handleSkillSlot(
  route: Route,
  state: ContextBackend,
): Promise<void> {
  const name = decodeURIComponent(pathTail(route, "/skill-overrides/"));
  const slot = state.slots.find((s) => s.name === name);

  if (slot == null) {
    await fulfillJson(route, { error: `Unknown slot "${name}"` }, 404);

    return;
  }

  const method = route.request().method();

  if (method === "PUT") slot.override = readJsonBody(route).content ?? "";
  else if (method === "DELETE") slot.override = "";

  await fulfillJson(route, { slot });
}

/**
 * `/memory/:name` (and `/memory/:name/rename`): PUT create/overwrite (409 on a
 * create-only name collision), PUT rename moves an entry to a new slug, DELETE
 * removes one. Writes echo `{entry}`; the slug is derived like the real server.
 * @param route - The intercepted route
 * @param state - The mutable backend
 */
async function handleMemoryEntry(
  route: Route,
  state: ContextBackend,
): Promise<void> {
  const tail = pathTail(route, "/memory/");
  const isRename = tail.endsWith("/rename");
  const name = decodeURIComponent(
    isRename ? tail.slice(0, -"/rename".length) : tail,
  );
  const method = route.request().method();

  if (method === "DELETE") {
    state.memories = state.memories.filter((m) => m.name !== name);
    await fulfillJson(route, {});

    return;
  }

  if (method === "PUT") {
    await putMemory(route, state, name, isRename);

    return;
  }

  await fulfillJson(route, { error: "Method not allowed" }, 405);
}

/**
 * Handle a memory PUT (create/overwrite or rename), rejecting a name collision.
 * @param route - The intercepted route
 * @param state - The mutable backend
 * @param name - The (decoded) current entry name from the URL
 * @param isRename - Whether this is the `/rename` variant
 */
async function putMemory(
  route: Route,
  state: ContextBackend,
  name: string,
  isRename: boolean,
): Promise<void> {
  const body = readJsonBody(route);
  const slug = slugify(isRename ? (body.newName ?? "") : name);
  const collidesWith = isRename ? slug !== name : Boolean(body.createOnly);

  if (collidesWith && state.memories.some((m) => m.name === slug)) {
    await fulfillJson(
      route,
      { error: `A memory named "${slug}" already exists.` },
      409,
    );

    return;
  }

  const entry: FakeMemory = {
    name: slug,
    description: body.description ?? "",
    body: body.content ?? "",
  };
  const priorName = isRename ? name : slug;
  const idx = state.memories.findIndex((m) => m.name === priorName);

  if (idx >= 0) state.memories[idx] = entry;
  else state.memories.push(entry);

  await fulfillJson(route, { entry });
}

/**
 * Build a default skills slot with an empty override.
 * @param name - The slot's stable name
 * @param builtIn - The built-in fragment body
 * @returns A fresh slot
 */
function makeSlot(name: string, builtIn: string): FakeSkillSlot {
  return {
    name,
    title: name,
    description: `Fragment ${name}.`,
    builtIn,
    override: "",
    drifted: false,
    provenance: null,
  };
}

/** The parsed shape of the JSON bodies these endpoints receive. */
interface RequestBody {
  content?: string;
  projectContext?: string;
  description?: string;
  newName?: string;
  createOnly?: boolean;
}

/**
 * Parse a route's request body as JSON (the writes here always send one).
 * @param route - The intercepted route
 * @returns The parsed body
 */
function readJsonBody(route: Route): RequestBody {
  return (route.request().postDataJSON() ?? {}) as RequestBody;
}

/**
 * The pathname segment after a known prefix (e.g. the slot/memory name).
 * @param route - The intercepted route
 * @param prefix - The path prefix to strip
 * @returns The remaining path tail
 */
function pathTail(route: Route, prefix: string): string {
  return new URL(route.request().url()).pathname.slice(prefix.length);
}

/**
 * Slugify a memory name the way the real store does (lowercase, non-alphanumeric
 * runs to single hyphens, trimmed).
 * @param name - The raw name
 * @returns The slug
 */
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Fulfil a route with a JSON body.
 * @param route - The intercepted route
 * @param body - The response body (JSON-serialized)
 * @param status - HTTP status (default 200)
 */
async function fulfillJson(
  route: Route,
  body: unknown,
  status = 200,
): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}
