/**
 * Whether a newer release is out.
 *
 * The agent is a 99 MB installer people download once and then never think
 * about again, so it has to be the thing that mentions an update — nobody is
 * going to check a releases page on the off chance. GitHub's own API answers
 * this without a key and without anything of ours in the middle.
 *
 * Quiet on every failure: no network, rate-limited, a tag that does not parse.
 * "Could not check" is not news, and an installer that nags because the Wi-Fi
 * dropped is worse than one that says nothing.
 */

const LATEST_RELEASE =
  "https://api.github.com/repos/Daoud-69/lol-remote/releases/latest";

/** Six hours. Releases are not frequent enough to be worth asking more often. */
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export interface UpdateStatus {
  /** What is running, from the app's own package.json. */
  current: string;
  /** The newest published release, or null when the check did not get an answer. */
  latest: string | null;
  /** Where to send someone who wants it. */
  url: string;
  outdated: boolean;
}

export async function checkForUpdate(current: string): Promise<UpdateStatus> {
  const unknown: UpdateStatus = {
    current,
    latest: null,
    url: "https://github.com/Daoud-69/lol-remote/releases/latest",
    outdated: false,
  };

  try {
    const response = await fetch(LATEST_RELEASE, {
      headers: {
        accept: "application/vnd.github+json",
        // GitHub refuses requests without one, and a name it can attribute is
        // better manners than pretending to be a browser.
        "user-agent": "lol-remote-agent",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return unknown;

    const release = (await response.json()) as { tag_name?: string; html_url?: string };
    const latest = (release.tag_name ?? "").replace(/^v/, "");
    if (!latest) return unknown;

    return {
      current,
      latest,
      url: release.html_url ?? unknown.url,
      outdated: compareVersions(latest, current) > 0,
    };
  } catch {
    return unknown;
  }
}

/**
 * Positive when `a` is newer than `b`.
 *
 * Numeric per segment rather than a string compare, which would rank 1.10.0
 * below 1.9.0. A missing segment counts as zero, so 1.7 and 1.7.0 are the same
 * release, and anything non-numeric is treated as zero rather than throwing —
 * a tag nobody expected should not be able to announce a downgrade.
 */
export function compareVersions(a: string, b: string): number {
  const left = a.split(".");
  const right = b.split(".");
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const x = Number.parseInt(left[i] ?? "0", 10) || 0;
    const y = Number.parseInt(right[i] ?? "0", 10) || 0;
    if (x !== y) return x - y;
  }
  return 0;
}
