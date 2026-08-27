import { SELECTORS, ConsoleDom, nextFrame, log } from "./console-dom";

const MAX_PASSES = 15;
const MAX_CLICKS = 3000;
const RENDER_WAIT_MS = 80;

// The console renders a map's or array's children only once it is expanded, so
// a full copy has to open every collapsed branch first. Only disclosure
// controls are ever clicked — never a row action — so this stays read-only.
const ACTION_LABEL_PATTERN =
  /edit|delete|remove|add|copy|start collection|more_vert|options/i;

export interface ExpandResult {
  clicked: number;
  unresolved: number;
}

export class DocumentExpander {
  async expandAll(fieldsPanel: HTMLElement): Promise<ExpandResult> {
    let clicked = 0;
    let unresolved = 0;

    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const collapsed = this.collapsedNodes(fieldsPanel);
      if (collapsed.length === 0) break;

      let clickedThisPass = 0;
      unresolved = 0;

      for (const node of collapsed) {
        if (clicked >= MAX_CLICKS) break;

        const disclosure = this.findDisclosure(node);

        if (!disclosure) {
          unresolved++;
          continue;
        }

        disclosure.click();
        clicked++;
        clickedThisPass++;
      }

      if (clickedThisPass === 0) break;

      await nextFrame(RENDER_WAIT_MS);
    }

    if (unresolved > 0) {
      log(
        `Could not expand ${unresolved} nested field(s) — no disclosure control found.`,
      );
    }

    return { clicked, unresolved };
  }

  private collapsedNodes(fieldsPanel: HTMLElement): HTMLElement[] {
    return Array.from(
      fieldsPanel.querySelectorAll<HTMLElement>(SELECTORS.node),
    ).filter((node) => this.isCollapsed(node));
  }

  private isCollapsed(node: HTMLElement): boolean {
    if (!/type-(map|array)/.test(node.className)) return false;

    const children = node.querySelector<HTMLElement>(
      `:scope > ${SELECTORS.nodeChildren}`,
    );

    return !children?.querySelector(`:scope > ${SELECTORS.dataTree}`);
  }

  private findDisclosure(node: HTMLElement): HTMLElement | null {
    const target =
      node.querySelector<HTMLElement>(`:scope > ${SELECTORS.nodeClickTarget}`) ??
      node;

    const aria = target.matches('[aria-expanded="false"]')
      ? target
      : target.querySelector<HTMLElement>('[aria-expanded="false"]');

    if (aria) return aria;

    // Fallback: the console lays the expander out to the left of the field key
    // and the row actions to the right, so position separates them reliably
    // even when class names change.
    const key = target.querySelector<HTMLElement>(SELECTORS.nodeKey);
    if (!key) return null;

    const keyLeft = key.getBoundingClientRect().left;

    const candidates = Array.from(
      target.querySelectorAll<HTMLElement>(
        'button, [role="button"], [class*="expand"], [class*="chevron"], [class*="caret"], [class*="twisty"]',
      ),
    );

    for (const candidate of candidates) {
      if (this.isActionControl(candidate)) continue;

      const rect = candidate.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.left >= keyLeft) continue;

      return candidate;
    }

    return null;
  }

  private isActionControl(element: HTMLElement): boolean {
    const description = [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("data-test-id"),
      element.textContent,
    ]
      .filter(Boolean)
      .join(" ");

    return ACTION_LABEL_PATTERN.test(description);
  }

  // Printed by window.__fctDebug() so an unrecognised console layout can be
  // pinned down without guessing at selectors.
  describeCollapsedSample(): string {
    const fieldsPanel = ConsoleDom.fieldsPanel();
    if (!fieldsPanel) return "No fields panel on this page.";

    const sample = this.collapsedNodes(fieldsPanel)[0];
    if (!sample) return "No collapsed map/array fields found.";

    const target =
      sample.querySelector(`:scope > ${SELECTORS.nodeClickTarget}`) ?? sample;

    return target.outerHTML;
  }
}
