import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function absolute(relativePath) {
  return path.join(ROOT, ...relativePath.replaceAll("\\", "/").split("/"));
}

export function exists(relativePath) {
  return existsSync(absolute(relativePath));
}

export function read(relativePath) {
  const target = absolute(relativePath);
  assert.ok(existsSync(target), `Required file is missing: ${relativePath}`);
  return readFileSync(target, "utf8");
}

export function filesUnder(relativeDirectory, predicate = () => true) {
  const base = absolute(relativeDirectory);
  if (!existsSync(base)) return [];
  const found = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (["node_modules", ".git", "dist"].includes(entry.name)) continue;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else {
        const relativePath = path.relative(ROOT, target).replaceAll("\\", "/");
        if (predicate(relativePath)) found.push(relativePath);
      }
    }
  };
  visit(base);
  return found.sort();
}

export function combined(relativePaths) {
  return relativePaths.map((file) => `\n/* FILE: ${file} */\n${read(file)}`).join("\n");
}

export function assertMatch(source, pattern, message) {
  assert.match(source, pattern, `${message}\nExpected pattern: ${pattern}`);
}

export function assertNoMatch(source, pattern, message) {
  assert.doesNotMatch(source, pattern, `${message}\nForbidden pattern: ${pattern}`);
}

export function assertAnyMatch(source, patterns, message) {
  assert.ok(
    patterns.some((pattern) => pattern.test(source)),
    `${message}\nExpected one of: ${patterns.join(", ")}`
  );
}

export function stripSqlComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\r\n]*/g, " ");
}

export function functionDeclarations(source) {
  const starts = [...source.matchAll(/^\s*(?:export\s+)?(?:async\s+)?function\s+([\w$]+)\s*\(/gm)];
  const result = new Map();
  for (let index = 0; index < starts.length; index += 1) {
    const current = starts[index];
    const end = starts[index + 1]?.index ?? source.length;
    result.set(current[1], source.slice(current.index, end));
  }
  return result;
}

export function reachableFunctionSources(source, entryName, shouldFollow = () => true) {
  const declarations = functionDeclarations(source);
  const visited = new Set();
  const queue = [entryName];
  const snippets = [];
  while (queue.length) {
    const name = queue.shift();
    if (visited.has(name)) continue;
    visited.add(name);
    const snippet = declarations.get(name);
    if (!snippet) continue;
    snippets.push(snippet);
    for (const candidate of declarations.keys()) {
      const invoked = new RegExp(`\\b${candidate}\\s*\\(`).test(snippet);
      const callback = new RegExp(`\\.(?:map|flatMap|filter|some|every|find)\\s*\\(\\s*${candidate}\\b`).test(snippet);
      if (!visited.has(candidate) && shouldFollow(candidate) && (invoked || callback)) queue.push(candidate);
    }
  }
  return snippets;
}

export function localModuleSpecifiers(source) {
  const specs = new Set();
  const patterns = [
    /\b(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["'](\.[^"']+)["']/g,
    /\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specs.add(match[1].split(/[?#]/, 1)[0]);
  }
  return [...specs];
}

export function resolveLocalImport(importerRelativePath, specifier) {
  return path
    .normalize(path.join(path.dirname(importerRelativePath), specifier))
    .replaceAll("\\", "/")
    .replace(/^\.\//, "");
}

export function parseEnvExample(source) {
  const values = new Map();
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    assert.ok(match, `.env.example contains an invalid line: ${rawLine}`);
    assert.ok(!values.has(match[1]), `.env.example duplicates ${match[1]}`);
    values.set(match[1], match[2].trim());
  }
  return values;
}
