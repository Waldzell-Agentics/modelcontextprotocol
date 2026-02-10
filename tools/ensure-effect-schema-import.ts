import { Project } from "ts-morph";

/**
 * Ensures a source file imports `@effect/schema/Schema` as namespace `S`.
 *
 * The operation is idempotent and safe to re-run.
 */
export async function ensureEffectSchemaImport(path: string): Promise<void> {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const sf = project.addSourceFileAtPath(path);

  const existing = sf
    .getImportDeclarations()
    .find((d) => d.getModuleSpecifierValue() === "@effect/schema/Schema");

  if (existing) {
    const namespaceImport = existing.getNamespaceImport();

    if (namespaceImport?.getText() === "S") {
      return;
    }

    if (!namespaceImport) {
      existing.setNamespaceImport("S");
      await sf.save();
      return;
    }

    // Existing namespace alias differs; leave untouched to avoid clobbering local conventions.
    return;
  }

  sf.addImportDeclaration({
    namespaceImport: "S",
    moduleSpecifier: "@effect/schema/Schema",
  });

  await sf.save();
}
