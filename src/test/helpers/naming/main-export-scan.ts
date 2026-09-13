// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Collects the exported functions and classes of every non-test .ts/.tsx module
// in a tree and checks them against the filename, for the main-export ratchet.
//
// What it skips is decided by construction, not by a path list: a module that
// exports no function or class has no main export to name, which covers
// constants tables, `.def.ts` tool definitions, scenario data and type-only
// modules. An exported type is not a name here — a `FooOptions` interface would
// let almost any module pass. Declaration files (.d.ts) and the generated .js
// parsers are never read.

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { type CommentTree } from "../comment-scan-helpers.ts";
import { findSourceFiles, projectRoot } from "../meta-test-helpers.ts";

/** The exported functions and classes of one module. */
export interface ModuleExports {
  /** Repo-relative path. */
  file: string;
  /** What the filename says the module is about, as one identifier. */
  expected: string;
  /** Exported function and class names, in source order. */
  names: string[];
}

/**
 * Every non-test module in a tree that exports a function or a class
 * @param tree - Tree name, resolved against the project root
 * @returns One entry per module, sorted by path
 */
export function scanMainExports(tree: CommentTree): ModuleExports[] {
  return findSourceFiles(path.join(projectRoot, tree), true)
    .filter((file) => isScannedModule(file))
    .map((file) =>
      scanModuleSource(
        path.relative(projectRoot, file),
        fs.readFileSync(file, "utf8"),
      ),
    )
    .filter((entry) => entry.names.length > 0)
    .toSorted((a, b) => a.file.localeCompare(b.file));
}

/**
 * One module's entry, from its source
 * @param file - Repo-relative path
 * @param source - The module's TypeScript source
 * @returns The filename's identifier and the names the module exports
 */
export function scanModuleSource(file: string, source: string): ModuleExports {
  return {
    file,
    expected: expectedName(path.basename(file)),
    names: exportedNames(file, source),
  };
}

/**
 * Whether a module's exports name what the file is named for
 * @param entry - One module's exported names
 * @returns True when some export shares a word with the filename
 */
export function namesItsFile(entry: ModuleExports): boolean {
  const fileWords = wordsIn(entry.expected);

  return entry.names.some((name) =>
    wordsIn(name).some((word) =>
      fileWords.some((fileWord) => sameWord(word, fileWord)),
    ),
  );
}

/**
 * Modules whose exports say nothing the filename says
 * @param tree - Tree name, resolved against the project root
 * @returns The offending modules, sorted by path
 */
export function findMainExportViolations(tree: CommentTree): ModuleExports[] {
  return scanMainExports(tree).filter((entry) => !namesItsFile(entry));
}

const TS_EXTENSIONS = new Set([".ts", ".tsx"]);

/**
 * Whether a file is a module this rule judges
 * @param filePath - Absolute path
 * @returns True for .ts/.tsx that isn't a declaration file
 */
function isScannedModule(filePath: string): boolean {
  return (
    TS_EXTENSIONS.has(path.extname(filePath)) && !filePath.endsWith(".d.ts")
  );
}

/**
 * The filename as one identifier
 * @param basename - Filename with extension
 * @returns The basename camel-cased (`update-clip.ts` -> `updateClip`)
 */
function expectedName(basename: string): string {
  const [stem = ""] = basename.split(".");

  return stem.replaceAll(/-(.)/g, (_, char: string) => char.toUpperCase());
}

/**
 * The words of an identifier, in a compare form
 * @param name - camelCase or kebab-case identifier
 * @returns Lowercase words with the plural and a trailing "e" trimmed
 */
function wordsIn(name: string): string[] {
  return name
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((word) =>
      word
        .replace(/ies$/, "y")
        .replace(/(?<![siu])s$/, "")
        .replace(/e$/, ""),
    );
}

/**
 * Whether two words name the same thing. One being the start of the other
 * covers the noun/verb pairs modules get named with: `parse` and `parser`,
 * `validat(e)` and `validation`, `round` and `rounding`.
 * @param word - Word from an export name
 * @param fileWord - Word from the filename
 * @returns True when they match
 */
function sameWord(word: string, fileWord: string): boolean {
  const [shorter, longer] =
    word.length <= fileWord.length ? [word, fileWord] : [fileWord, word];

  return shorter.length >= 3 && longer.startsWith(shorter);
}

/**
 * Names of the functions and classes a module exports, in source order
 * @param filePath - Repo-relative path, for parser messages
 * @param source - The module's TypeScript source
 * @returns Exported names
 */
function exportedNames(filePath: string, source: string): string[] {
  const parsed = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const names: string[] = [];
  const local = new Set<string>();

  for (const statement of parsed.statements) {
    for (const name of declaredNames(statement)) {
      local.add(name);
    }

    if (isExported(statement)) {
      names.push(...declaredNames(statement));
    } else if (ts.isExportDeclaration(statement)) {
      names.push(...exportedLocalNames(statement, local));
    } else if (ts.isExportAssignment(statement)) {
      names.push(...defaultExportName(statement, local));
    }
  }

  return names;
}

/**
 * Whether a statement carries the `export` keyword
 * @param statement - Top-level statement
 * @returns True when exported
 */
function isExported(statement: ts.Statement): boolean {
  return (
    ts.canHaveModifiers(statement) &&
    (ts
      .getModifiers(statement)
      ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ??
      false)
  );
}

/**
 * Function and class names a top-level statement declares
 * @param statement - Top-level statement
 * @returns Names it declares, in source order
 */
function declaredNames(statement: ts.Statement): string[] {
  if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
    return statement.name ? [statement.name.text] : [];
  }

  if (!ts.isVariableStatement(statement)) {
    return [];
  }

  return statement.declarationList.declarations
    .filter(
      (declaration) =>
        ts.isIdentifier(declaration.name) && isFunctionValue(declaration),
    )
    .map((declaration) => declaration.name.getText());
}

/**
 * Whether a variable declaration's value is a function
 * @param declaration - Variable declaration
 * @returns True for an arrow or function expression, wrapped or not
 */
function isFunctionValue(declaration: ts.VariableDeclaration): boolean {
  const { initializer } = declaration;

  if (initializer == null) {
    return false;
  }

  if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
    return true;
  }

  // A wrapped component or hook: memo(...), forwardRef(...)
  return (
    ts.isCallExpression(initializer) &&
    initializer.arguments.some(
      (argument) =>
        ts.isArrowFunction(argument) || ts.isFunctionExpression(argument),
    )
  );
}

/**
 * Locals a bare `export { ... }` exports, under the names it exports them as.
 * A re-export from another module is not this file's to name, so it doesn't
 * count.
 * @param statement - Export declaration
 * @param local - Function and class names declared in this file
 * @returns Exported names
 */
function exportedLocalNames(
  statement: ts.ExportDeclaration,
  local: Set<string>,
): string[] {
  const clause = statement.exportClause;

  if (
    statement.moduleSpecifier != null ||
    clause == null ||
    !ts.isNamedExports(clause)
  ) {
    return [];
  }

  return clause.elements
    .filter((element) => local.has((element.propertyName ?? element.name).text))
    .map((element) => element.name.text);
}

/**
 * The local a bare `export default` exports. Anything else it can name — a
 * call, an object, an import — is not a function or class this file declared.
 * @param statement - Export assignment
 * @param local - Function and class names declared in this file
 * @returns The exported name, or none
 */
function defaultExportName(
  statement: ts.ExportAssignment,
  local: Set<string>,
): string[] {
  const { expression } = statement;

  return ts.isIdentifier(expression) && local.has(expression.text)
    ? [expression.text]
    : [];
}
