// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import http from "node:http";
import { type AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetHubForTesting } from "../../gen-ui-hub.ts";
import {
  connectWidgetsToSet,
  disconnectWidgetsFromSet,
} from "../../set-storage.ts";
import {
  createWidget,
  listWidgets,
  resetWidgetStoreForTesting,
} from "../../widget-store.ts";
import { textOf, widgetsIn } from "./set-storage-test-helpers.ts";

let server: http.Server;
let kept: string | null;
let saves: string[];
const previousPort = process.env.PPAL_REMOTE_SCRIPT_PORT;

/** A remote script that keeps one string, the way ui_widgets.py does. */
beforeEach(async () => {
  resetHubForTesting();
  resetWidgetStoreForTesting();
  kept = textOf([{ id: "w2", kind: "text", text: "from the Set" }]);
  saves = [];
  server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      if (request.url === "/ui-widgets/save") {
        kept = (
          JSON.parse(Buffer.concat(chunks).toString()) as { text: string }
        ).text;
        saves.push(kept);
      }

      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ ok: true, text: kept }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.PPAL_REMOTE_SCRIPT_PORT = String(
    (server.address() as AddressInfo).port,
  );
});

afterEach(async () => {
  disconnectWidgetsFromSet();
  resetWidgetStoreForTesting();
  await new Promise<void>((resolve) => server.close(() => resolve()));

  if (previousPort == null) {
    delete process.env.PPAL_REMOTE_SCRIPT_PORT;
  } else {
    process.env.PPAL_REMOTE_SCRIPT_PORT = previousPort;
  }
});

/** Wait for the one save, and expect the Set's widget first, then the new one. */
async function expectSetWidgetThenNew(): Promise<void> {
  await vi.waitFor(() => expect(saves).toHaveLength(1));
  expect(widgetsIn(saves[0]).map((w) => w.id)).toStrictEqual(["w2", "w3"]);
}

describe("widgets in the Live Set, through the real client", () => {
  it("loads the Set's list, then saves a new widget after it", async () => {
    connectWidgetsToSet();
    await vi.waitFor(() => expect(listWidgets()).toHaveLength(1));
    createWidget({ kind: "text", text: "new" });
    await expectSetWidgetThenNew();
  });

  it("merges a widget made before the list arrived", async () => {
    connectWidgetsToSet();
    createWidget({ kind: "text", text: "early" });
    await expectSetWidgetThenNew();
  });

  it("is safe to connect twice", async () => {
    connectWidgetsToSet();
    connectWidgetsToSet();
    createWidget({ kind: "text", text: "a" });
    await vi.waitFor(() => expect(saves).toHaveLength(1));
  });
});
