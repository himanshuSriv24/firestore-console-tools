// The console ships light and dark themes and marks neither on the elements we
// inject into, so colours are derived from what is actually painted behind us
// rather than assumed.
const DARK_SURFACE = "#1f1f1f";
const LIGHT_SURFACE = "#ffffff";
const DARK_ACCENT = "#8ab4f8";
const LIGHT_ACCENT = "#1a73e8";

export class Theme {
  // Walking up to the first painted ancestor is what keeps an injected strip
  // from cutting a dark band through a light panel.
  static surfaceOf(element: HTMLElement): string {
    const painted = this.paintedAncestor(element);
    if (painted) return painted;

    return this.prefersDark() ? DARK_SURFACE : LIGHT_SURFACE;
  }

  // Never calls surfaceOf: these two would otherwise recurse into each other
  // when nothing in the tree is painted, and take the whole script down.
  private static paintedAncestor(element: HTMLElement): string | null {
    let node: HTMLElement | null = element;

    while (node) {
      const colour = window.getComputedStyle(node).backgroundColor;
      if (this.isPainted(colour)) return colour;

      node = node.parentElement;
    }

    return null;
  }

  private static prefersDark(): boolean {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  // Signature of the painted theme. Sampled from a console panel because the
  // theme is applied below <body>, which stays the same colour either way.
  static fingerprint(): string {
    const reference = this.reference();

    return [
      this.surfaceOf(reference),
      window.getComputedStyle(reference).color,
      window.getComputedStyle(document.body).backgroundColor,
    ].join("|");
  }

  // The element whose paint actually tracks the console's theme.
  static reference(): HTMLElement {
    return (
      document.querySelector<HTMLElement>('[data-test-id$="-panel"]') ??
      document.querySelector<HTMLElement>("fire-breadcrumbs") ??
      document.body
    );
  }

  static describe(): Record<string, string | boolean> {
    const reference = this.reference();

    return {
      isDark: this.isDark(),
      accent: this.accent(),
      referenceTag: reference.tagName.toLowerCase(),
      referenceSurface: this.surfaceOf(reference),
      referenceColour: window.getComputedStyle(reference).color,
      bodySurface: window.getComputedStyle(document.body).backgroundColor,
      rootSurface: window.getComputedStyle(document.documentElement)
        .backgroundColor,
      prefersDark: this.prefersDark(),
      painted: this.paintedAncestor(reference) ?? "(none found)",
      fingerprint: this.fingerprint(),
    };
  }

  static isDark(): boolean {
    const painted = this.paintedAncestor(this.reference());
    const luminance = painted === null ? null : this.luminance(painted);

    if (luminance !== null) return luminance < 0.5;

    return this.prefersDark();
  }

  static accent(): string {
    return this.isDark() ? DARK_ACCENT : LIGHT_ACCENT;
  }

  static accentTint(alpha: number): string {
    const [r, g, b] = this.isDark() ? [138, 180, 248] : [26, 115, 232];
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // Grey tints read correctly on either theme, so hovers and borders use them
  // instead of white-on-white or black-on-black.
  static hoverTint(): string {
    return "rgba(128,128,128,0.18)";
  }

  static subtleTint(): string {
    return "rgba(128,128,128,0.08)";
  }

  static borderColour(): string {
    return "rgba(128,128,128,0.35)";
  }

  static dividerColour(): string {
    return "rgba(128,128,128,0.2)";
  }

  static mutedText(): string {
    return "rgba(128,128,128,0.9)";
  }

  private static isPainted(colour: string): boolean {
    const channels = this.channels(colour);
    return channels !== null && channels.alpha > 0.05;
  }

  private static luminance(colour: string): number | null {
    const channels = this.channels(colour);
    if (!channels) return null;

    const { r, g, b } = channels;

    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }

  private static channels(
    colour: string,
  ): { r: number; g: number; b: number; alpha: number } | null {
    const match = colour.match(
      /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?/i,
    );

    if (!match) return null;

    return {
      r: Number(match[1]),
      g: Number(match[2]),
      b: Number(match[3]),
      alpha: match[4] === undefined ? 1 : Number(match[4]),
    };
  }
}
