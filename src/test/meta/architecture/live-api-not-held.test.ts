// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  findSourceFiles,
  projectRoot,
  repoPath,
  throwOnFileViolations,
} from "#src/test/helpers/meta-test-helpers.ts";

// Nothing may hold a LiveAPI across requests: released objects are pooled and
// reused, so a stale reference silently points at a different Live object.
//
// This catches the static shapes only: a module-scope binding, or a class
// field (static or instance), that is typed LiveAPI or built from it. It does
// NOT catch a LiveAPI stored into a long-lived object or collection at
// runtime, a closure that outlives the call, a field assigned in a method, or a
// binding whose type is only inferred. A green run is not proof.
// Known blind spot: requestMemo's value map holds LiveAPIs. It is emptied at
// every scope begin and end.

/** Bindings and fields that legitimately hold a LiveAPI, as `file:name`. */
const ALLOWED: Record<string, string> = {
  "src/live-api-adapter/live-api-release.ts:trackedObjects":
    "The release bookkeeping itself: emptied when the last scope closes.",
  "src/live-api-adapter/live-api-release.ts:freeObjects":
    "The pool: objects here have a cleared path and are not in use.",
  "src/live-api-adapter/live-api-release.ts:memoizedObjects":
    "Cleared in the same step that releases tracked objects.",
  "src/tools/shared/device/helpers/path/with-device-path-cache.ts:cache":
    "Set and restored in a try/finally around one synchronous callback.",
  "src/tools/shared/clip/recreate-clip.ts:partialClip":
    "On an error thrown and caught within the same call.",
};

interface Hold {
  name: string;
  line: number;
  where: string;
}

const DOCS_POINTER =
  "Build LiveAPI objects where you use them. If this one is safe (emptied " +
  "before the request ends), add it to ALLOWED in this test with the reason. " +
  "This test does NOT catch a LiveAPI stored into a long-lived object or a " +
  "closure that outlives the call, so a green run is not proof. The full " +
  "rule is in src/live-api-adapter/live-api-release.ts.";

describe("LiveAPI objects are not held across requests", () => {
  it("should not hold a LiveAPI at module scope or in a class field", () => {
    const violations: { file: string; reason: string }[] = [];
    const matched = new Set<string>();

    for (const file of findSourceFiles(path.join(projectRoot, "src"), true)) {
      const rel = repoPath(file);

      if (rel.endsWith(".d.ts")) {
        continue;
      }

      for (const hold of findLiveApiHolds(rel, fs.readFileSync(file, "utf8"))) {
        const key = `${rel}:${hold.name}`;

        if (key in ALLOWED) {
          matched.add(key);
          continue;
        }

        violations.push({
          file: `${rel}:${String(hold.line)}`,
          reason: `${hold.name} holds a LiveAPI (${hold.where})`,
        });
      }
    }

    for (const key of Object.keys(ALLOWED)) {
      if (!matched.has(key)) {
        violations.push({
          file: key,
          reason:
            "stale ALLOWED entry: nothing holds a LiveAPI under this name",
        });
      }
    }

    throwOnFileViolations(
      violations,
      "Found LiveAPI object(s) that may outlive a request",
      DOCS_POINTER,
    );

    expect(violations).toHaveLength(0);
  });

  it("should flag the shapes it claims to catch", () => {
    const holds = (source: string): string[] =>
      findLiveApiHolds("x.ts", source).map((h) => h.name);

    expect(holds("const a = LiveAPI.from('x');")).toStrictEqual(["a"]);
    expect(holds("export let b: LiveAPI | null = null;")).toStrictEqual(["b"]);
    expect(holds("const c: LiveAPI[] = [];")).toStrictEqual(["c"]);
    expect(holds("const d = new Map<string, LiveAPI>();")).toStrictEqual(["d"]);
    expect(holds("class K { static s: LiveAPI; }")).toStrictEqual(["s"]);
    expect(holds("class K { f = LiveAPI.from('x'); }")).toStrictEqual(["f"]);
    expect(
      holds("class K { constructor(private p: LiveAPI) {} }"),
    ).toStrictEqual(["p"]);
  });

  it("should leave alone what does not hold an object", () => {
    const holds = (source: string): string[] =>
      findLiveApiHolds("x.ts", source).map((h) => h.name);

    expect(holds("const f = () => LiveAPI.from('x');")).toStrictEqual([]);
    expect(holds("const g: (p: string) => LiveAPI = make;")).toStrictEqual([]);
    expect(
      holds("function h(a: LiveAPI): LiveAPI { return a; }"),
    ).toStrictEqual([]);
    expect(
      holds("function i() { const local = LiveAPI.from('x'); }"),
    ).toStrictEqual([]);
    expect(holds("class K { m(a: LiveAPI) {} }")).toStrictEqual([]);
  });
});

function findLiveApiHolds(file: string, source: string): Hold[] {
  // Cheap pre-filter: most files never mention LiveAPI, and parsing is the cost.
  if (!source.includes("LiveAPI")) {
    return [];
  }

  const kind = file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  const holds: Hold[] = [];

  const add = (node: ts.Node, name: string, where: string): void => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

    holds.push({ name, line, where });
  };

  for (const statement of sf.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (mentionsLiveApi(decl.type) || mentionsLiveApi(decl.initializer)) {
          add(decl, decl.name.getText(sf), "module");
        }
      }
    }
  }

  const visit = (node: ts.Node): void => {
    if (ts.isClassLike(node)) {
      for (const member of node.members) {
        collectClassHolds(member, sf, add);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sf);

  return holds;
}

function collectClassHolds(
  member: ts.ClassElement,
  sf: ts.SourceFile,
  add: (node: ts.Node, name: string, where: string) => void,
): void {
  if (
    ts.isPropertyDeclaration(member) &&
    (mentionsLiveApi(member.type) || mentionsLiveApi(member.initializer))
  ) {
    const isStatic = member.modifiers?.some(
      (m) => m.kind === ts.SyntaxKind.StaticKeyword,
    );

    add(member, member.name.getText(sf), isStatic ? "static field" : "field");
  }

  if (ts.isConstructorDeclaration(member)) {
    for (const param of member.parameters) {
      // Only parameter properties (`private p: T`) become fields.
      if ((param.modifiers?.length ?? 0) > 0 && mentionsLiveApi(param.type)) {
        add(param, param.name.getText(sf), "field");
      }
    }
  }
}

/**
 * Whether a type or initializer names LiveAPI, ignoring function bodies and
 * function types: a function that returns a LiveAPI doesn't hold one.
 */
function mentionsLiveApi(node: ts.Node | undefined): boolean {
  if (node == null) {
    return false;
  }

  if (
    ts.isFunctionLike(node) ||
    ts.isFunctionTypeNode(node) ||
    ts.isConstructorTypeNode(node)
  ) {
    return false;
  }

  if (ts.isIdentifier(node) && node.text === "LiveAPI") {
    return true;
  }

  return ts.forEachChild(node, mentionsLiveApi) ?? false;
}
