import { MARKER_ATTRIBUTE } from "./console-dom";

const DEBOUNCE_MS = 300;
const POLL_MS = 1000;

// The console is a single-page app that rebuilds panels on every navigation, so
// injection has to be re-attempted continuously. Mutations caused by our own
// injected nodes are ignored, otherwise each injection triggers the next.
export class ConsoleWatcher {
  private readonly callback: () => void;
  private observer: MutationObserver | null = null;
  private themeObserver: MutationObserver | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(callback: () => void) {
    this.callback = callback;
  }

  start(): void {
    this.schedule();

    this.observer = new MutationObserver((mutations) => {
      if (mutations.every((mutation) => this.isOwn(mutation))) return;

      this.schedule();
    });

    this.observer.observe(document.body, { childList: true, subtree: true });

    this.watchTheme();

    // A plain tick. Cheaper than trying to predict every way the console can
    // repaint itself, and the components below decide if anything changed.
    setInterval(() => this.schedule(), POLL_MS);
  }

  // A theme toggle rewrites classes and inline styles on the document root
  // rather than adding or removing nodes, so childList alone never sees it.
  private watchTheme(): void {
    this.themeObserver = new MutationObserver(() => {
      this.schedule();
    });

    for (const root of [document.documentElement, document.body]) {
      if (!root) continue;

      this.themeObserver.observe(root, {
        attributes: true,
        attributeFilter: ["class", "style", "data-theme", "theme"],
      });
    }
  }


  private schedule(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => this.callback(), DEBOUNCE_MS);
  }

  private isOwn(mutation: MutationRecord): boolean {
    const touched = [
      ...Array.from(mutation.addedNodes),
      ...Array.from(mutation.removedNodes),
      mutation.target,
    ];

    return touched.every((node) => {
      if (!(node instanceof HTMLElement)) return true;

      return (
        node.hasAttribute(MARKER_ATTRIBUTE) ||
        node.closest(`[${MARKER_ATTRIBUTE}]`) !== null
      );
    });
  }
}
