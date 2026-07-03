// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Scans test files for the vi.mock() hoisting hazard: an ASYNC factory (the
// `async (importOriginal) => ({ ...(await importOriginal()), … })` partial-mock
// form) that references a module-scope import. vi.mock is hoisted above the
// imports; Vitest auto-hoists imports used in *synchronous* factories, but not
// ones referenced after an `await`, so the binding is in its temporal dead zone
// when the async factory resumes — a cold-start "Cannot access
// '__vi_import_N__' before initialization". The throw is order-dependent (masked
// when another file warms the module graph first), so it passes locally and
// fails in CI. The sanctioned escapes are vi.hoisted() (its results are plain
// module-scope consts, never imports) or setting the value in beforeEach.

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { findTestFiles, projectRoot } from "./meta-test-helpers.ts";

/** One offending identifier reference inside a vi.mock() factory. */
export interface MockImportRefViolation {
  file: string;
  line: number;
  name: string;
}

/** Trees whose test files run under the unit `vitest` suite. */
const TEST_TREES = ["src", "webui", "evals", "scripts"];

/**
 * Scan every unit-suite test file for identifiers referenced inside a `vi.mock()`
 * factory that resolve to a module-scope import (other than `vi`, which Vitest
 * makes available to the hoisted factory).
 * @returns {MockImportRefViolation[]} One entry per offending reference
 */
export function findMockImportRefViolations(): MockImportRefViolation[] {
  const violations: MockImportRefViolation[] = [];

  for (const tree of TEST_TREES) {
    for (const file of findTestFiles(path.join(projectRoot, tree))) {
      violations.push(...scanFile(file));
    }
  }

  return violations;
}

/**
 * Scan a single test file for vi.mock() factories referencing imports.
 * @param {string} file - Absolute path to the test file
 * @returns {MockImportRefViolation[]} Offending references in this file
 */
function scanFile(file: string): MockImportRefViolation[] {
  const text = fs.readFileSync(file, "utf8");

  if (!text.includes("vi.mock(")) return [];

  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX,
  );
  const unsafe = collectUnsafeImports(source);

  if (unsafe.size === 0) return [];

  const out: MockImportRefViolation[] = [];

  const visit = (node: ts.Node): void => {
    const factory = mockFactory(node);

    if (factory) out.push(...factoryViolations(factory, unsafe, source, file));

    node.forEachChild(visit);
  };

  visit(source);

  return out;
}

/**
 * Collect the names of imports that are unsafe to reference in a hoisted factory.
 * Every `vitest` import is excluded (`vi` is hoisted with the factory). Type-only
 * imports are collected too but harmlessly so — they only ever appear in type
 * positions, which `isValueReference` skips, and using one as a value would fail
 * typecheck first.
 * @param {ts.SourceFile} source - Parsed test file
 * @returns {Set<string>} Unsafe imported binding names
 */
function collectUnsafeImports(source: ts.SourceFile): Set<string> {
  const names = new Set<string>();

  source.forEachChild((node) => {
    if (!ts.isImportDeclaration(node)) return;

    const spec = node.moduleSpecifier;

    if (ts.isStringLiteral(spec) && spec.text === "vitest") return;

    const clause = node.importClause;

    if (!clause) return;

    if (clause.name) names.add(clause.name.text); // default import

    const bindings = clause.namedBindings;

    if (bindings == null) return;

    if (ts.isNamespaceImport(bindings)) {
      names.add(bindings.name.text);
    } else {
      for (const el of bindings.elements) {
        names.add(el.name.text);
      }
    }
  });

  return names;
}

/**
 * Return the ASYNC factory (function) argument of a `vi.mock(...)` call, or null
 * otherwise. Synchronous factories are excluded — Vitest auto-hoists the imports
 * they reference. `vi.doMock` is not hoisted, so it is excluded too.
 * @param {ts.Node} node - Candidate node
 * @returns {ts.FunctionExpression | ts.ArrowFunction | null} The factory or null
 */
function mockFactory(
  node: ts.Node,
): ts.FunctionExpression | ts.ArrowFunction | null {
  if (!ts.isCallExpression(node)) return null;

  const callee = node.expression;

  if (
    !ts.isPropertyAccessExpression(callee) ||
    !ts.isIdentifier(callee.expression) ||
    callee.expression.text !== "vi" ||
    callee.name.text !== "mock"
  ) {
    return null;
  }

  const factory = node.arguments[1];

  if (
    factory &&
    (ts.isArrowFunction(factory) || ts.isFunctionExpression(factory)) &&
    factory.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
  ) {
    return factory;
  }

  return null;
}

/**
 * Find unsafe-import references inside one factory, skipping names shadowed by
 * the factory's own params/locals and identifiers in non-reference positions
 * (property keys, member names, type positions).
 * @param {ts.Node} factory - The factory function node
 * @param {Set<string>} unsafe - Unsafe imported names
 * @param {ts.SourceFile} source - Parsed test file (for line lookup)
 * @param {string} file - Absolute file path
 * @returns {MockImportRefViolation[]} Offending references
 */
function factoryViolations(
  factory: ts.Node,
  unsafe: Set<string>,
  source: ts.SourceFile,
  file: string,
): MockImportRefViolation[] {
  const locals = collectLocalNames(factory);
  const out: MockImportRefViolation[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isIdentifier(node) &&
      unsafe.has(node.text) &&
      !locals.has(node.text) &&
      isValueReference(node)
    ) {
      const { line } = source.getLineAndCharacterOfPosition(
        node.getStart(source),
      );

      out.push({
        file: path.relative(projectRoot, file),
        line: line + 1,
        name: node.text,
      });
    }

    node.forEachChild(visit);
  };

  visit(factory);

  return out;
}

/**
 * Collect identifier names declared locally within the factory (params, bound
 * variables, function/class names) so they are not mistaken for import refs.
 * @param {ts.Node} factory - The factory function node
 * @returns {Set<string>} Locally declared names
 */
function collectLocalNames(factory: ts.Node): Set<string> {
  const locals = new Set<string>();

  const add = (name: ts.BindingName | undefined): void => {
    if (name == null) return;

    if (ts.isIdentifier(name)) {
      locals.add(name.text);
    } else {
      for (const el of name.elements) {
        if (ts.isBindingElement(el)) add(el.name);
      }
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isParameter(node) || ts.isVariableDeclaration(node)) add(node.name);
    else if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
      node.name
    ) {
      locals.add(node.name.text);
    }

    node.forEachChild(visit);
  };

  visit(factory);

  return locals;
}

/**
 * Whether an identifier sits in a value-reference position (not a property key,
 * member name, or type position, none of which trigger the hoisting TDZ).
 * @param {ts.Identifier} node - Candidate identifier
 * @returns {boolean} True if it is a runtime value reference
 */
function isValueReference(node: ts.Identifier): boolean {
  const p = node.parent;

  if (ts.isPropertyAccessExpression(p) && p.name === node) return false;
  if (ts.isQualifiedName(p) && p.right === node) return false; // typeof a.b type pos
  if (ts.isPropertyAssignment(p) && p.name === node) return false;
  if (ts.isTypeReferenceNode(p) || ts.isTypeQueryNode(p)) return false;

  if (
    (ts.isMethodDeclaration(p) ||
      ts.isGetAccessorDeclaration(p) ||
      ts.isSetAccessorDeclaration(p) ||
      ts.isPropertyDeclaration(p)) &&
    p.name === node
  ) {
    return false;
  }

  return true;
}
