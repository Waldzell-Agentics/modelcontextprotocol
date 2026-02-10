import type { API, FileInfo, JSCodeshift } from "jscodeshift";

function hasEffectSchemaNamespace(root: ReturnType<JSCodeshift["root"]>, j: JSCodeshift): boolean {
  return (
    root
      .find(j.ImportDeclaration, { source: { value: "@effect/schema/Schema" } })
      .filter((p) =>
        p.value.specifiers?.some(
          (s) => s.type === "ImportNamespaceSpecifier" && s.local?.name === "S",
        ),
      )
      .size() > 0
  );
}

export default function transformer(file: FileInfo, api: API): string {
  const j = api.jscodeshift;
  const root = j(file.source);

  const zImports = root.find(j.ImportDeclaration, { source: { value: "zod" } });
  const sawZImport = zImports.size() > 0;
  const hasZMemberUsages =
    root.find(j.MemberExpression, {
      object: { type: "Identifier", name: "z" },
      property: { type: "Identifier" },
    }).size() > 0;

  const needsMigration = sawZImport || hasZMemberUsages;
  if (!needsMigration) {
    return file.source;
  }

  if (!hasEffectSchemaNamespace(root, j)) {
    root.get().node.program.body.unshift(
      j.importDeclaration(
        [j.importNamespaceSpecifier(j.identifier("S"))],
        j.literal("@effect/schema/Schema"),
      ),
    );
  }

  zImports.forEach((path) => {
    // Remove the zod import declaration.
    j(path).remove();
  });

  const simpleMap = new Set([
    "string",
    "number",
    "boolean",
    "bigint",
    "symbol",
    "unknown",
    "null",
    "void",
    "nan",
    "never",
    "object",
    "date",
  ]);

  root
    .find(j.CallExpression, {
      callee: {
        type: "MemberExpression",
        object: { type: "Identifier", name: "z" },
        property: { type: "Identifier" },
      },
    })
    .forEach((p) => {
      const callee = p.value.callee;
      if (callee.type !== "MemberExpression" || callee.property.type !== "Identifier") {
        return;
      }

      const prop = callee.property.name;

      if (simpleMap.has(prop)) {
        // z.string() -> S.string
        j(p).replaceWith(j.memberExpression(j.identifier("S"), j.identifier(prop)));
        return;
      }

      if (["array", "record", "tuple", "union", "enum"].includes(prop)) {
        // z.array(T) -> S.array(T)
        j(p).replaceWith(
          j.callExpression(j.memberExpression(j.identifier("S"), j.identifier(prop)), p.value.arguments),
        );
        return;
      }

      // Best-effort fallback: z.foo(...) -> S.foo(...)
      j(p).replaceWith(
        j.callExpression(j.memberExpression(j.identifier("S"), j.identifier(prop)), p.value.arguments),
      );
    });

  // z.string -> S.string (property access without call)
  root
    .find(j.MemberExpression, {
      object: { type: "Identifier", name: "z" },
      property: { type: "Identifier" },
    })
    .replaceWith((p) => {
      const prop = p.value.property;
      if (prop.type !== "Identifier") {
        return p.value;
      }

      return j.memberExpression(j.identifier("S"), j.identifier(prop.name));
    });

  return root.toSource();
}
