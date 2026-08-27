import { MARKER_ATTRIBUTE } from "./console-dom";

const DEBOUNCE_MS = 300;
const URL_POLL_MS = 1000;

// The console is a single-page app that rebuilds panels on every navigation, so
// injection has to be re-attempted continuously. Mutations caused by our own
// injected nodes are ignored, otherwise each injection triggers the next.
export class ConsoleWatcher {
  private readonly callback: () => void;
  private observer: MutationObserver | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastUrl = location.href;

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

    setInterval(() => {
      if (location.href === this.lastUrl) return;

      this.lastUrl = location.href;
      this.schedule();
    }, URL_POLL_MS);
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
