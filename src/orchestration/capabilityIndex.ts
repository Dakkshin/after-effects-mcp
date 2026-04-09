export type CapabilityIndexSummary = {
  catalogVersion: string | null;
  aeVersion: string | null;
  generatedAt: string | null;
  cached: boolean;
  cachePath: string | null;
  counts: {
    layerTypes: number;
    propertyGroups: number;
    effectCatalog: number;
    fonts: number;
    compatibilityWarnings: number;
  };
  layerTypes: Array<{ name: string; matchName: string | null }>;
  propertyGroups: Array<{ name: string; matchName: string | null }>;
  effectCatalogSample: Array<{ displayName: string; matchName: string | null }>;
  fontSource: string | null;
};

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export function buildCapabilityIndex(result: any): CapabilityIndexSummary {
  const catalog = result?.catalog || {};
  const layerTypes = asArray<any>(catalog.layerTypes);
  const propertyGroups = asArray<any>(catalog.propertyGroups);
  const effectCatalog = asArray<any>(catalog.effectCatalog);
  const fonts = asArray<any>(catalog?.fontSources?.fonts);
  const warnings = asArray<any>(catalog.compatibilityWarnings);

  return {
    catalogVersion: catalog.catalogVersion || null,
    aeVersion: catalog.aeVersion || null,
    generatedAt: catalog.generatedAt || null,
    cached: result?.cached === true,
    cachePath: result?.cachePath || null,
    counts: {
      layerTypes: layerTypes.length,
      propertyGroups: propertyGroups.length,
      effectCatalog: effectCatalog.length,
      fonts: fonts.length,
      compatibilityWarnings: warnings.length
    },
    layerTypes: layerTypes.map((entry) => ({
      name: String(entry?.name || ""),
      matchName: entry?.matchName || null
    })),
    propertyGroups: propertyGroups.map((entry) => ({
      name: String(entry?.name || ""),
      matchName: entry?.matchName || null
    })),
    effectCatalogSample: effectCatalog.slice(0, 20).map((entry) => ({
      displayName: String(entry?.displayName || entry?.name || ""),
      matchName: entry?.matchName || null
    })),
    fontSource: catalog?.fontSources?.source || null
  };
}

function scoreText(text: string, query: string): number {
  const normalizedText = String(text || "").toLowerCase();
  const normalizedQuery = String(query || "").toLowerCase();
  if (!normalizedQuery) {
    return 0;
  }
  if (normalizedText === normalizedQuery) {
    return 100;
  }
  if (normalizedText.startsWith(normalizedQuery)) {
    return 75;
  }
  if (normalizedText.includes(normalizedQuery)) {
    return 50;
  }
  return 0;
}

export function searchCapabilityCatalog(result: any, query: string, limit = 20) {
  const catalog = result?.catalog || {};
  const matches: Array<Record<string, unknown>> = [];

  for (const entry of asArray<any>(catalog.layerTypes)) {
    const score = Math.max(
      scoreText(entry?.name, query),
      scoreText(entry?.matchName, query)
    );
    if (score > 0) {
      matches.push({
        kind: "layerType",
        score,
        name: entry?.name || null,
        matchName: entry?.matchName || null,
        topLevelGroups: asArray<any>(entry?.topLevelGroups).length
      });
    }
  }

  for (const entry of asArray<any>(catalog.propertyGroups)) {
    const score = Math.max(
      scoreText(entry?.name, query),
      scoreText(entry?.matchName, query)
    );
    if (score > 0) {
      matches.push({
        kind: "propertyGroup",
        score,
        name: entry?.name || null,
        matchName: entry?.matchName || null
      });
    }
  }

  for (const entry of asArray<any>(catalog.effectCatalog)) {
    const score = Math.max(
      scoreText(entry?.displayName, query),
      scoreText(entry?.matchName, query)
    );
    if (score > 0) {
      matches.push({
        kind: "effect",
        score,
        displayName: entry?.displayName || null,
        matchName: entry?.matchName || null,
        propertyCount: asArray<any>(entry?.properties).length
      });
    }
  }

  for (const entry of asArray<any>(catalog?.fontSources?.fonts)) {
    const family = typeof entry === "string" ? entry : entry?.name || entry?.family || "";
    const score = scoreText(family, query);
    if (score > 0) {
      matches.push({
        kind: "font",
        score,
        name: family || null
      });
    }
  }

  return matches
    .sort((a, b) => Number(b.score) - Number(a.score) || String(a.kind).localeCompare(String(b.kind)))
    .slice(0, Math.max(1, limit));
}
