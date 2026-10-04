// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { connectMcpClient as connect } from "#src/mcp-server/tests/server/mcp-client-test-helpers.ts";
import { LIVE_API_OPERATION_ALIASES } from "#src/tools/advanced/live-api-operations.ts";
import {
  LIBRARY_SORT_ALIASES,
  LIBRARY_SOURCE_ALIASES,
} from "#src/tools/session/library-query-schema.ts";
import { resolveToolSchema } from "#src/tools/shared/tool-framework/resolve-tool-schema.ts";
import { TOOL_DEF_CASES, TOOL_DEFS } from "./tool-defs-test-helpers.ts";

// Every enum value Producer Pal defines is kebab-case; old spellings stay
// accepted but unpublished. Strings Live or the plugin industry own keep their
// spelling, and are listed here by param name.
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const OLD_SPELLINGS =
  /listTags|listCategories|listPlugins|findSimilar|findDuplicates|searchBatch|use_count|mod_date|sampleFolder|set_property|get_property|set_path|set_mode|set_id|call_method|getProperty|getChildIds|getColor|setColor/;
const LIVES_OWN_SPELLING = ["quantizeGrid", "format"];

/**
 * Collects enum and const strings that are not kebab-case.
 * @param node - A JSON Schema node
 * @param path - Where the node sits, for the failure message
 * @param out - Offending values, as "path: value"
 */
function collectNonKebab(node: unknown, path: string, out: string[]): void {
  if (node == null || typeof node !== "object") {
    return;
  }

  const record = node as Record<string, unknown>;
  const values = (record.enum ??
    (record.const == null ? [] : [record.const])) as unknown[];

  for (const value of values) {
    const exempt = LIVES_OWN_SPELLING.some((name) => path.endsWith(`.${name}`));

    if (
      typeof value === "string" &&
      value !== "*" &&
      !exempt &&
      !KEBAB.test(value)
    ) {
      out.push(`${path}: ${value}`);
    }
  }

  for (const [key, child] of Object.entries(record)) {
    collectNonKebab(child, `${path}.${key}`, out);
  }
}

describe("tool enum values", () => {
  it.each(TOOL_DEF_CASES)("%s publishes kebab-case values", (_, def, mode) => {
    const { published } = resolveToolSchema(def.toolOptions.inputSchema, mode);
    const offenders: string[] = [];

    collectNonKebab(
      z.toJSONSchema(z.object(published)),
      def.toolName,
      offenders,
    );

    expect(offenders).toStrictEqual([]);
  });

  describe("old spellings", () => {
    /**
     * The schema a tool validates calls against.
     * @param toolName - The tool
     * @returns Its param schemas, hidden ones included
     */
    function validating(toolName: string): Record<string, z.ZodType> {
      const def = TOOL_DEFS.find((d) => d.toolName === toolName);

      return resolveToolSchema(def!.toolOptions.inputSchema, {}).validating;
    }

    it("ppal-library actions map to their kebab value", () => {
      const schema = z.object(validating("ppal-library"));
      const actions = {
        listTags: "list-tags",
        listCategories: "list-categories",
        listPlugins: "list-plugins",
        findSimilar: "find-similar",
        findDuplicates: "find-duplicates",
        searchBatch: "search-batch",
      };

      for (const [old, kebab] of Object.entries(actions)) {
        expect(schema.parse({ action: old }).action).toBe(kebab);
      }
    });

    it("ppal-library source and sort map to their kebab value", () => {
      const schema = z.object(validating("ppal-library"));

      for (const [old, kebab] of Object.entries(LIBRARY_SOURCE_ALIASES)) {
        expect(schema.parse({ source: old }).source).toBe(kebab);
      }

      for (const [old, kebab] of Object.entries(LIBRARY_SORT_ALIASES)) {
        expect(schema.parse({ sort: old }).sort).toBe(kebab);
      }

      // Inside a `searches` entry too.
      const parsed = schema.parse({
        searches: [{ source: "sampleFolder", sort: "use_count" }],
      });

      expect(parsed.searches).toStrictEqual([
        expect.objectContaining({ source: "sample-folder", sort: "use-count" }),
      ]);
    });

    it("ppal-live-api operations map to their kebab value", () => {
      const schema = z.object(validating("ppal-live-api"));

      for (const [old, kebab] of Object.entries(LIVE_API_OPERATION_ALIASES)) {
        const parsed = schema.parse({ operations: [{ type: old }] });

        expect(parsed.operations).toStrictEqual([{ type: kebab }]);
      }
    });

    it.each([{}, { smallModelMode: true }])(
      "are not published, or named in a refusal, through the MCP SDK (%j)",
      async (profile) => {
        const { client } = await connect(profile);
        const { tools } = await client.listTools();
        const published = JSON.stringify(
          tools.filter((t) =>
            ["ppal-library", "ppal-live-api"].includes(t.name),
          ),
        );

        expect(published).not.toMatch(OLD_SPELLINGS);
        expect(published).not.toContain("search-batch");
      },
    );

    it("a refusal lists only the published values", async () => {
      const { client } = await connect();

      const refusal = async (
        name: string,
        args: Record<string, unknown>,
      ): Promise<string> => {
        const result = (await client.callTool({ name, arguments: args })) as {
          content: { text: string }[];
        };

        return result.content[0]?.text ?? "";
      };

      const source = await refusal("ppal-library", { source: "foo" });
      const action = await refusal("ppal-library", { action: "foo" });
      const type = await refusal("ppal-live-api", {
        operations: [{ type: "foo" }],
      });

      expect(source).toContain(
        'Invalid option: expected one of "sample-folder"|"user"|"pack"|"builtin"|"cloud"|"plugin"',
      );
      expect(action).toContain(
        'Invalid option: expected one of "search"|"list-tags"|"list-categories"|"list-plugins"|"find-similar"|"find-duplicates"',
      );
      expect(type).toContain('"set-property"');

      for (const text of [source, action, type]) {
        expect(text).not.toMatch(OLD_SPELLINGS);
        expect(text).not.toContain("search-batch");
      }
    });

    it("a small model's refusal leaves out trimmed values and their aliases", async () => {
      const { client } = await connect({ smallModelMode: true });
      const result = (await client.callTool({
        name: "ppal-library",
        arguments: { action: "findSimilar" },
      })) as { content: { text: string }[] };
      const text = result.content[0]?.text ?? "";

      expect(text).toContain(
        'Invalid option: expected one of "search"|"list-tags"',
      );
      expect(text).not.toContain("search-batch");
      expect(text).not.toMatch(OLD_SPELLINGS);
    });
  });
});
