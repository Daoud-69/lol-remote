/**
 * Where an automatic rune page comes from.
 *
 * The saved per-champion pages are the app's own answer and always win. This
 * is the layer underneath them: what to do for a champion you never configured,
 * so "apply runes on lock" does something sensible with no setup at all.
 *
 * It is an interface rather than a direct call to the client because the
 * client's recommendation is the only source that ships today, not the only one
 * that makes sense. A community source — the win-rate pages a site like u.gg
 * derives from millions of games — is the same shape: champion and role in, a
 * page out. Nothing above this file knows which kind it is talking to, so
 * adding one is writing a `RuneSource` and listing it in `RUNE_SOURCES`.
 *
 * That is also why `load` takes the LCU client in its context and may ignore
 * it: an HTTP-backed source needs the champion and the role, not the client.
 */

import type { LcuClient } from "./lcu/client.js";
import { recommendedPages } from "./lcu/runes.js";
import type { RunePage, RuneSourceId } from "./types.js";

export interface RuneSourceContext {
  championId: number;
  /** For log lines and page names; sources that key on a name rather than an id can use it. */
  championName: string;
  /** Uppercased role the client assigned, "" in modes without roles. */
  position: string;
  lcu: LcuClient;
}

export interface SourcedRunePage extends RunePage {
  /** Phrased to read inside "Applied … for Viego." in the activity log. */
  origin: string;
}

export interface RuneSource {
  id: RuneSourceId;
  /** Shown in the settings picker. */
  label: string;
  /** The one-line explanation under that label. */
  help: string;
  /** Null when this source has nothing for the champion — never a throw for "no data". */
  load(context: RuneSourceContext): Promise<SourcedRunePage | null>;
}

/**
 * A page is only worth sending to the client if it is actually a page.
 *
 * The client's own recommendations are well-formed, but an external source is
 * somebody else's JSON and can change shape without warning — better to notice
 * that here, where it costs a log line, than to have `applyRunePage` reject it
 * or, worse, write a half-built page over the one slot the agent owns.
 */
export function isUsablePage(page: RunePage): boolean {
  if (!Number.isInteger(page.primaryStyleId) || page.primaryStyleId <= 0) return false;
  if (!Number.isInteger(page.secondaryStyleId) || page.secondaryStyleId <= 0) return false;
  if (page.selectedPerkIds.length !== 9) return false;
  return page.selectedPerkIds.every((id) => Number.isInteger(id) && id > 0);
}

/**
 * The client's own suggestion for the champion in the role it assigned.
 *
 * Riot returns these best-first, but not always for the role asked about — the
 * endpoint falls back to the champion's other roles rather than answering with
 * nothing, so an exact positional match is preferred and the first entry is
 * only the consolation prize.
 */
const clientRecommendation: RuneSource = {
  id: "client",
  label: "The client's recommendation",
  help: "Riot's own suggestion for that champion and role. Needs nothing set up.",

  async load({ lcu, championId, position }) {
    const pages = await recommendedPages(lcu, championId, position);
    if (pages.length === 0) return null;

    const exact = position
      ? pages.find((page) => page.position.toUpperCase() === position)
      : undefined;
    const chosen = exact ?? pages[0];

    const page: RunePage = {
      primaryStyleId: chosen.primaryStyleId,
      secondaryStyleId: chosen.secondaryStyleId,
      selectedPerkIds: chosen.selectedPerkIds,
    };
    if (!isUsablePage(page)) return null;

    return { ...page, origin: "the client's recommendation" };
  },
};

/** Every source the agent knows about, keyed by what gets stored in settings. */
export const RUNE_SOURCES: RuneSource[] = [clientRecommendation];

/** Null for "none", and for an id saved by a build that had a source this one does not. */
export function resolveRuneSource(id: RuneSourceId): RuneSource | null {
  if (id === "none") return null;
  return RUNE_SOURCES.find((source) => source.id === id) ?? null;
}
