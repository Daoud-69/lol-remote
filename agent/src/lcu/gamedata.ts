import { LcuClient } from "./client.js";
import type { Champion, Skin, SummonerSpell } from "../types.js";

/**
 * The client ships its own copy of every champion, spell and skin, plus the
 * artwork. Reading from it means the phone never needs Data Dragon, never goes
 * stale on patch day, and works offline.
 */
export class GameData {
  private champions: Champion[] = [];
  private spells: SummonerSpell[] = [];
  private skinsByChampion = new Map<number, Skin[]>();

  constructor(private readonly lcu: LcuClient) {}

  async load(): Promise<void> {
    const [champions, spells] = await Promise.all([
      this.lcu.get<
        { id: number; name: string; alias: string }[]
      >("/lol-game-data/assets/v1/champion-summary.json"),
      this.lcu.get<
        { id: number; name: string; description: string; gameModes?: string[] }[]
      >("/lol-game-data/assets/v1/summoner-spells.json"),
    ]);

    this.champions = champions
      .filter((c) => c.id > 0) // id -1 is the "None" placeholder
      .map((c) => ({ id: c.id, name: c.name, alias: c.alias }))
      .sort((a, b) => a.name.localeCompare(b.name));

    this.spells = spells
      .filter((s) => s.id > 0 && SELECTABLE_SPELL_IDS.has(s.id))
      .map((s) => ({ id: s.id, name: s.name, description: stripTags(s.description) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getChampions(): Champion[] {
    return this.champions;
  }

  getSpells(): SummonerSpell[] {
    return this.spells;
  }

  championName(id: number): string {
    return this.champions.find((c) => c.id === id)?.name ?? `Champion ${id}`;
  }

  /** Resolves a user-typed name or alias to a champion id. */
  findChampion(query: string): Champion | undefined {
    const needle = query.trim().toLowerCase();
    return this.champions.find(
      (c) => c.name.toLowerCase() === needle || c.alias.toLowerCase() === needle,
    );
  }

  /**
   * Skins available to the local player for a champion, ownership included.
   *
   * During champ select the client exposes a carousel scoped to the champion
   * you locked; outside of it we fall back to the account-wide inventory so the
   * phone can still browse and preset a skin ahead of time.
   */
  async getSkins(championId: number, inChampSelect: boolean): Promise<Skin[]> {
    if (inChampSelect) {
      try {
        const carousel = await this.lcu.get<RawSkin[]>(
          "/lol-champ-select/v1/skin-carousel-skins",
        );
        const skins = carousel.map(toSkin).filter((s) => s.championId === championId || s.championId === 0);
        if (skins.length) return skins.map((s) => ({ ...s, championId }));
      } catch {
        // Not in champ select after all, or the endpoint moved. Fall through.
      }
    }

    const cached = this.skinsByChampion.get(championId);
    if (cached) return cached;

    const owned = await this.lcu.get<{ skins?: RawSkin[] }>(
      `/lol-champions/v1/inventories/${await this.summonerId()}/champions/${championId}`,
    );
    const skins = (owned.skins ?? []).map(toSkin);
    this.skinsByChampion.set(championId, skins);
    return skins;
  }

  private cachedSummonerId: number | null = null;
  private async summonerId(): Promise<number> {
    if (this.cachedSummonerId !== null) return this.cachedSummonerId;
    const me = await this.lcu.get<{ summonerId: number }>(
      "/lol-summoner/v1/current-summoner",
    );
    this.cachedSummonerId = me.summonerId;
    return me.summonerId;
  }

  /** Ownership changes between sessions; drop the cache on reconnect. */
  invalidate(): void {
    this.skinsByChampion.clear();
    this.cachedSummonerId = null;
  }
}

interface RawSkin {
  id: number;
  name: string;
  championId?: number;
  ownership?: { owned: boolean };
  unlocked?: boolean;
  isBase?: boolean;
  chromas?: { id: number; name: string; colors: string[]; ownership?: { owned: boolean } }[];
}

function toSkin(raw: RawSkin): Skin {
  return {
    id: raw.id,
    name: raw.name,
    championId: raw.championId ?? Math.floor(raw.id / 1000),
    unlocked: raw.unlocked ?? raw.ownership?.owned ?? false,
    isBase: raw.isBase ?? raw.id % 1000 === 0,
    chromas: (raw.chromas ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      colors: c.colors ?? [],
      unlocked: c.ownership?.owned ?? false,
    })),
  };
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

/**
 * Spells the player can actually equip. The asset file also lists internal and
 * game-mode-specific entries (Poro Toss, ARAM snowball variants used by the
 * engine) that the client will reject on my-selection.
 */
const SELECTABLE_SPELL_IDS = new Set([
  1, // Cleanse
  3, // Exhaust
  4, // Flash
  6, // Ghost
  7, // Heal
  11, // Smite
  12, // Teleport
  13, // Clarity
  14, // Ignite
  21, // Barrier
  32, // Mark / Dash (ARAM)
  39, // Mark / Dash (Arena)
]);
