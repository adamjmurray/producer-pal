// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { VERSION } from "#src/shared/config.ts";
import {
  answerOfflineCall,
  isHttpUrl,
  isSetupCall,
  type OfflineCall,
  remoteHost,
} from "../offline-call.ts";
import { SETUP_URL } from "../offline-setup-hints.ts";
import { forwardedSetupTimeout } from "../setup-call-timeout.ts";
import { responseText } from "./offline-add-producer-pal-test-helpers.ts";
import {
  expectNothingTouched,
  fakeOfflineDeps,
  noDevice,
} from "./offline-test-helpers.ts";

describe("isSetupCall", () => {
  it.each([
    "install-producer-pal",
    "install-remote-script",
    "add-producer-pal",
    "update-producer-pal",
  ])("is true for ppal-manage %s", (action) => {
    expect(isSetupCall("ppal-manage", { action }, true)).toBe(true);
  });

  it.each([
    ["undo", "ppal-manage", true],
    ["add-producer-pal", "ppal-manage", false],
    ["add-producer-pal", "ppal-read-live-set", true],
  ])("is false for %s on %s when offered is %s", (action, name, offered) => {
    expect(isSetupCall(name, { action }, offered)).toBe(false);
  });
});

const INSTALL = { action: "install-producer-pal" };

describe("forwardedSetupTimeout", () => {
  it("says an install that was sent may or may not have finished", () => {
    const text = responseText(forwardedSetupTimeout(INSTALL, true));

    expect(text).toContain("may or may not have finished");
    expect(text).toContain("Run it again");
  });

  it("says nothing was installed when the install was never sent", () => {
    const text = responseText(forwardedSetupTimeout(INSTALL, false));

    expect(text).toContain("nothing was installed");
    expect(text).not.toContain("may or may not");
  });

  it("answers the retired install name the same way", () => {
    const text = responseText(
      forwardedSetupTimeout({ action: "install-remote-script" }, false),
    );

    expect(text).toContain("nothing was installed");
  });

  it("words other setup actions without claiming an install", () => {
    const add = { action: "add-producer-pal" };

    expect(responseText(forwardedSetupTimeout(add, false))).toContain(
      "nothing was changed",
    );
    expect(responseText(forwardedSetupTimeout(add, true))).toContain(
      "Call ppal-connect to check",
    );
  });
});

describe("remoteHost", () => {
  it.each([
    "http://localhost:3350/mcp",
    "http://127.0.0.1:3350/mcp",
    "http://127.5.6.7/mcp",
    "http://[::1]:3350/mcp",
    "http://producer.localhost:3350/mcp",
    "https://localhost/mcp",
  ])("is null for the loopback URL %s", (url) => {
    expect(remoteHost(url)).toBeNull();
  });

  it.each([
    "http://0.0.0.0:3350/mcp",
    "http://0:3350/mcp",
    "http://[::]:3350/mcp",
    "http://localhost.:3350/mcp",
    "http://producer.localhost.:3350/mcp",
    "http://127.0.0.1.:3350/mcp",
    "http://[::ffff:127.0.0.1]:3350/mcp",
    "http://[::FFFF:7F12:3456]:3350/mcp",
    "http://[::ffff:0.0.0.0]:3350/mcp",
    "http://[0:0:0:0:0:0:0:1]:3350/mcp",
  ])("is null for another spelling of this machine, %s", (url) => {
    expect(remoteHost(url)).toBeNull();
  });

  it.each([
    "http://LOCALHOST:3350/mcp",
    "http://LocalHost.:3350/mcp",
    "http://127.1:3350/mcp",
    "http://0x7f.0.0.1:3350/mcp",
    "http://2130706433:3350/mcp",
    "http://[::FFFF:127.0.0.1]:3350/mcp",
  ])("is null for the odd or uppercase loopback spelling %s", (url) => {
    expect(remoteHost(url)).toBeNull();
  });

  it.each([
    ["http://192.168.1.20:3350/mcp", "192.168.1.20:3350"],
    ["http://studio-mac.local:3350/mcp", "studio-mac.local:3350"],
    ["https://example.com/mcp", "example.com"],
    ["http://studio.invalid:3350/mcp", "studio.invalid:3350"],
  ])("names the host of %s", (url, host) => {
    expect(remoteHost(url)).toBe(host);
  });

  it.each([
    ["http://localhost.evil.com:3350/mcp", "localhost.evil.com:3350"],
    ["http://127.0.0.1.nip.io:3350/mcp", "127.0.0.1.nip.io:3350"],
    ["http://localhost@evil.com/mcp", "evil.com"],
    ["http://127.0.0.1@evil.com:3350/mcp", "evil.com:3350"],
    ["http://[::ffff:c0a8:114]:3350/mcp", "[::ffff:c0a8:114]:3350"],
    ["http://[::2]:3350/mcp", "[::2]:3350"],
    ["http://0.0.0.1:3350/mcp", "0.0.0.1:3350"],
    ["http://128.0.0.1:3350/mcp", "128.0.0.1:3350"],
  ])("keeps the look-alike %s remote", (url, host) => {
    expect(remoteHost(url)).toBe(host);
  });

  it("is null for a URL the bridge refuses before it asks", () => {
    expect(remoteHost("not a url")).toBeNull();
    expect(remoteHost("localhost:3350/mcp")).toBeNull();
    expect(remoteHost("studio-mac.local:3350/mcp")).toBeNull();
  });
});

