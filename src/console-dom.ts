// Every Firebase Console selector this extension depends on lives here. The
// console's markup is not a public contract, so when a release breaks us this
// is the only file that should need touching.
export const SELECTORS = {
  fieldsPanel: 'f7e-fields-subpanel[data-test-id="f7e-fields-subpanel"]',
  fieldsTopLevelTree: "fs-animate-change-classes > f7e-data-tree",
  breadcrumbs: "fire-breadcrumbs .crumbs",

  virtualScrollable: ".cdk-virtual-scrollable",
  virtualContent: ".cdk-virtual-scroll-content-wrapper",
  panel: '[data-test-id$="-panel"]',
  listItem: "f7e-panel-list-item",
  listItemLabel: ".item-label-button",

  dataTree: "f7e-data-tree",
  node: ".database-node",
  nodeClickTarget: ".database-node-click-target",
  nodeKey: ".database-key",
  nodeLeafValue: ".database-leaf-value",
  nodeChildren: ".database-children",
} as const;

export const MARKER_ATTRIBUTE = "data-fct";

export class ConsoleDom {
  // Panels are found through their virtual scroller rather than by tag name, so
  // collections, documents and subcollection lists are all handled by one path.
  static listPanels(): HTMLElement[] {
    const panels = new Set<HTMLElement>();

    document
      .querySelectorAll<HTMLElement>(SELECTORS.virtualScrollable)
      .forEach((scrollable) => {
        const panel =
          scrollable.closest<HTMLElement>(SELECTORS.panel) ??
          scrollable.parentElement;

        if (!panel || panel.querySelector(SELECTORS.dataTree)) return;

        panels.add(panel);
      });

    return Array.from(panels);
  }

  static scrollableOf(panel: HTMLElement): HTMLElement | null {
    return panel.querySelector<HTMLElement>(SELECTORS.virtualScrollable);
  }

  static contentOf(panel: HTMLElement): HTMLElement | null {
    return panel.querySelector<HTMLElement>(SELECTORS.virtualContent);
  }

  static rowsOf(panel: HTMLElement): HTMLElement[] {
    const content = this.contentOf(panel);
    if (!content) return [];

    const items = content.querySelectorAll<HTMLElement>(SELECTORS.listItem);
    if (items.length > 0) return Array.from(items);

    return Array.from(content.children).filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && !child.hasAttribute(MARKER_ATTRIBUTE),
    );
  }

  static rowLabel(row: HTMLElement): string {
    const label = row.querySelector<HTMLElement>(SELECTORS.listItemLabel);
    return (label ?? row).textContent?.trim() ?? "";
  }

  static rowClickTarget(row: HTMLElement): HTMLElement {
    return (
      row.querySelector<HTMLElement>(SELECTORS.listItemLabel) ??
      row.querySelector<HTMLElement>("button") ??
      row
    );
  }

  // Drives the filter placeholder text and keeps a panel's name cache keyed to
  // the right list when the console reuses a panel element across navigations.
  static panelKind(panel: HTMLElement): string {
    const testId = panel.getAttribute("data-test-id") ?? panel.tagName;

    if (/document/i.test(testId)) return "documents";
    if (/collection/i.test(testId)) return "collections";

    return "items";
  }

  static fieldsPanel(): HTMLElement | null {
    return document.querySelector<HTMLElement>(SELECTORS.fieldsPanel);
  }

  static breadcrumbs(): HTMLElement | null {
    return document.querySelector<HTMLElement>(SELECTORS.breadcrumbs);
  }

  static databaseUrl(): string {
    const match = location.href.match(/^(.*\/databases\/[^/]+)/);

    return match
      ? match[1]
      : location.origin + location.pathname.split("/data/")[0];
  }
}

export function nextFrame(delayMs = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function log(...args: unknown[]): void {
  console.log("[Firestore Console Tools]", ...args);
}
