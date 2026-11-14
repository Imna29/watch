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

/** Giorgi for Mariam, Mariam for Giorgi. */
export function otherViewer(viewer: Viewer): Viewer {
  return viewer === "giorgi" ? "mariam" : "giorgi";
}

/** The other Viewer's name, for `viewer`; "the other Viewer" while it is not known who is signed in. */
export function otherViewerName(viewer: Viewer | null): string {
  return viewer ? VIEWER_NAMES[otherViewer(viewer)] : "the other Viewer";
}
