import { SELECTORS, log } from "./console-dom";

// Bik documents routinely hold JSON blobs inside string fields; unwrapping them
// makes the copied output readable. Set to false for a byte-faithful copy.
const PARSE_STRINGIFIED_JSON = true;

interface ParsedField {
  key: string;
  value: unknown;
}

export class DocumentParser {
  parse(fieldsPanel: HTMLElement): Record<string, unknown> | null {
    const trees = fieldsPanel.querySelectorAll<HTMLElement>(
      SELECTORS.fieldsTopLevelTree,
    );

    if (trees.length === 0) {
      log("No top-level fields found in the fields panel.");
      return null;
    }

    return this.parseMap(Array.from(trees));
  }

  private parseMap(trees: HTMLElement[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const tree of trees) {
      const field = this.parseTree(tree);
      if (field) result[field.key] = field.value;
    }

    return result;
  }

  private parseArray(trees: HTMLElement[]): unknown[] {
    const entries: Array<{ index: number; value: unknown }> = [];

    for (const tree of trees) {
      const field = this.parseTree(tree);
      if (!field) continue;

      const index = parseInt(field.key, 10);

      entries.push({
        index: isNaN(index) ? entries.length : index,
        value: field.value,
      });
    }

    entries.sort((a, b) => a.index - b.index);

    return entries.map((entry) => entry.value);
  }

  private parseTree(tree: HTMLElement): ParsedField | null {
    const node = tree.querySelector<HTMLElement>(`:scope > ${SELECTORS.node}`);
    return node ? this.parseNode(node) : null;
  }

  private parseNode(node: HTMLElement): ParsedField | null {
    const keyElement = node.querySelector<HTMLElement>(
      `:scope > ${SELECTORS.nodeClickTarget} ${SELECTORS.nodeKey}`,
    );

    if (!keyElement) return null;

    const key = keyElement.textContent?.trim() ?? "";
    const type = this.fieldType(node);

    if (type === "map" || type === "array") {
      const children = Array.from(
        node.querySelectorAll<HTMLElement>(
          `:scope > ${SELECTORS.nodeChildren} > ${SELECTORS.dataTree}`,
        ),
      );

      if (children.length === 0) {
        return { key, value: type === "array" ? [] : {} };
      }

      return {
        key,
        value:
          type === "array"
            ? this.parseArray(children)
            : this.parseMap(children),
      };
    }

    const valueElement = node.querySelector<HTMLElement>(
      `:scope > ${SELECTORS.nodeClickTarget} ${SELECTORS.nodeLeafValue}`,
    );

    return {
      key,
      value: this.castValue(valueElement?.textContent?.trim() ?? "", type),
    };
  }

  private fieldType(node: HTMLElement): string {
    const match = node.className.match(/type-(\w+)/);
    return match ? match[1] : "string";
  }

  private castValue(raw: string, type: string): unknown {
    switch (type) {
      case "string": {
        const unquoted =
          raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2
            ? raw.slice(1, -1)
            : raw;

        return PARSE_STRINGIFIED_JSON ? this.tryParseJson(unquoted) : unquoted;
      }

      case "number": {
        const parsed = Number(raw);
        return isNaN(parsed) ? raw : parsed;
      }

      case "boolean":
        return raw === "true";

      case "null":
        return null;

      // Timestamps, geopoints and references are copied as the display string
      // the console shows — the DOM has no higher-fidelity value to read.
      default:
        return raw;
    }
  }

  private tryParseJson(value: string): unknown {
    const trimmed = value.trim();

    const looksLikeJson =
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"));

    if (!looksLikeJson) return value;

    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
}
