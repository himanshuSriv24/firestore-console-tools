import { ConsoleDom, MARKER_ATTRIBUTE, nextFrame, warn } from "./console-dom";
import { DocumentExpander } from "./document-expander";
import { DocumentParser } from "./document-parser";
import { Theme } from "./theme";

const FEEDBACK_MS = 2000;

export class CopyJsonButton {
  private readonly expander = new DocumentExpander();
  private readonly parser = new DocumentParser();

  private button: HTMLButtonElement | null = null;
  private busy = false;
  private accent = "";

  refresh(): void {
    this.button?.remove();
    this.button = null;
  }

  sync(): void {
    if (this.button?.isConnected && this.accent === Theme.accent()) return;

    this.button?.remove();

    const fieldsPanel = ConsoleDom.fieldsPanel();
    const crumbs = ConsoleDom.breadcrumbs();

    if (!fieldsPanel || !crumbs) {
      this.button = null;
      return;
    }

    this.accent = Theme.accent();
    this.button = this.build();

    crumbs.style.display = "flex";
    crumbs.style.alignItems = "center";
    crumbs.appendChild(this.button);
  }

  private build(): HTMLButtonElement {
    const button = document.createElement("button");
    button.setAttribute(MARKER_ATTRIBUTE, "copy-json");
    button.type = "button";
    button.textContent = "Copy JSON";
    button.title = "Expand every field and copy this document as JSON";

    Object.assign(button.style, {
      marginLeft: "auto",
      padding: "6px 14px",
      fontSize: "12px",
      fontWeight: "500",
      cursor: "pointer",
      border: `1px solid ${Theme.borderColour()}`,
      borderRadius: "4px",
      background: "transparent",
      color: "inherit",
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      whiteSpace: "nowrap",
      transition: "background 0.15s, border-color 0.15s",
    });

    button.addEventListener("mouseenter", () => {
      button.style.background = Theme.hoverTint();
      button.style.borderColor = Theme.accent();
    });

    button.addEventListener("mouseleave", () => {
      button.style.background = "transparent";
      button.style.borderColor = Theme.borderColour();
    });

    button.addEventListener("click", (event) => {
      event.stopPropagation();
      void this.copy();
    });

    return button;
  }

  private async copy(): Promise<void> {
    if (this.busy) return;

    const fieldsPanel = ConsoleDom.fieldsPanel();
    if (!fieldsPanel) return;

    this.busy = true;
    this.setLabel("Expanding…");

    try {
      const expansion = await this.expander.expandAll(fieldsPanel);

      // The last batch of children needs a frame to render before parsing.
      await nextFrame(120);

      const data = this.parser.parse(fieldsPanel);

      if (!data || Object.keys(data).length === 0) {
        this.setLabel("Nothing to copy", FEEDBACK_MS);
        warn("Parsed no fields. Run window.__fctDebug() and share the output.");
        return;
      }

      const json = JSON.stringify(data, null, 2);
      const copied = await this.writeToClipboard(json);

      if (!copied) {
        this.setLabel("Copy failed", FEEDBACK_MS);
        warn("Clipboard write failed. JSON:", json);
        return;
      }

      this.setLabel(
        expansion.unresolved > 0
          ? `Copied (${expansion.unresolved} not expanded)`
          : "Copied!",
        FEEDBACK_MS,
      );
    } finally {
      this.busy = false;
    }
  }

  private async writeToClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return this.writeViaTextarea(text);
    }
  }

  private writeViaTextarea(text: string): boolean {
    const textarea = window.document.createElement("textarea");
    textarea.setAttribute(MARKER_ATTRIBUTE, "clipboard-fallback");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";

    window.document.body.appendChild(textarea);
    textarea.select();

    try {
      return window.document.execCommand("copy");
    } catch {
      return false;
    } finally {
      textarea.remove();
    }
  }

  private setLabel(text: string, resetAfterMs?: number): void {
    const button = this.button;
    if (!button) return;

    button.textContent = text;

    if (resetAfterMs === undefined) return;

    setTimeout(() => {
      if (button.isConnected) button.textContent = "Copy JSON";
    }, resetAfterMs);
  }
}
