// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Page, type Route, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";

// Reuse the console-capture helpers from the live suite so the two suites stay
// in lockstep (and to avoid a duplicate copy tripping the e2e duplication gate).
export {
  expectNoConsoleOutput,
  setupConsoleCapture,
} from "../webui/webui-test-helpers";

/**
 * Filesystem path to the built single-file UI bundle. The same bundle serves
 * both `/chat` and `/context` (main.tsx branches on the pathname), so the
 * context suite fulfills its document route from this too (see
 * ./context-test-helpers.ts).
 */
export const BUILT_UI_PATH = fileURLToPath(
  new URL("../../max-for-live-device/chat-ui.html", import.meta.url),
);

/** A conversation record shaped like the IndexedDB store expects. Mirrors the
 * fields read by listConversations(); newer fields missing here are filled by
 * the app's normalizeLegacyRecord() on read. */
export interface SeedConversation {
  id: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
  bookmarked: boolean;
  provider: string | null;
  model: string | null;
  modelLabel: string | null;
  sessionType: "text" | "voice";
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  /** Branch linkage (edit/retry forks); mirrors ConversationRecord. Omitted on
   * non-forked records. */
  forkParentId?: string;
  forkedAtIndex?: number;
}

/**
 * Build a conversation seed record with sensible defaults (Gemini text chat,
 * unbookmarked, no messages). Override any field via `overrides`.
 * @param overrides - Fields to override on the default record
 * @returns A full seed record ready for {@link seedConversations}
 */
export function makeConversation(
  overrides: Partial<SeedConversation> & Pick<SeedConversation, "id">,
): SeedConversation {
  return {
    title: null,
    createdAt: 1,
    updatedAt: 1,
    bookmarked: false,
    provider: "gemini",
    model: "gemini-3.6-flash",
    modelLabel: "Gemini 3.6 Flash",
    sessionType: "text",
    messages: [],
    ...overrides,
  };
}

/**
 * Full setup for a stubbed UI test: install network stubs + a configured-
 * settings localStorage bypass, load the built chat UI, seed IndexedDB with the
 * given conversations, reload so the app reads them, and open the history panel.
 * @param page - Playwright page
 * @param conversations - Conversation records to seed
 */
export async function setupUiTest(
  page: Page,
  conversations: SeedConversation[],
): Promise<void> {
  await installStubs(page);
  await page.goto("/chat-ui.html");
  await seedConversations(page, conversations);
  await page.reload();
  await openHistoryPanel(page);
}

/**
 * Install all route stubs and the settings-gate bypass. Must run before the
 * first navigation (addInitScript applies to every subsequent document).
 * @param page - Playwright page
 */
export async function installStubs(page: Page): Promise<void> {
  // Serve the built single-file UI without a static server.
  await page.route("**/chat-ui.html", (route) =>
    route.fulfill({
      path: BUILT_UI_PATH,
      contentType: "text/html; charset=utf-8",
    }),
  );

  // Stub the MCP endpoint so the on-mount connect/listTools succeeds and the
  // status reads "connected" (no connection-refused console noise).
  await page.route("**/mcp", fulfillMcp);

  // Server config poll — return a benign, all-off config.
  await page.route("**/config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        smallModelMode: false,
        liveApiEnabled: false,
        liveApiForcedOn: false,
      }),
    }),
  );

  // Custom system prompt read (the chat mounts useSystemPrompt) — empty
  // means "use the built-in instruction", the default state under test.
  await page.route("**/system-prompt", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ content: "" }),
    }),
  );

  // GitHub release check (useUpdateCheck) — empty body => no update banner, and
  // keeps the test offline/deterministic.
  await page.route("https://api.github.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    }),
  );

  // Bypass the first-run settings screen: mark settings configured with a dummy
  // Gemini (text) provider so the app routes straight to the chat screen. No
  // real key is needed — the conversation panel renders regardless.
  await page.addInitScript(() => {
    localStorage.setItem("producer_pal_settings_configured", "true");
    localStorage.setItem("producer_pal_current_provider", "gemini");
    localStorage.setItem(
      "producer_pal_provider_gemini",
      JSON.stringify({
        apiKey: "",
        model: "gemini-3.6-flash",
        thinking: "Default",
        temperature: 1.0,
      }),
    );
  });
}