describe("isHttpUrl", () => {
  it.each(["http://localhost:3350/mcp", "https://example.com/mcp"])(
    "is true for %s",
    (url) => {
      expect(isHttpUrl(url)).toBe(true);
    },
  );

  it.each([
    "192.168.1.5:3350/mcp",
    "not a url",
    "localhost:3350/mcp",
    "studio-mac.local:3350/mcp",
    "ftp://example.com/mcp",
    "file:///tmp/mcp",
    "ws://localhost:3350/mcp",
  ])("is false for %s", (url) => {
    expect(isHttpUrl(url)).toBe(false);
  });
});

// A device on another computer: the answers must not look at this machine.
const HOST = "192.168.1.20:3350";

/**
 * @param name - The tool called
 * @param args - Its arguments
 * @param host - The device's host, or null for this machine
 * @param manageOffered - Whether the portal lists ppal-manage
 * @returns A call the device didn't answer
 */
function call(
  name: string,
  args: Record<string, unknown>,
  host: string | null = HOST,
  manageOffered = true,
): OfflineCall {
  return { name, args, manageOffered, connect: noDevice, remoteHost: host };
}

describe("answerOfflineCall for a device on another computer", () => {
  it.each([
    ["install-producer-pal", "install"],
    ["install-remote-script", "install"],
    ["add-producer-pal", "add"],
    ["update-producer-pal", "update"],
  ])(
    "refuses ppal-manage %s without touching this machine",
    async (action, verb) => {
      const deps = fakeOfflineDeps();
      const response = await answerOfflineCall(
        call("ppal-manage", { action, userLibrary: "/lib" }),
        deps,
      );
      const text = responseText(response);

      expect(response.isError).toBe(true);
      expect(text).toBe(
        `Error: This connector points at another computer (${HOST}), so it can't ${verb} Producer Pal there. That needs files copied on Live's computer. Run it from a connector on Live's computer, or set up the device by hand: ${SETUP_URL}`,
      );
      expectNothingTouched(deps);
    },
  );

  it.each([
    ["ppal-connect", {}, true],
    ["ppal-manage", { action: "undo" }, true],
    ["ppal-manage", { action: "redo" }, true],
    ["ppal-read-live-set", {}, false],
    ["ppal-manage", { action: "install-producer-pal" }, false],
  ])(
    "gives %s %j the remote guidance without touching this machine (ppal-manage offered: %s)",
    async (name, args, manageOffered) => {
      const deps = fakeOfflineDeps();
      const response = await answerOfflineCall(
        call(name, args, HOST, manageOffered),
        deps,
      );

      expect(response.isError).toBe(true);
      expect(responseText(response))
        .toBe(`❌ Producer Pal at ${HOST} didn't answer.

Check on Live's computer:
- Live 12.3+ is running with the Producer Pal device in the Set.
- "Allow other devices to connect" is on in the device's Setup tab.
- The address and port are right.
Setup help: ${SETUP_URL}

(Producer Pal ${VERSION})`);
      expectNothingTouched(deps);
    },
  );
});

describe("answerOfflineCall for this machine", () => {
  it("still looks at this machine for guidance", async () => {
    const deps = fakeOfflineDeps();
    const response = await answerOfflineCall(
      call("ppal-connect", {}, null),
      deps,
    );

    expect(responseText(response)).toContain("Cannot connect to Ableton Live.");
    expect(deps.ping).toHaveBeenCalled();
  });

  it("still answers install-producer-pal itself", async () => {
    const deps = fakeOfflineDeps();
    const response = await answerOfflineCall(
      call("ppal-manage", { action: "install-producer-pal" }, null),
      deps,
    );

    expect(responseText(response)).not.toContain("another computer");
    expect(deps.findUserLibrary).toHaveBeenCalled();
  });
});
