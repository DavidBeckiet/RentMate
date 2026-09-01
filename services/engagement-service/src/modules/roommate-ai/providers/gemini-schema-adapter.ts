export const geminiSupportedJsonSchemaKeywords = Object.freeze([
  "$id",
  "$defs",
  "$ref",
  "$anchor",
  "type",
  "format",
  "title",
  "description",
  "enum",
  "items",
  "prefixItems",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "anyOf",
  "oneOf",
  "properties",
  "additionalProperties",
  "required",
  "propertyOrdering"
] as const);

export type GeminiJsonSchemaIssueKind = "UNSUPPORTED_KEYWORD" | "REF_WITH_SIBLINGS" | "INVALID_REF" | "CIRCULAR_SCHEMA";

export interface GeminiJsonSchemaIssue {
  readonly kind: GeminiJsonSchemaIssueKind;
  readonly keyword: string;
  readonly path: string;
}

type JsonSchemaRecord = Readonly<Record<string, unknown>>;

const supportedKeywords = new Set<string>(geminiSupportedJsonSchemaKeywords);
const refMetadataKeywords = new Set(["$id", "$anchor", "$defs"]);
const schemaMapKeywords = new Set(["properties", "$defs"]);
const schemaListKeywords = new Set(["prefixItems", "anyOf", "oneOf"]);

function isRecord(value: unknown): value is JsonSchemaRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pathSegment(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
}

function childPath(path: string, key: string): string {
  return `${path}${pathSegment(key)}`;
}

function listPath(path: string, key: string, index: number): string {
  return `${path}${pathSegment(key)}[${index}]`;
}

function collectIssues(value: unknown, path: string, issues: GeminiJsonSchemaIssue[], active: Set<object>): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectIssues(entry, `${path}[${index}]`, issues, active));
    return;
  }
  if (!isRecord(value)) return;
  if (active.has(value)) {
    issues.push({ kind: "CIRCULAR_SCHEMA", keyword: "schema", path });
    return;
  }

  active.add(value);
  const keys = Object.keys(value);
  for (const key of keys) {
    if (!supportedKeywords.has(key)) {
      issues.push({ kind: "UNSUPPORTED_KEYWORD", keyword: key, path: childPath(path, key) });
    }
  }
  if ("$ref" in value) {
    if (typeof value.$ref !== "string" || value.$ref.length === 0) {
      issues.push({ kind: "INVALID_REF", keyword: "$ref", path: childPath(path, "$ref") });
    }
    for (const key of keys) {
      if (key !== "$ref" && !refMetadataKeywords.has(key)) {
        issues.push({ kind: "REF_WITH_SIBLINGS", keyword: key, path: childPath(path, key) });
      }
    }
  }

  for (const [key, entry] of Object.entries(value)) {
    if (!supportedKeywords.has(key)) continue;
    if (schemaMapKeywords.has(key) && isRecord(entry)) {
      for (const [name, schema] of Object.entries(entry)) {
        collectIssues(schema, `${path}${pathSegment(key)}${pathSegment(name)}`, issues, active);
      }
      continue;
    }
    if (schemaListKeywords.has(key) && Array.isArray(entry)) {
      entry.forEach((schema, index) => collectIssues(schema, listPath(path, key, index), issues, active));
      continue;
    }
    if (key === "items") {
      collectIssues(entry, childPath(path, key), issues, active);
      continue;
    }
    if (key === "additionalProperties" && isRecord(entry)) {
      collectIssues(entry, childPath(path, key), issues, active);
    }
  }
  active.delete(value);
}

interface SchemaReference {
  readonly path: string;
  readonly target: string;
}

interface SchemaDefinition {
  readonly path: string;
  readonly schema: unknown;
}

function walkSchemaObjects(
  value: unknown,
  path: string,
  visit: (schema: JsonSchemaRecord, path: string) => void,
  active: Set<object>
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walkSchemaObjects(entry, `${path}[${index}]`, visit, active));
    return;
  }
  if (!isRecord(value) || active.has(value)) return;
  active.add(value);
  visit(value, path);
  for (const [key, entry] of Object.entries(value)) {
    if (schemaMapKeywords.has(key) && isRecord(entry)) {
      for (const [name, schema] of Object.entries(entry)) {
        walkSchemaObjects(schema, `${path}${pathSegment(key)}${pathSegment(name)}`, visit, active);
      }
    } else if (schemaListKeywords.has(key) && Array.isArray(entry)) {
      entry.forEach((schema, index) => walkSchemaObjects(schema, listPath(path, key, index), visit, active));
    } else if (key === "items") {
      walkSchemaObjects(entry, childPath(path, key), visit, active);
    } else if (key === "additionalProperties" && isRecord(entry)) {
      walkSchemaObjects(entry, childPath(path, key), visit, active);
    }
  }
  active.delete(value);
}

