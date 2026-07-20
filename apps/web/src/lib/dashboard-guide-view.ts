import type {
  GuideGlossaryDefinition,
  GuidePageDefinition,
  GuideTone,
} from "./dashboard-guide-content";

export function normalizeGuideSearch(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

function includesSearch(haystack: readonly string[], search: string): boolean {
  if (search.length === 0) return true;
  return haystack.some((value) => normalizeGuideSearch(value).includes(search));
}

export function guidePageMatchesSearch(
  page: GuidePageDefinition,
  rawSearch: string,
): boolean {
  const search = normalizeGuideSearch(rawSearch);
  return includesSearch(
    [
      page.title,
      page.shortTitle,
      page.purpose,
      page.useWhen,
      page.remember,
      ...page.features,
      ...page.searchTerms,
    ],
    search,
  );
}

export function guideGlossaryMatchesSearch(
  item: GuideGlossaryDefinition,
  rawSearch: string,
): boolean {
  const search = normalizeGuideSearch(rawSearch);
  return includesSearch([item.term, item.meaning, ...item.searchTerms], search);
}

export function filterGuidePages(
  pages: readonly GuidePageDefinition[],
  rawSearch: string,
): readonly GuidePageDefinition[] {
  return pages.filter((page) => guidePageMatchesSearch(page, rawSearch));
}

export function filterGuideGlossary(
  items: readonly GuideGlossaryDefinition[],
  rawSearch: string,
): readonly GuideGlossaryDefinition[] {
  return items.filter((item) => guideGlossaryMatchesSearch(item, rawSearch));
}

export function guideToneClass(tone: GuideTone): string {
  return {
    bull: "border-bull/30 bg-bull-muted text-bull",
    wait: "border-wait/30 bg-wait-muted text-wait",
    bear: "border-bear/30 bg-bear-muted text-bear",
    accent: "border-accent/30 bg-accent/10 text-accent",
    default: "border-panel-border bg-muted text-muted-foreground",
  }[tone];
}
