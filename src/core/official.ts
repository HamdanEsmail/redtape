// A host is a government domain when it ends with one of the suffixes below, or sits on the short
// list of official portals that are not themselves a government suffix (gov.uk, service-public.fr).
// The list is a label and a search preference, never a reason to reject a source.

const LISTED = ["gov.uk", "service-public.fr", "rijksoverheid.nl"] as const;

const SUFFIX = /(^|\.)((gov|gouv|gob|go|govt)\.[a-z0-9-]+|gov|mil|gc\.ca|europa\.eu|admin\.ch|bund\.de)$/i;

// The older addresses of United States state, city and county governments: sos.state.tx.us,
// ci.<city>.tx.us, co.<county>.tx.us.
const US_LOCAL = /(^|\.)(state|(ci|co)\.[a-z0-9-]+)\.[a-z]{2}\.us$/i;

function hostOf(value: string): string {
  let h = value.trim().toLowerCase();
  if (h.includes("://")) {
    try {
      h = new URL(h).hostname;
    } catch {
      // keep the trimmed value
    }
  }
  return h.replace(/\.$/, "").replace(/^www\./, "");
}

/** True when `host` (or a URL's host) is a government domain. */
export function isGovernmentDomain(host: string): boolean {
  const h = hostOf(host);
  if (h === "") return false;
  if (LISTED.some((name) => h === name || h.endsWith(`.${name}`))) return true;
  return SUFFIX.test(h) || US_LOCAL.test(h);
}

/** The label shown for a source's host. An official body that is not on a government domain is
 *  named, not hidden. */
export function sourceLabel(host: string): string {
  return isGovernmentDomain(host) ? "government domain" : "official body's own site, not a government domain";
}
