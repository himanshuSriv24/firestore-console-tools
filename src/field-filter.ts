import { SELECTORS, ConsoleDom, MARKER_ATTRIBUTE, nextFrame } from "./console-dom";
import { DocumentExpander } from "./document-expander";
import { Theme } from "./theme";

const HIDDEN_ATTRIBUTE = "data-fct-hidden";
const DEBOUNCE_MS = 120;

// Filters a document's fields by key. Nested keys only exist in the DOM once
// their branch is open, so the first search expands the document the same way a
// copy does — then non-matching branches are hidden, never removed.
export class FieldFilter {
  private readonly expander = new DocumentExpander();

  private panel: HTMLElement | null = null;
  private wrapper: HTMLElement | null = null;
  private input: HTMLInputElement | null = null;
  private count: HTMLElement | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private expanded = false;
  private matches = 0;
  private background = "";

  sync(): void {
    const panel = ConsoleDom.fieldsPanel();

    if (!panel) {
      this.reset();
      return;
    }

    if (panel !== this.panel) {
      this.reset();
      this.panel = panel;
      this.expanded = false;
    }

    if (this.wrapper?.isConnected && this.background === Theme.surfaceOf(panel)) {
      return;
    }

    // reset() also unhides anything an active filter had hidden, which a bare
    // wrapper swap would strand.
    if (this.wrapper?.isConnected) {
      this.reset();
      this.panel = panel;
    }

    this.mount(panel);
  }

  refresh(): void {
    this.reset();
  }

  private reset(): void {
    this.clearHidden();

    this.wrapper?.remove();

    this.wrapper = null;
    this.input = null;
    this.count = null;
    this.panel = null;
  }

  private mount(panel: HTMLElement): void {
    this.background = Theme.surfaceOf(panel);

    const wrapper = document.createElement("div");
    wrapper.setAttribute(MARKER_ATTRIBUTE, "field-filter");

    Object.assign(wrapper.style, {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "8px 12px",
      boxSizing: "border-box",
      position: "sticky",
      top: "0",
      zIndex: "10",
      backgroundColor: this.background,
      borderBottom: `1px solid ${Theme.dividerColour()}`,
    });

    const input = document.createElement("input");
    input.setAttribute(MARKER_ATTRIBUTE, "field-filter-input");
    input.type = "text";
    input.placeholder = "Filter fields by key…";
    input.autocomplete = "off";
    input.spellcheck = false;

    Object.assign(input.style, {
      flex: "1",
      minWidth: "0",
      boxSizing: "border-box",
      padding: "6px 12px",
      fontSize: "13px",
      border: `1px solid ${Theme.borderColour()}`,
      borderRadius: "20px",
      background: Theme.subtleTint(),
      color: "inherit",
      outline: "none",
    });

    const count = document.createElement("span");
    count.setAttribute(MARKER_ATTRIBUTE, "field-filter-count");

    Object.assign(count.style, {
      fontSize: "11px",
      color: Theme.mutedText(),
      whiteSpace: "nowrap",
      fontVariantNumeric: "tabular-nums",
    });

    input.addEventListener("focus", () => {
      input.style.borderColor = Theme.accent();
      input.style.background = Theme.accentTint(0.06);
    });

    input.addEventListener("blur", () => {
      input.style.borderColor = Theme.borderColour();
      input.style.background = Theme.subtleTint();
    });

    input.addEventListener("input", () => this.schedule());

    input.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;

      input.value = "";
      this.apply("");
    });

    wrapper.append(input, count);

    const treeContainer = panel.querySelector("fs-animate-change-classes");

    if (treeContainer?.parentElement) {
      treeContainer.parentElement.insertBefore(wrapper, treeContainer);
    } else {
      panel.prepend(wrapper);
    }

    this.wrapper = wrapper;
    this.input = input;
    this.count = count;
  }

  private schedule(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => {
      void this.apply(this.input?.value.trim() ?? "");
    }, DEBOUNCE_MS);
  }

  private async apply(query: string): Promise<void> {
    const panel = this.panel;
    if (!panel) return;

    if (!query) {
      this.clearHidden();
      this.setCount("");
      return;
    }

    if (!this.expanded) {
      this.setCount("expanding…");

      await this.expander.expandAll(panel);
      await nextFrame(120);

      this.expanded = true;
    }

    // The user may have typed on while the document was expanding.
    const current = this.input?.value.trim() ?? "";
    if (current !== query) return;

    this.clearHidden();
    this.matches = 0;

    const needle = query.toLowerCase();

    for (const tree of this.topLevelTrees(panel)) {
      this.filterTree(tree, needle);
    }

    this.setCount(
      this.matches === 0
        ? "no matches"
        : `${this.matches} ${this.matches === 1 ? "field" : "fields"}`,
    );
  }

  private filterTree(tree: HTMLElement, needle: string): boolean {
    const children = this.childTrees(tree);

    if (this.ownKey(tree).toLowerCase().includes(needle)) {
      this.matches++;

      // A matched key keeps its whole value visible.
      this.revealSubtree(tree);

      return true;
    }

    let hasMatch = false;

    for (const child of children) {
      if (this.filterTree(child, needle)) hasMatch = true;
    }

    if (!hasMatch) this.hide(tree);

    return hasMatch;
  }

  private topLevelTrees(panel: HTMLElement): HTMLElement[] {
    return Array.from(
      panel.querySelectorAll<HTMLElement>(SELECTORS.fieldsTopLevelTree),
    );
  }

  private childTrees(tree: HTMLElement): HTMLElement[] {
    const node = tree.querySelector<HTMLElement>(`:scope > ${SELECTORS.node}`);
    if (!node) return [];

    return Array.from(
      node.querySelectorAll<HTMLElement>(
        `:scope > ${SELECTORS.nodeChildren} > ${SELECTORS.dataTree}`,
      ),
    );
  }

  private ownKey(tree: HTMLElement): string {
    const node = tree.querySelector<HTMLElement>(`:scope > ${SELECTORS.node}`);

    const key = node?.querySelector<HTMLElement>(
      `:scope > ${SELECTORS.nodeClickTarget} ${SELECTORS.nodeKey}`,
    );

    return key?.textContent?.trim() ?? "";
  }

  private hide(tree: HTMLElement): void {
    tree.setAttribute(HIDDEN_ATTRIBUTE, "1");
    tree.style.display = "none";
  }

  private revealSubtree(tree: HTMLElement): void {
    this.show(tree);

    tree
      .querySelectorAll<HTMLElement>(`[${HIDDEN_ATTRIBUTE}]`)
      .forEach((hidden) => this.show(hidden));
  }

  private show(tree: HTMLElement): void {
    if (!tree.hasAttribute(HIDDEN_ATTRIBUTE)) return;

    tree.removeAttribute(HIDDEN_ATTRIBUTE);
    tree.style.display = "";
  }

  private clearHidden(): void {
    document
      .querySelectorAll<HTMLElement>(`[${HIDDEN_ATTRIBUTE}]`)
      .forEach((hidden) => this.show(hidden));
  }

  private setCount(text: string): void {
    if (this.count) this.count.textContent = text;
  }
}
