// The document every screen shares: the head (title, Google Fonts, the site's sheet), the bar,
// the footer with the legal line and the picture credits, and the page script. A running
// comparison's page also sends a refresh. Pages work without script.
import type { Child } from "hono/jsx";
import { raw } from "hono/html";
import creditsJson from "../../design/credits.json";

const FONTS = "https://fonts.googleapis.com/css2?family=Anton:wght@400&family=Work+Sans:wght@400;600&display=swap";

const credits = creditsJson as { credit?: string }[];
const creditLine = credits.map((c) => c.credit ?? "").filter((c) => c !== "").join(" · ");

export const SECURITY_HEADERS = {
  "content-security-policy":
    "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
} as const;

export function Layout(props: { title: string; description: string; refreshSeconds?: number; children: Child }) {
  return (
    <>
      {raw("<!doctype html>")}
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          {props.refreshSeconds !== undefined ? <meta http-equiv="refresh" content={String(props.refreshSeconds)} /> : null}
          <title>{props.title}</title>
          <meta name="description" content={props.description} />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
          <link href={FONTS} rel="stylesheet" />
          <link rel="stylesheet" href="/assets/site.css" />
          {raw("<noscript><style>.in{opacity:1;transform:none}</style></noscript>")}
          <script src="/assets/site.js" defer></script>
        </head>
        <body>{props.children}</body>
      </html>
    </>
  );
}

export function Bar(props: { gridHref: string; askHref: string }) {
  return (
    <header id="bar">
      <a class="mark disp" href="/">
        Redtape
      </a>
      <nav>
        <a href={props.gridHref}>The comparison</a>
        <a href="/how">How it works</a>
        <a href="/comparisons">Saved</a>
        <a href="/api">API</a>
        <a class="btn" href={props.askHref}>
          Measure yours
        </a>
      </nav>
    </header>
  );
}

export function Footer(props: { gridHref: string }) {
  return (
    <footer data-ink="dark" data-bg="ink">
      <div class="top">
        <p class="invite disp in">
          Hand it to
          <br />
          your lawyer
        </p>
        <ul class="in">
          <li>
            <a href={props.gridHref}>The comparison</a>
          </li>
          <li>
            <a href="/how">How it works</a>
          </li>
          <li>
            <a href="/comparisons">Saved</a>
          </li>
          <li>
            <a href="/api">API</a>
          </li>
        </ul>
      </div>
      <div class="legal">
        <p>Built by Hamdan Esmail for the TinyFish Compliance Map bounty. A starting point to confirm with a lawyer, not legal advice.</p>
        <p>Pictures: {creditLine}</p>
      </div>
      <div class="big disp" aria-hidden="true">
        Redtape
      </div>
    </footer>
  );
}

export const HOME_TITLE = "Redtape: how much red tape, in three places";
export const HOME_DESCRIPTION =
  "Type one activity and three places. Redtape lines up every licence, fee and wait from official government pages, each with its proof.";
