// Shared, framework-agnostic types + pure helpers for the global scope filter.
// No server-only imports here so the client ScopeBar can use these too. The
// scope is a cascading Section › Season › League › Flight selection, encoded in
// the URL (?section=&season=&league=&flight=) and applied server-side as a
// player-participation filter.

export interface ScopeNode {
  id: string;
  name: string;
  n: number; // distinct players in scope at this node
  children?: ScopeNode[];
}

export interface ScopeTree {
  total: number; // distinct players across everything
  sections: ScopeNode[]; // section → seasons → leagues → flights
}

export interface Scope {
  section: string | null;
  season: string | null;
  league: string | null;
  flight: string | null;
}

export const EMPTY_SCOPE: Scope = { section: null, season: null, league: null, flight: null };

// Cookie that persists the scope across navigation (read server-side, written
// client-side). Defined here so both the client bar and server lib can use it.
export const SCOPE_COOKIE = "mm-scope";

export function scopeFromParams(p: {
  section?: string | null;
  season?: string | null;
  league?: string | null;
  flight?: string | null;
}): Scope {
  return {
    section: p.section || null,
    season: p.season || null,
    league: p.league || null,
    flight: p.flight || null,
  };
}

export function scopeIsEmpty(s: Scope): boolean {
  return !s.section && !s.season && !s.league && !s.flight;
}

export function scopeDepth(s: Scope): number {
  if (s.flight) return 4;
  if (s.league) return 3;
  if (s.season) return 2;
  if (s.section) return 1;
  return 0;
}

const find = (nodes: ScopeNode[] | undefined, id: string | null): ScopeNode | null =>
  (id && nodes?.find((n) => n.id === id)) || null;

// Resolve the selected node at each level (respecting the cascade).
export function scopeNodes(tree: ScopeTree, s: Scope) {
  const section = find(tree.sections, s.section);
  const season = find(section?.children, s.season);
  const league = find(season?.children, s.league);
  const flight = find(league?.children, s.flight);
  return { section, season, league, flight };
}

// Cascading option lists: a level's options come from its parent's children.
export function scopeOptions(tree: ScopeTree, s: Scope) {
  const { section, season, league } = scopeNodes(tree, s);
  return {
    sections: tree.sections,
    seasons: section?.children ?? [],
    leagues: season?.children ?? [],
    flights: league?.children ?? [],
  };
}

// Players in the narrowest chosen level (or the grand total when unscoped).
export function scopeCount(tree: ScopeTree, s: Scope): number {
  const { section, season, league, flight } = scopeNodes(tree, s);
  return flight?.n ?? league?.n ?? season?.n ?? section?.n ?? tree.total;
}

// Human-readable summary, e.g. "USTA NorCal · 2026 · Men 3.5".
export function scopeSummary(tree: ScopeTree, s: Scope): string {
  const { section, season, league, flight } = scopeNodes(tree, s);
  const parts = [section?.name, season?.name, league?.name, flight?.name].filter(Boolean);
  return parts.length ? (parts as string[]).join(" · ") : "All of USTA";
}
