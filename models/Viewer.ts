/** The only two people who can use the site (GLOSSARY.md, ADR 0001). */
export const VIEWERS = ["giorgi", "mariam"] as const;

export type Viewer = (typeof VIEWERS)[number];

export const VIEWER_NAMES: Record<Viewer, string> = {
  giorgi: "Giorgi",
  mariam: "Mariam",
};

export function isViewer(value: unknown): value is Viewer {
  return (VIEWERS as readonly unknown[]).includes(value);
}
