// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The generative-UI app host: an AI-written app runs in a sandboxed iframe with
// its own opaque origin and no network. Only a real browser enforces either, so
// the app probes its own limits and reports them by writing to its own DOM.
import { type Page, expect, test } from "@playwright/test";
import { installStubs } from "../ui-test-helpers";

const SOURCE_KEY = "producer_pal_gen_app_source";

// Replaces the stored source and tells the panel, as the AI will later.
async function replaceApp(page: Page, source: string): Promise<void> {
  await page.evaluate(
    ([key, html]) => {
      sessionStorage.setItem(key as string, html as string);
      window.dispatchEvent(new Event("producer_pal_gen_app_source_changed"));
    },
    [SOURCE_KEY, source],
  );
}

const REMOTE_URL = "http://localhost/api/probe-from-app";

// One self-contained document, as the AI would write it: inline style, inline
// script, and every result written into the page.
const APP = `<!doctype html>
<html>
<head><style>#ran { color: rgb(0, 128, 0); }</style></head>
<body>
<p id="ran">booting</p>
<pre id="out"></pre>
<script>
  const results = {};
  const attempt = (name, fn) => {
    try { results[name] = String(fn()); } catch (e) { results[name] = "blocked:" + e.name; }
  };
  document.addEventListener("securitypolicyviolation", (e) => {
    results.violation = e.violatedDirective;
  });
  attempt("parentDocument", () => window.parent.document.title);
  attempt("localStorage", () => localStorage.length);
  attempt("cookie", () => document.cookie);
  attempt("origin", () => location.origin);
  attempt("popup", () => window.open("about:blank"));
  // CSP doesn't cover WebRTC, so the host removes its constructors.
  attempt("rtc", () => typeof RTCPeerConnection + typeof window.webkitRTCPeerConnection + typeof RTCDataChannel);
  attempt("rtcNew", () => new RTCPeerConnection());
  fetch(${JSON.stringify(REMOTE_URL)})
    .then(() => { results.fetch = "allowed"; }, () => { results.fetch = "blocked"; })
    // The violation event is queued after the fetch fails.
    .then(() => new Promise((done) => setTimeout(done, 50)))
    .then(() => {
      document.getElementById("ran").textContent = "ran";
      document.getElementById("out").textContent = JSON.stringify(results);
    });
</script>
</body>
</html>`;

async function openGenPanelWithApp(
  page: Page,
  appSource = APP,
): Promise<number[]> {
  const remoteRequests: number[] = [];

  await installStubs(page);

  await page.route("**/api/ui/widgets", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        epoch: "e",
        version: 0,
        widgets: [],
        sync: { mode: "writes-only", detail: "" },
      }),
    }),
  );
  await page.route("**/api/ui/events", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: ": quiet\n\n",
    }),
  );
  await page.route("**/api/probe-from-app*", (route) => {
    remoteRequests.push(Date.now());

    return route.fulfill({ status: 200, body: "secret" });
  });

  // Init scripts also run inside the (opaque-origin) app frame, where storage
  // throws; only the top page needs the source.
  await page.addInitScript(
    ([key, source]) => {
      if (window === window.top) {
        sessionStorage.setItem(key as string, source as string);
      }
    },
    [SOURCE_KEY, appSource],
  );

  await page.goto("/chat-ui.html?view=gen");

  return remoteRequests;
}

test.describe("Generative UI app host (stubbed backend)", () => {
  test("runs the app's script and style", async ({ page }) => {
    await openGenPanelWithApp(page);

    const app = page.frameLocator("[data-testid=gen-app-frame]");

    await expect(app.locator("#ran")).toHaveText("ran");
    await expect(app.locator("#ran")).toHaveCSS("color", "rgb(0, 128, 0)");
  });

  test("keeps the app out of the host page and off the network", async ({
    page,
  }) => {
    const remoteRequests = await openGenPanelWithApp(page);
    const app = page.frameLocator("[data-testid=gen-app-frame]");

    await expect(app.locator("#ran")).toHaveText("ran");

    const results = JSON.parse(
      (await app.locator("#out").textContent()) ?? "{}",
    ) as Record<string, string>;

    // Opaque origin: the host page, its storage and cookies are unreachable.
    expect(results.parentDocument).toBe("blocked:SecurityError");
    expect(results.localStorage).toBe("blocked:SecurityError");
    expect(results.cookie).toBe("blocked:SecurityError");
    expect(results.origin).toBe("null");
    // No popups from the sandbox.
    expect(results.popup).toBe("null");
    // The policy stops the request before it leaves the page.
    expect(results.fetch).toBe("blocked");
    expect(results.rtc).toBe("undefinedundefinedundefined");
    expect(results.rtcNew).toBe("blocked:ReferenceError");
    expect(results.violation).toBe("connect-src");
    expect(remoteRequests).toEqual([]);
  });

  test("can't send data out by navigating its own frame", async ({ page }) => {
    // The app's policy can't stop this; the host page's frame-src does.
    const blocked = page.waitForEvent("console", (msg) =>
      msg.text().includes("frame-src"),
    );
    const remoteRequests = await openGenPanelWithApp(
      page,
      `<p>leaving</p><script>location.href = ${JSON.stringify(REMOTE_URL + "?data=secret")};</script>`,
    );

    await blocked;
    expect(remoteRequests).toEqual([]);
  });

  test("swaps the app's source in place while the chat stays mounted", async ({
    page,
  }) => {
    await openGenPanelWithApp(page);

    const app = page.frameLocator("[data-testid=gen-app-frame]");
    const input = page.getByRole("textbox", { name: "Message" });

    await expect(app.locator("#ran")).toHaveText("ran");
    await input.evaluate((el) => el.setAttribute("data-mounted", "same"));

    await replaceApp(page, "<p id='second'>second app</p>");

    await expect(app.locator("#second")).toHaveText("second app");
    await expect(app.locator("#ran")).toHaveCount(0);
    await expect(input).toHaveAttribute("data-mounted", "same");
    await expect(page.getByTestId("gen-app-frame")).toHaveCount(1);
  });

  // Known gap: a frame the app creates gets a fresh window, and WebRTC with it.
  test.fixme("can't reach WebRTC through a frame it creates", async ({
    page,
  }) => {
    await openGenPanelWithApp(
      page,
      `<body><p id="child">waiting</p><script>
        addEventListener("message", (e) => { document.getElementById("child").textContent = e.data; });
        const frame = document.createElement("iframe");
        frame.srcdoc = "<script>parent.postMessage(typeof RTCPeerConnection, '*')<\\/script>";
        document.body.appendChild(frame);
      </script>`,
    );

    await expect(
      page.frameLocator("[data-testid=gen-app-frame]").locator("#child"),
    ).toHaveText("undefined");
  });
});
