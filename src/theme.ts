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
    let node: HTMLElement | null = element;

    while (node) {
      const colour = window.getComputedStyle(node).backgroundColor;
      if (this.isPainted(colour)) return colour;

      node = node.parentElement;
    }

    return this.isDark() ? DARK_SURFACE : LIGHT_SURFACE;
  }

  static isDark(): boolean {
    const luminance = this.luminance(this.pageSurface());

    if (luminance !== null) return luminance < 0.5;

    return window.matchMedia("(prefers-color-scheme: dark)").matches;
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

  private static pageSurface(): string {
    for (const element of [document.body, document.documentElement]) {
      if (!element) continue;

      const colour = window.getComputedStyle(element).backgroundColor;
      if (this.isPainted(colour)) return colour;
    }

    return "";
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
