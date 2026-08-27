import { ConsoleDom, MARKER_ATTRIBUTE, nextFrame, log } from "./console-dom";
import { QueryView } from "./query-view";

const SCAN_BUDGET_MS = 3000;
const DEEP_SCAN_BUDGET_MS = 15000;
const SCAN_SETTLE_MS = 15;
const LAZY_LOAD_WAIT_MS = 150;
const SWEEP_SETTLE_MS = 40;
const FALLBACK_ITEM_HEIGHT = 32;

// The console encodes a data path as ~2F-separated segments after /data/.
const PATH_SEPARATOR = "~2F";

const ACCENT_COLOUR = "#8ab4f8";
const ACCENT_TINT = "rgba(138,180,248,0.08)";
const ACCENT_TINT_HOVER = "rgba(138,180,248,0.16)";

// One filter per list panel. The console renders these lists through a CDK
// virtual scroller, so only the visible rows exist in the DOM — names are
// harvested as rows render and topped up by a bounded scroll scan on first use.
export class PanelListFilter {
  private readonly panel: HTMLElement;
  private readonly kind: string;
  private readonly names = new Set<string>();

  private panelIndex = -1;
  private wrapper: HTMLElement | null = null;
  private input: HTMLInputElement | null = null;
  private overlay: HTMLElement | null = null;
  private rowObserver: MutationObserver | null = null;
  private background = "#1f1f1f";
  private scanned = false;
  private scanning = false;
  private scanTruncated = false;

  constructor(panel: HTMLElement) {
    this.panel = panel;
    this.kind = ConsoleDom.panelKind(panel);
  }

  mount(index: number): boolean {
    const scrollable = ConsoleDom.scrollableOf(this.panel);
    if (!scrollable?.parentElement) return false;

    this.panelIndex = index;
    this.background = this.resolveBackground();
    this.harvest();
    this.buildInput(scrollable);
    this.buildOverlay();
    this.watchRows();

    log(`Filter mounted on ${this.kind} panel (index ${index}).`);

    return true;
  }

  setIndex(index: number): void {
    this.panelIndex = index;
  }

  destroy(): void {
    this.rowObserver?.disconnect();
    this.rowObserver = null;

    this.wrapper?.remove();
    this.overlay?.remove();

    this.wrapper = null;
    this.input = null;
    this.overlay = null;

    this.names.clear();
    this.scanned = false;
    this.scanTruncated = false;
  }

  isStale(): boolean {
    return !this.panel.isConnected || !ConsoleDom.scrollableOf(this.panel);
  }

  isMounted(): boolean {
    return this.wrapper?.isConnected === true;
  }

  private resolveBackground(): string {
    const panelBackground = window.getComputedStyle(this.panel).backgroundColor;

    const isTransparent =
      !panelBackground ||
      panelBackground === "transparent" ||
      panelBackground === "rgba(0, 0, 0, 0)";

    return isTransparent ? "#1f1f1f" : panelBackground;
  }

  private buildInput(scrollable: HTMLElement): void {
    const wrapper = document.createElement("div");
    wrapper.setAttribute(MARKER_ATTRIBUTE, "filter-wrapper");

    Object.assign(wrapper.style, {
      padding: "8px 12px",
      boxSizing: "border-box",
      width: "100%",
      position: "sticky",
      top: "0",
      zIndex: "10",
      backgroundColor: this.background,
      borderBottom: "1px solid rgba(128,128,128,0.15)",
    });

    const input = document.createElement("input");
    input.setAttribute(MARKER_ATTRIBUTE, "filter-input");
    input.type = "text";
    input.placeholder =
      this.kind === "documents"
        ? "Filter, search by prefix, or open an ID…"
        : `Filter ${this.kind}…`;
    input.autocomplete = "off";
    input.spellcheck = false;

    Object.assign(input.style, {
      width: "100%",
      boxSizing: "border-box",
      padding: "6px 12px",
      fontSize: "13px",
      border: "1px solid rgba(128,128,128,0.3)",
      borderRadius: "20px",
      background: "rgba(128,128,128,0.08)",
      color: "inherit",
      outline: "none",
    });

    input.addEventListener("focus", () => {
      input.style.borderColor = ACCENT_COLOUR;
      input.style.background = "rgba(138,180,248,0.06)";
    });

    input.addEventListener("blur", () => {
      input.style.borderColor = "rgba(128,128,128,0.3)";
      input.style.background = "rgba(128,128,128,0.08)";
    });

    input.addEventListener("input", () => {
      void this.onQueryChanged(input.value.trim());
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        input.value = "";
        this.applyFilter("");
        return;
      }

      if (event.key !== "Enter" || this.kind !== "documents") return;

      const value = input.value.trim();
      if (!value) return;

      // A full ID opens the document; anything shorter is a prefix search.
      if (this.names.has(value) || event.shiftKey) {
        this.openChild(value);
      } else {
        this.openPrefixQuery(value);
      }
    });