/**
 * Open the conversation history side panel and wait for it to render.
 * @param page - Playwright page
 */
export async function openHistoryPanel(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: "Toggle conversation history" })
    .click();
  await expect(page.getByTestId("conversation-item").first()).toBeVisible();
}

/**
 * Seed the conversations IndexedDB with the given records. Creates the object
 * store if the app hasn't already (idempotent with the app's own open).
 * @param page - Playwright page
 * @param conversations - Conversation records to write
 */
export async function seedConversations(
  page: Page,
  conversations: SeedConversation[],
): Promise<void> {
  await page.evaluate(async (records) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("producer-pal-conversations", 1);

      req.onupgradeneeded = () => {
        const db = req.result;

        if (!db.objectStoreNames.contains("conversations")) {
          const store = db.createObjectStore("conversations", {
            keyPath: "id",
          });

          store.createIndex("updatedAt", "updatedAt");
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("conversations", "readwrite");

        for (const record of records) {
          tx.objectStore("conversations").put(record);
        }

        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, conversations);
}

/**
 * Read all conversation records back out of IndexedDB to assert persistence.
 * @param page - Playwright page
 * @returns All stored conversation records
 */
export async function readConversationsFromDb(
  page: Page,
): Promise<SeedConversation[]> {
  return page.evaluate(async () => {
    return new Promise<SeedConversation[]>((resolve, reject) => {
      const req = indexedDB.open("producer-pal-conversations", 1);

      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("conversations", "readonly");
        const getAll = tx.objectStore("conversations").getAll();

        getAll.onsuccess = () => {
          db.close();
          resolve(getAll.result as SeedConversation[]);
        };
        getAll.onerror = () => reject(getAll.error);
      };
      req.onerror = () => reject(req.error);
    });
  });
}

// --- Helpers below main exports ---

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: { protocolVersion?: string };
}

const STUB_TOOLS = [
  {
    name: "ppal-connect",
    title: "Producer Pal: Connect",
    description: "Stubbed tool for UI tests.",
    inputSchema: { type: "object", properties: {} },
  },
];

/**
 * Fulfill MCP transport requests with canned JSON-RPC responses so the
 * StreamableHTTP client connects and lists tools without a real server.
 * @param route - The intercepted route
 */
async function fulfillMcp(route: Route): Promise<void> {
  const request = route.request();
  const method = request.method();

  // The SDK opens a GET SSE stream and may DELETE the session on close. The
  // real device returns 405 on GET; either is fine here (no request payload).
  if (method === "GET") {
    await route.fulfill({ status: 405, contentType: "text/plain", body: "" });

    return;
  }

  if (method === "DELETE") {
    await route.fulfill({ status: 202, body: "" });

    return;
  }

  const body = request.postDataJSON() as JsonRpcMessage | JsonRpcMessage[];
  const messages = Array.isArray(body) ? body : [body];
  const requests = messages.filter((m) => m?.id != null && m.method);

  // Pure notifications (e.g. notifications/initialized) carry no id — ack them.
  if (requests.length === 0) {
    await route.fulfill({ status: 202, body: "" });

    return;
  }

  const responses = requests.map(buildRpcResponse);

  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "mcp-session-id": "ui-test-session" },
    body: JSON.stringify(Array.isArray(body) ? responses : responses[0]),
  });
}

/**
 * Build a JSON-RPC result for a single request message.
 * @param message - The JSON-RPC request
 * @returns A JSON-RPC response object
 */
function buildRpcResponse(message: JsonRpcMessage): unknown {
  if (message.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: message.params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "producer-pal-ui-test-stub", version: "0.0.0" },
      },
    };
  }

  if (message.method === "tools/list") {
    return { jsonrpc: "2.0", id: message.id, result: { tools: STUB_TOOLS } };
  }

  return { jsonrpc: "2.0", id: message.id, result: {} };
}
