import ts from 'typescript';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

// Static syntax analysis: no imports from the app are executed and no server is started.
const origin = process.env.API_INTERNAL_ORIGIN ?? 'http://localhost:4100';
const response = await fetch(new URL('/api/docs-json', origin));
if (!response.ok) throw new Error(`OpenAPI fetch failed: ${response.status}`);
const spec = await response.json();
const normalize = (p) =>
  p
    .split('?')[0]
    .replace(/\{[^}]+\}/g, '{param}')
    .replace(/\/$/, '');
const exposed = new Set(
  Object.entries(spec.paths).flatMap(([p, methods]) =>
    Object.keys(methods).map((m) => `${m.toUpperCase()} ${normalize(p)}`),
  ),
);
async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(p);
    else if (/\.tsx?$/.test(p) && !/\.(test|spec)\./.test(p)) yield p;
  }
}
const calls = [];
const unresolved = [];
for await (const file of files('apps/web/src')) {
  const source = ts.createSourceFile(
    file,
    await readFile(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  function initializer(node, name) {
    // Resolve the nearest lexical declaration, including function-local `path` variables.
    for (let scope = node.parent; scope; scope = scope.parent) {
      const statements = scope.statements;
      if (!statements) continue;
      for (const statement of statements) {
        if (!ts.isVariableStatement(statement)) continue;
        for (const d of statement.declarationList.declarations)
          if (ts.isIdentifier(d.name) && d.name.text === name) return d.initializer;
      }
    }
  }
  function values(n, seen = new Set()) {
    if (!n) return [];
    if (ts.isStringLiteralLike(n)) return [n.text];
    if (ts.isParenthesizedExpression(n) || ts.isAsExpression(n)) return values(n.expression, seen);
    if (ts.isConditionalExpression(n))
      return [...values(n.whenTrue, seen), ...values(n.whenFalse, seen)];
    if (ts.isIdentifier(n) && !seen.has(n.text)) {
      const next = new Set(seen).add(n.text);
      return values(initializer(n, n.text), next);
    }
    if (ts.isTemplateExpression(n)) {
      let result = [n.head.text];
      for (const span of n.templateSpans) {
        const expression = span.expression;
        const raw = expression.getText(source);
        // Query tails are not path segments. Resolve interpolated path prefixes if present.
        const candidates = values(expression, seen);
        const replacement =
          candidates.length &&
          candidates.every((v) => v.startsWith('/') || v.startsWith('?') || v === '')
            ? candidates
            : /^(qs|queryString|query|search|params)(\b|\.)/.test(raw)
              ? ['']
              : ['{param}'];
        result = result.flatMap((prefix) => replacement.map((v) => prefix + v + span.literal.text));
      }
      return result;
    }
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = values(n.left, seen),
        right = values(n.right, seen);
      return left.flatMap((a) => (right.length ? right : ['{param}']).map((b) => a + b));
    }
    return [];
  }
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      let method;
      if (
        ts.isPropertyAccessExpression(expr) &&
        expr.expression.getText(source) === 'api' &&
        /^(get|post|put|patch|delete)$/.test(expr.name.text)
      )
        method = expr.name.text.toUpperCase();
      if (
        ts.isIdentifier(expr) &&
        expr.text === 'apiFetch' &&
        file !== 'apps/web/src/lib/api/client.ts'
      ) {
        const options = node.arguments[1];
        const prop =
          options && ts.isObjectLiteralExpression(options)
            ? options.properties.find((p) => p.name?.getText(source) === 'method')
            : undefined;
        method = prop && ts.isPropertyAssignment(prop) ? values(prop.initializer)[0] : 'GET';
      }
      if (method) {
        const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        const paths = values(node.arguments[0]);
        if (!paths.length || paths.some((p) => !p.startsWith('/')))
          unresolved.push(`${file}:${line}: cannot resolve ${node.arguments[0]?.getText(source)}`);
        for (const p of paths.filter((p) => p.startsWith('/')))
          calls.push({ method, path: normalize('/api/v1' + p), file, line });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
const mismatches = [
  ...new Map(
    calls
      .filter((c) => !exposed.has(`${c.method} ${c.path}`))
      .map((c) => [`${c.file}:${c.line}:${c.method}:${c.path}`, c]),
  ).values(),
];
for (const c of mismatches) console.error(`${c.file}:${c.line}: ${c.method} ${c.path}`);
for (const problem of unresolved) console.error(problem);
console.log(
  JSON.stringify({
    calls: calls.length,
    uniqueOperations: new Set(calls.map((c) => `${c.method} ${c.path}`)).size,
    mismatches: mismatches.length,
    unresolved: unresolved.length,
  }),
);
if (mismatches.length || unresolved.length) process.exitCode = 1;
