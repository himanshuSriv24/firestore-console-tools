import { ConsoleWatcher } from "./console-watcher";
import { CopyJsonButton } from "./copy-button";
import { DocumentExpander } from "./document-expander";
import { FieldFilter } from "./field-filter";
import { PanelFilterManager } from "./list-filter";
import { Theme } from "./theme";

class FirestoreConsoleTools {
  private readonly filters = new PanelFilterManager();
  private readonly copyButton = new CopyJsonButton();
  private readonly fieldFilter = new FieldFilter();
  private theme = Theme.fingerprint();

  start(): void {
    new ConsoleWatcher(() => this.sync()).start();
    this.exposeDebugHelpers();
  }

  private sync(): void {
    this.applyThemeChange();

    this.filters.sync();
    this.copyButton.sync();
    this.fieldFilter.sync();
  }

  private applyThemeChange(): void {
    const theme = Theme.fingerprint();
    if (theme === this.theme) return;

    this.theme = theme;

    this.filters.destroyAll();
    this.fieldFilter.refresh();
    this.copyButton.refresh();
  }

  private exposeDebugHelpers(): void {
    Object.defineProperty(window, "__fctDebug", {
      value: () => new DocumentExpander().describeCollapsedSample(),
      configurable: true,
    });

    Object.defineProperty(window, "__fctTheme", {
      value: () => Theme.describe(),
      configurable: true,
    });
  }
}

// A crash here leaves no UI at all, so it is reported rather than swallowed.
try {
  new FirestoreConsoleTools().start();
} catch (error) {
  console.error("[Firestore Console Tools] Startup failed:", error);
}
