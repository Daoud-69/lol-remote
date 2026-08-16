import { LcuClient, LcuError } from "./client.js";
import type {
  Perk,
  PerkSlot,
  PerkStyle,
  RecommendedRunePage,
  RunePage,
} from "../types.js";

/**
 * The page the agent owns and rewrites. Everything here is careful to touch
 * only this page: accounts have a hard cap on rune pages (three, on a
 * non-purchased account) and the ones already there are usually curated.
 */
export const AGENT_PAGE_NAME = "LoL Remote";

/** Summoner's Rift. Recommendations are per-map and this is the only one we drive. */
const SUMMONERS_RIFT = 11;

interface RawPage {
  id: number;
  name: string;
  current: boolean;
  isDeletable: boolean;
  isEditable: boolean;
  isTemporary: boolean;
  primaryStyleId: number;
  /** The client names the secondary tree `subStyleId` on both read and write. */
  subStyleId: number;
  selectedPerkIds: number[];
}

export interface StoredPage extends RunePage {
  id: number;
  name: string;
  current: boolean;
  isDeletable: boolean;
}

function toStored(raw: RawPage): StoredPage {
  return {
    id: raw.id,
    name: raw.name,
    current: raw.current,
    isDeletable: raw.isDeletable,
    primaryStyleId: raw.primaryStyleId,
    secondaryStyleId: raw.subStyleId,
    selectedPerkIds: raw.selectedPerkIds ?? [],
  };
}

export async function listPages(lcu: LcuClient): Promise<StoredPage[]> {
  const pages = await lcu.get<RawPage[]>("/lol-perks/v1/pages");
  // Temporary pages are the client's own scratch space (champ-select
  // recommendations it stages for you); they are not pages the player owns.
  return pages.filter((page) => !page.isTemporary).map(toStored);
}

// --- Catalog ---------------------------------------------------------------

interface RawStyle {
  id: number;
  name: string;
  iconPath: string;
  allowedSubStyles: number[];
  slots: { type: string; perks: number[] }[];
}

interface RawPerk {
  id: number;
  name: string;
  shortDesc: string;
  iconPath: string;
  styleId: number;
  slotType: string;
}

export async function readCatalog(
  lcu: LcuClient,
): Promise<{ styles: PerkStyle[]; perks: Perk[] }> {
  const [styles, perks] = await Promise.all([
    lcu.get<RawStyle[]>("/lol-perks/v1/styles"),
    lcu.get<RawPerk[]>("/lol-perks/v1/perks"),
  ]);

  return {
    styles: styles.map((style) => ({
      id: style.id,
      name: style.name,
      iconPath: style.iconPath,
      allowedSubStyles: style.allowedSubStyles ?? [],
      slots: (style.slots ?? []).map(
        (slot): PerkSlot => ({
          type: slot.type as PerkSlot["type"],
          perkIds: slot.perks ?? [],
        }),
      ),
    })),
    perks: perks
      .filter((perk) => perk.slotType)
      .map((perk) => ({
        id: perk.id,
        name: perk.name,
        shortDesc: stripTags(perk.shortDesc ?? ""),
        iconPath: perk.iconPath,
        styleId: perk.styleId,
        slotType: perk.slotType,
      })),
  };
}

// --- Recommendations -------------------------------------------------------

interface RawRecommendation {
  recommendationId: string;
  position: string;
  primaryPerkStyleId: number;
  secondaryPerkStyleId: number;
  keystone: { id: number; name: string; iconPath: string };
  perks: { id: number }[];
  summonerSpellIds: number[];
}

/**
 * The client's own rune suggestions for a champion in a role.
 *
 * `position` is required by the endpoint; "NONE" is accepted and is what we
 * send for modes with no roles, which still returns the generic set.
 */
export async function recommendedPages(
  lcu: LcuClient,
  championId: number,
  position: string,
): Promise<RecommendedRunePage[]> {
  const slug = position || "NONE";
  const raw = await lcu.get<RawRecommendation[]>(
    `/lol-perks/v1/recommended-pages/champion/${championId}/position/${slug}/map/${SUMMONERS_RIFT}`,
  );

  return raw.map((page) => ({
    recommendationId: page.recommendationId,
    position: page.position,
    primaryStyleId: page.primaryPerkStyleId,
    secondaryStyleId: page.secondaryPerkStyleId,
    selectedPerkIds: (page.perks ?? []).map((perk) => perk.id),
    keystoneId: page.keystone?.id ?? 0,
    keystoneName: page.keystone?.name ?? "",
    keystoneIconPath: page.keystone?.iconPath ?? "",
    summonerSpellIds: page.summonerSpellIds ?? [],
  }));
}

// --- Applying --------------------------------------------------------------

export class RunePageError extends Error {}

/**
 * Makes `page` the active rune page, under a name that says where it came from.
 *
 * Accounts cap how many pages they can hold, and this one is already at its
 * cap, so "create a page per champion" is not available. Instead the agent
 * keeps exactly one page of its own and rewrites it: delete ours if it exists,
 * then create it again with the new runes. Pages the player made are never
 * touched — if there is no room and no page of ours to reclaim, we say so
 * rather than deleting someone's curated setup to make space.
 */
export async function applyRunePage(
  lcu: LcuClient,
  page: RunePage,
  label: string,
): Promise<void> {
  if (page.selectedPerkIds.length !== 9) {
    throw new RunePageError(
      `A rune page needs 9 perks, got ${page.selectedPerkIds.length}.`,
    );
  }

  const existing = await listPages(lcu);
  const ours = existing.find((candidate) => candidate.name.startsWith(AGENT_PAGE_NAME));

  if (ours) {
    if (!ours.isDeletable) {
      throw new RunePageError(`The "${ours.name}" page cannot be replaced.`);
    }
    await lcu.delete(`/lol-perks/v1/pages/${ours.id}`);
  } else {
    const inventory = await lcu.get<{ canAddCustomPage: boolean }>(
      "/lol-perks/v1/inventory",
    );
    if (!inventory.canAddCustomPage) {
      throw new RunePageError(
        "No free rune page slot. Delete one in the League client and the agent will use it from then on.",
      );
    }
  }

  try {
    // `subStyleId` is what the create endpoint calls the secondary tree; the
    // read side spells the same field `secondaryStyleId`.
    const created = await lcu.post<{ id: number }>("/lol-perks/v1/pages", {
      name: `${AGENT_PAGE_NAME} — ${label}`.slice(0, 75),
      primaryStyleId: page.primaryStyleId,
      subStyleId: page.secondaryStyleId,
      selectedPerkIds: page.selectedPerkIds,
      current: true,
    });

    // Creating with `current: true` usually selects it, but not on every
    // client build — make it explicit so the runes actually go live.
    if (created?.id) {
      await lcu.put("/lol-perks/v1/currentpage", created.id).catch(() => undefined);
    }
  } catch (error) {
    if (error instanceof LcuError) {
      throw new RunePageError(`The client rejected the rune page (${error.status}).`);
    }
    throw error;
  }
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}
