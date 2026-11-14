// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  type ConfigOutlet,
  emitConfigOutlets,
} from "../../helpers/http/config/config-outlets.ts";

interface Config {
  x: number;
}

function outlet(
  field: string,
  deviceKey: string,
  send: () => Promise<void>,
): ConfigOutlet<Config> {
  return { field, configKey: "x", deviceKey, send };
}

const lost = (): Promise<void> => Promise.reject(new Error("no answer"));
const delivered = (): Promise<void> => Promise.resolve();

describe("emitConfigOutlets", () => {
  it("keeps a setting that another field's send landed on the device", async () => {
    const config = { x: 2 };
    const failures = await emitConfigOutlets(config, { x: 1 }, [
      outlet("a", "deviceA", lost),
      outlet("b", "deviceB", delivered),
    ]);

    expect(failures).toStrictEqual({ fields: ["a"], unrestored: [] });
    expect(config.x).toBe(2);
  });

  it("leaves a setting another request changed meanwhile", async () => {
    const config = { x: 2 };
    const failures = await emitConfigOutlets(config, { x: 1 }, [
      outlet("a", "deviceA", () => {
        config.x = 3;

        return lost();
      }),
    ]);

    expect(failures).toStrictEqual({ fields: ["a"], unrestored: [] });
    expect(config.x).toBe(3);
  });

  it("rolls a setting back when no send for it landed", async () => {
    const config = { x: 2 };

    await emitConfigOutlets(config, { x: 1 }, [outlet("a", "deviceA", lost)]);

    expect(config.x).toBe(1);
  });
});
