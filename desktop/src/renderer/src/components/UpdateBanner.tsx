import { ArrowUpRight, Download } from "lucide-react";
import type { UpdateStatus } from "../../../main/updateCheck";

/**
 * Says a newer release exists, and nothing at all otherwise.
 *
 * The agent is installed once and then forgotten, so it has to raise this
 * itself — but only when there is something to raise. A failed check reports
 * `latest: null` and draws nothing: "could not reach GitHub" is not news worth
 * a banner, and an agent that complains because the Wi-Fi dropped teaches
 * people to ignore it.
 *
 * The link opens outside the app. There is no in-place updater here; the
 * installer is the update, and pretending otherwise would mean shipping a
 * download-and-run path that nobody has audited.
 */
export function UpdateBanner({ update }: { update: UpdateStatus | null }) {
  if (!update?.outdated || !update.latest) return null;

  return (
    <a
      href={update.url}
      target="_blank"
      rel="noreferrer"
      className="glass flex items-center gap-3 rounded-[18px] border border-gold/50 bg-gold/[0.06] px-4 py-3 transition-colors hover:border-gold"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-gold/40 bg-gold/10 text-gold">
        <Download className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-sm font-bold uppercase tracking-wider text-gold">
          Version {update.latest} is out
        </span>
        <span className="block text-[11px] text-ink-dim">
          You are running {update.current}. Download the new installer and run it over this one.
        </span>
      </span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-gold" />
    </a>
  );
}