function referenceIssues(schema: JsonSchemaRecord): readonly GeminiJsonSchemaIssue[] {
  const definitions = new Map<string, SchemaDefinition>();
  const references: SchemaReference[] = [];
  walkSchemaObjects(
    schema,
    "$",
    (current, path) => {
      if (typeof current.$ref === "string") references.push({ path: childPath(path, "$ref"), target: current.$ref });
      if (!isRecord(current.$defs)) return;
      for (const [name, definition] of Object.entries(current.$defs)) {
        definitions.set(`#/$defs/${name}`, {
          path: `${path}.$defs${pathSegment(name)}`,
          schema: definition
        });
      }
    },
    new Set<object>()
  );

  const issues: GeminiJsonSchemaIssue[] = [];
  for (const reference of references) {
    if (!reference.target.startsWith("#/$defs/") || !definitions.has(reference.target)) {
      issues.push({ kind: "INVALID_REF", keyword: "$ref", path: reference.path });
    }
  }

  const edges = new Map<string, readonly string[]>();
  for (const [name, definition] of definitions) {
    const nested: string[] = [];
    walkSchemaObjects(
      definition.schema,
      definition.path,
      (current) => {
        if (typeof current.$ref === "string" && definitions.has(current.$ref)) nested.push(current.$ref);
      },
      new Set<object>()
    );
    edges.set(name, nested);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycleTargets = new Set<string>();
  const visitDefinition = (name: string): void => {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      cycleTargets.add(name);
      return;
    }
    visiting.add(name);
    for (const target of edges.get(name) ?? []) visitDefinition(target);
    visiting.delete(name);
    visited.add(name);
  };
  for (const name of definitions.keys()) visitDefinition(name);
  for (const target of cycleTargets) {
    const definition = definitions.get(target)!;
    issues.push({ kind: "CIRCULAR_SCHEMA", keyword: "$ref", path: definition.path });
  }
  return issues;
}

export function findGeminiJsonSchemaIssues(schema: unknown): readonly GeminiJsonSchemaIssue[] {
  const issues: GeminiJsonSchemaIssue[] = [];
  if (!isRecord(schema)) {
    issues.push({ kind: "CIRCULAR_SCHEMA", keyword: "schema", path: "$" });
    return Object.freeze(issues);
  }
  collectIssues(schema, "$", issues, new Set<object>());
  issues.push(...referenceIssues(schema));
  return Object.freeze(issues.map((issue) => Object.freeze(issue)));
}

function cloneValue(value: unknown, active: Set<object>): unknown {
  if (Array.isArray(value)) {
    if (active.has(value)) throw new Error("Circular JSON schema.");
    active.add(value);
    const result = value.map((entry) => cloneValue(entry, active));
    active.delete(value);
    return result;
  }
  if (!isRecord(value)) return value;
  return projectSchema(value, active);
}

function projectMap(value: unknown, active: Set<object>): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) return Object.freeze({});
  const result: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(value)) {
    result[name] = isRecord(schema) ? projectSchema(schema, active) : cloneValue(schema, active);
  }
  return Object.freeze(result);
}

function projectList(value: unknown, active: Set<object>): readonly unknown[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(
    value.map((schema) => (isRecord(schema) ? projectSchema(schema, active) : cloneValue(schema, active)))
  );
}

function projectSchema(value: JsonSchemaRecord, active: Set<object>): Readonly<Record<string, unknown>> {
  if (active.has(value)) throw new Error("Circular JSON schema.");
  active.add(value);
  const result: Record<string, unknown> = {};
  const hasRef = "$ref" in value;
  for (const [key, entry] of Object.entries(value)) {
    if (!supportedKeywords.has(key)) continue;
    if (hasRef && key !== "$ref" && !refMetadataKeywords.has(key)) continue;
    if (schemaMapKeywords.has(key)) {
      result[key] = projectMap(entry, active);
    } else if (schemaListKeywords.has(key)) {
      result[key] = projectList(entry, active);
    } else if (key === "items" || key === "additionalProperties") {
      result[key] = isRecord(entry) ? projectSchema(entry, active) : cloneValue(entry, active);
    } else {
      result[key] = cloneValue(entry, active);
    }
  }
  active.delete(value);
  return Object.freeze(result);
}

/**
 * Projects the application schema into the deliberately smaller Gemini subset.
 * Application-side validation remains responsible for every constraint omitted here.
 */
export function toGeminiJsonSchema(schema: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return projectSchema(schema, new Set<object>());
}

export function assertGeminiJsonSchemaCompatible(schema: unknown): asserts schema is Readonly<Record<string, unknown>> {
  const issues = findGeminiJsonSchemaIssues(schema);
  if (issues.length > 0) {
    const first = issues[0]!;
    throw new Error(`Gemini JSON schema is incompatible at ${first.path} (${first.kind}).`);
  }
}
