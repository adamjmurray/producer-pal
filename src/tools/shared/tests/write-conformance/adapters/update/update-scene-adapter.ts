// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { updateScene } from "#src/tools/scene/update-scene.ts";
import { registerScenes } from "../../write-conformance-fixtures.ts";
import { updateByIdAdapter } from "./update-by-id-adapter.ts";

export const updateSceneAdapter = updateByIdAdapter({
  tool: "ppal-update-scene",
  run: (args) => updateScene(args),
  prefix: "s",
  nouns: "scenes",
  register: registerScenes,
  lateProp: { name: "color", value: "#ff0000" },
  refusedProp: { name: "timeSignature", value: "9" },
});