    wrapper.appendChild(input);
    scrollable.parentElement!.insertBefore(wrapper, scrollable);

    this.wrapper = wrapper;
    this.input = input;
  }

  private buildOverlay(): void {
    if (getComputedStyle(this.panel).position === "static") {
      this.panel.style.position = "relative";
    }

    const overlay = document.createElement("div");
    overlay.setAttribute(MARKER_ATTRIBUTE, "filter-results");

    Object.assign(overlay.style, {
      display: "none",
      position: "absolute",
      left: "0",
      right: "0",
      top: "0",
      bottom: "0",
      overflowY: "auto",
      zIndex: "9",
      backgroundColor: this.background,
    });

    this.panel.appendChild(overlay);
    this.overlay = overlay;
  }

  private watchRows(): void {
    const content = ConsoleDom.contentOf(this.panel);
    if (!content) return;

    this.rowObserver = new MutationObserver(() => this.harvest());
    this.rowObserver.observe(content, { childList: true });
  }

  private harvest(): void {
    for (const row of ConsoleDom.rowsOf(this.panel)) {
      const name = ConsoleDom.rowLabel(row);
      if (name) this.names.add(name);
    }
  }

  private async onQueryChanged(query: string): Promise<void> {
    if (!query) {
      this.applyFilter("");
      return;
    }

    this.applyFilter(query);

    if (!this.scanned) {
      await this.scanList(SCAN_BUDGET_MS);
      this.applyFilter(this.input?.value.trim() ?? "");
    }
  }

  // Scrolls the virtual list so names below the fold become filterable. The
  // console stops serving rows after a few hundred, so this only ever covers
  // what the list itself will load — a prefix query is the way past that.
  private async scanList(budgetMs: number): Promise<void> {
    const scrollable = ConsoleDom.scrollableOf(this.panel);
    if (!scrollable || this.scanning) return;

    this.scanning = true;

    const input = this.input;
    const previousPlaceholder = input?.placeholder ?? "";
    const previousScrollTop = scrollable.scrollTop;
    const startedAt = performance.now();
    const step = Math.max(200, scrollable.clientHeight - 50);

    this.scanTruncated = false;

    if (input) input.placeholder = `Scanning ${this.kind}…`;

    try {
      let position = 0;

      while (true) {
        if (performance.now() - startedAt > budgetMs) {
          this.scanTruncated = true;
          break;
        }

        scrollable.scrollTop = position;
        await nextFrame(SCAN_SETTLE_MS);
        this.harvest();

        const height = scrollable.scrollHeight;

        if (position + step >= height) {
          // At the bottom the console may still be fetching another page.
          await nextFrame(LAZY_LOAD_WAIT_MS);
          this.harvest();

          if (scrollable.scrollHeight <= height) break;
        }

        position += step;
      }
    } finally {
      scrollable.scrollTop = previousScrollTop;

      if (input) input.placeholder = previousPlaceholder;

      this.scanned = true;
      this.scanning = false;

      log(`Cached ${this.names.size} ${this.kind}.`);
    }
  }

  private applyFilter(query: string): void {
    const overlay = this.overlay;
    if (!overlay) return;

    if (!query) {
      overlay.style.display = "none";
      overlay.replaceChildren();
      return;
    }

    if (this.wrapper) {
      overlay.style.top = `${this.wrapper.offsetTop + this.wrapper.offsetHeight}px`;
    }

    overlay.style.display = "block";
    overlay.replaceChildren();

    const needle = query.toLowerCase();

    const matches = Array.from(this.names)
      .filter((name) => name.toLowerCase().includes(needle))
      .sort();

    const style = this.nativeRowStyle();

    if (this.canQueryDocuments(query)) {
      const actions = document.createElement("div");
      actions.setAttribute(MARKER_ATTRIBUTE, "filter-actions");
      actions.style.borderBottom = "1px solid rgba(128,128,128,0.2)";

      actions.appendChild(this.buildPrefixRow(query, style));

      if (!this.names.has(query)) {
        actions.appendChild(this.buildOpenRow(query, style));
      }

      overlay.appendChild(actions);
    }

    for (const name of matches) {
      overlay.appendChild(this.buildRow(name, query, style));
    }

    if (matches.length === 0) {
      overlay.appendChild(this.buildEmptyState(query));
    }

    if (this.scanTruncated && this.kind !== "documents") {
      overlay.appendChild(this.buildScanMoreRow());
    }
  }

  // Both document actions build a URL from the panel's collection path, which
  // only a documents panel can resolve unambiguously.
  private canQueryDocuments(query: string): boolean {
    return (
      this.kind === "documents" &&
      query.length > 0 &&
      !query.includes("/") &&
      this.collectionSegments() !== null
    );
  }

  private buildEmptyState(query: string): HTMLElement {
    const empty = document.createElement("div");
    empty.setAttribute(MARKER_ATTRIBUTE, "filter-empty");

    Object.assign(empty.style, {
      padding: "12px 16px",
      fontSize: "12px",
      lineHeight: "1.5",
      color: "rgba(128,128,128,0.7)",
      whiteSpace: "normal",
      wordBreak: "break-word",
    });

    empty.textContent =
      this.kind === "documents"
        ? `Not among the ${this.names.size} documents this list loads. Search the whole collection above.`
        : `No ${this.kind} matching "${query}"`;

    return empty;
  }

  private buildScanMoreRow(): HTMLElement {
    const row = document.createElement("div");
    row.setAttribute(MARKER_ATTRIBUTE, "filter-scan-more");

    Object.assign(row.style, {
      padding: "10px 16px",
      fontSize: "12px",
      color: ACCENT_COLOUR,
      cursor: "pointer",
      borderTop: "1px solid rgba(128,128,128,0.15)",
    });

    row.textContent = `Searched ${this.names.size} loaded ${this.kind} — scan further`;

    row.addEventListener("click", () => {
      void this.deepScan();
    });

    return row;
  }

  private async deepScan(): Promise<void> {
    await this.scanList(DEEP_SCAN_BUDGET_MS);
    this.applyFilter(this.input?.value.trim() ?? "");
  }

  // Mirrors a live row's computed style so filtered results are visually
  // indistinguishable from the console's own list.
  private nativeRowStyle(): {
    height: string;
    paddingLeft: string;
    fontSize: string;
    fontFamily: string;
    color: string;
  } {
    const row = ConsoleDom.rowsOf(this.panel)[0];
    const label = row ? ConsoleDom.rowClickTarget(row) : null;
    const computed = label ? getComputedStyle(label) : null;

    const height = row?.getBoundingClientRect().height || 48;

    const paddingLeft = label
      ? `${Math.round(label.getBoundingClientRect().left - this.panel.getBoundingClientRect().left)}px`
      : "32px";

    return {
      height: `${height}px`,
      paddingLeft,
      fontSize: computed?.fontSize ?? "14px",
      fontFamily: computed?.fontFamily ?? "inherit",
      color: computed?.color ?? "inherit",
    };
  }

  private buildPrefixRow(
    prefix: string,
    style: ReturnType<PanelListFilter["nativeRowStyle"]>,
  ): HTMLElement {
    const row = this.buildActionRow(style, {
      icon: "⌕",
      lead: "Search all",
      value: prefix,
      trail: "and after",
      hint: "⏎",
      title: `Query the whole collection for IDs from "${prefix}" onwards, in a new tab`,
    });

    row.setAttribute(MARKER_ATTRIBUTE, "filter-prefix-row");
    row.addEventListener("click", () => this.openPrefixQuery(prefix));

    return row;
  }

  private buildOpenRow(
    id: string,
    style: ReturnType<PanelListFilter["nativeRowStyle"]>,
  ): HTMLElement {
    const row = this.buildActionRow(style, {
      icon: "↗",
      lead: "Open",
      value: id,
      hint: "⇧⏎",
      title: `Open the document "${id}" in a new tab`,
    });

    row.setAttribute(MARKER_ATTRIBUTE, "filter-open-row");
    row.addEventListener("click", () => this.openChild(id));

    return row;
  }

  private buildActionRow(
    style: ReturnType<PanelListFilter["nativeRowStyle"]>,
    content: {
      icon: string;
      lead: string;
      value: string;
      trail?: string;
      hint: string;
      title: string;
    },
  ): HTMLElement {
    const row = this.buildRowShell(style);

    row.title = content.title;
    row.style.gap = "8px";
    row.style.color = ACCENT_COLOUR;
    row.style.background = ACCENT_TINT;
    row.style.paddingLeft = "12px";

    row.addEventListener("mouseenter", () => {
      row.style.background = ACCENT_TINT_HOVER;
    });

    row.addEventListener("mouseleave", () => {
      row.style.background = ACCENT_TINT;
    });

    const icon = document.createElement("span");
    icon.textContent = content.icon;

    Object.assign(icon.style, {
      flex: "none",
      width: "16px",
      textAlign: "center",
      opacity: "0.9",
    });

    // The ID is the part worth reading, so it keeps full weight while the
    // wording around it shrinks first.
    const text = document.createElement("span");

    Object.assign(text.style, {
      flex: "1",
      minWidth: "0",
      display: "flex",
      alignItems: "baseline",
      gap: "5px",
      overflow: "hidden",
    });

    const lead = document.createElement("span");
    lead.textContent = content.lead;
    lead.style.flex = "none";
    lead.style.opacity = "0.75";

    const value = document.createElement("span");
    value.textContent = content.value;

    Object.assign(value.style, {
      fontWeight: "600",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });

    text.append(lead, value);

    if (content.trail) {
      const trail = document.createElement("span");
      trail.textContent = content.trail;

      Object.assign(trail.style, {
        flex: "none",
        opacity: "0.75",
        whiteSpace: "nowrap",
      });

      text.appendChild(trail);
    }

    const hint = document.createElement("span");
    hint.textContent = content.hint;

    Object.assign(hint.style, {
      flex: "none",
      fontSize: "11px",
      opacity: "0.6",
      whiteSpace: "nowrap",
    });

    row.append(icon, text, hint);

    return row;
  }

  private buildRow(
    name: string,
    query: string,
    style: ReturnType<PanelListFilter["nativeRowStyle"]>,
  ): HTMLElement {
    const row = this.buildRowShell(style);
    row.setAttribute(MARKER_ATTRIBUTE, "filter-row");
    row.title = name;

    Object.assign(row.style, {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });

    row.append(...this.highlight(name, query));

    row.addEventListener("click", () => {
      void this.select(name);
    });

    return row;
  }

  private highlight(name: string, query: string): Node[] {
    const at = name.toLowerCase().indexOf(query.toLowerCase());
    if (at === -1) return [document.createTextNode(name)];

    const match = document.createElement("span");
    match.textContent = name.slice(at, at + query.length);
    match.style.color = ACCENT_COLOUR;
    match.style.fontWeight = "600";

    return [
      document.createTextNode(name.slice(0, at)),
      match,
      document.createTextNode(name.slice(at + query.length)),
    ];
  }

  private buildRowShell(
    style: ReturnType<PanelListFilter["nativeRowStyle"]>,
  ): HTMLElement {
    const row = document.createElement("div");

    Object.assign(row.style, {
      height: style.height,
      display: "flex",
      alignItems: "center",
      padding: `0 16px 0 ${style.paddingLeft}`,
      boxSizing: "border-box",
      cursor: "pointer",
      fontSize: style.fontSize,
      fontFamily: style.fontFamily,
      color: style.color,
      userSelect: "none",
    });

    row.addEventListener("mouseenter", () => {
      row.style.background = "rgba(255,255,255,0.08)";
    });

    row.addEventListener("mouseleave", () => {
      row.style.background = "";
    });

    return row;
  }

  private async select(name: string): Promise<void> {
    if (this.input) this.input.value = "";
    this.applyFilter("");

    if (this.clickRendered(name)) return;

    await this.scrollTo(name);
  }

  private clickRendered(name: string): boolean {
    for (const row of ConsoleDom.rowsOf(this.panel)) {
      if (ConsoleDom.rowLabel(row) !== name) continue;

      ConsoleDom.rowClickTarget(row).click();
      return true;
    }

    return false;
  }

  // The target row may not be rendered, so jump near its expected offset first
  // and fall back to a sweep if the estimate misses.
  private async scrollTo(name: string): Promise<void> {
    const scrollable = ConsoleDom.scrollableOf(this.panel);
    if (!scrollable) return;

    const index = Array.from(this.names).sort().indexOf(name);

    if (index !== -1) {
      scrollable.scrollTop = Math.max(
        0,
        index * FALLBACK_ITEM_HEIGHT - scrollable.clientHeight / 2,
      );

      await nextFrame(SWEEP_SETTLE_MS * 2);

      if (this.clickRendered(name)) return;
    }

    const step = Math.max(150, scrollable.clientHeight - 50);

    for (
      let position = 0;
      position <= scrollable.scrollHeight;
      position += step
    ) {
      scrollable.scrollTop = position;
      await nextFrame(SWEEP_SETTLE_MS);

      if (this.clickRendered(name)) return;
    }

    log(`Could not reach "${name}" in the ${this.kind} list.`);
  }

  private openPrefixQuery(prefix: string): void {
    const segments = this.collectionSegments();
    if (!segments) return;

    this.openInNewTab(QueryView.prefixUrl(segments, prefix));
  }

  private openChild(id: string): void {
    const segments = this.collectionSegments();
    if (!segments) return;

    const base = location.href.match(/^(.*\/data\/(?:panel\/)?)/);
    if (!base) return;

    const path = [...segments, id]
      .map((segment) => encodeURIComponent(segment))
      .join(PATH_SEPARATOR);

    this.openInNewTab(`${base[1]}${PATH_SEPARATOR}${path}`);
  }

  private openInNewTab(url: string): void {
    window.open(url, "_blank", "noopener");
  }

  // Panels form a chain that mirrors the data path: panel 0 lists root
  // collections, panel 1 the documents of segment 0, panel 2 the contents of
  // segment 0/1, and so on. A documents panel at index i therefore lists the
  // collection named by the first i segments of the current path.
  private collectionSegments(): string[] | null {
    if (this.panelIndex < 1) return null;

    const segments = this.pathSegments();
    if (segments.length < this.panelIndex) return null;

    const collection = segments.slice(0, this.panelIndex);

    return collection.length % 2 === 1 ? collection : null;
  }

  private pathSegments(): string[] {
    const match = location.href.match(/^.*\/data\/(?:panel\/)?([^?]*)/);
    if (!match) return [];

    return match[1]
      .split(/~2F|%2F/i)
      .filter((segment) => segment.length > 0)
      .map((segment) => decodeURIComponent(segment));
  }
}

export class PanelFilterManager {
  private readonly filters = new Map<HTMLElement, PanelListFilter>();
  private databaseUrl = ConsoleDom.databaseUrl();

  sync(): void {
    const currentDatabase = ConsoleDom.databaseUrl();

    if (currentDatabase !== this.databaseUrl) {
      this.databaseUrl = currentDatabase;
      this.destroyAll();
    }

    for (const [panel, filter] of this.filters) {
      if (!filter.isStale() && filter.isMounted()) continue;

      filter.destroy();
      this.filters.delete(panel);
    }

    ConsoleDom.listPanels().forEach((panel, index) => {
      const existing = this.filters.get(panel);

      if (existing) {
        existing.setIndex(index);
        return;
      }

      const filter = new PanelListFilter(panel);

      if (filter.mount(index)) {
        this.filters.set(panel, filter);
      }
    });
  }

  destroyAll(): void {
    for (const filter of this.filters.values()) {
      filter.destroy();
    }

    this.filters.clear();
  }
}
