# Redtape: the look

The reference is `design/comp-home.html` (pictures: `design/look-first-screen.jpg`, `design/look-desktop-1.jpg`,
`design/look-desktop-2.jpg`, `design/look-phone.jpg`). The stylesheet `public/assets/site.css` is that page's
own CSS. Where this file and the comp disagree, the comp wins for the home and this file wins for every other
screen.

## The idea

The founder's question is the page: "How much", then a photograph of real red tape where those two words would
be, then the activity. The answer comes back as three lengths of tape, one per place, with a piece for every
requirement: red where the official page states the fee, open where it does not. Nothing is filled in that an
official page does not say.

## Colour

| Token | Value | Use |
|---|---|---|
| `--paper` | `#ecd89a` | the page: manila, the colour of a file folder |
| `--band` | `#e6cf8a` | every other row of the grid |
| `--tape` | `#c5162e` | the lower half of the first screen, the verdict, the stated pieces of tape, one highlight |
| `--deep` | `#5c0612` | type and fields sunk into the red, the lawyer's section |
| `--ink` | `#17130e` | text on paper, the proof and how-it-works sections, the close and the footer |
| `--bone` | `#f6f1e7` | text on red and on ink, the proof sheet, open pieces of tape |
| `--soft`, `--dim` | `#4a4127`, `#62572f` | secondary text on paper; "not stated" |
| `--rose` | `#f3bcc2` | secondary text on red and on deep red |

Each section is one flat field of one of these. The bar at the top takes the colour of the section under it.
Nothing fades into anything: no gradients, no shadows, no rounded corners, no thin rules, no outlines. A status
is said in words, never by a colour alone.

## Type

**Anton** for display, always capitals, tracking -0.01em, leading 0.86: the headline, section headings, place
names, the four verbs, the wordmark. **Work Sans** 400 and 600 for everything else. Both from Google Fonts'
own stylesheet; the font files are not in this repository.

| Step | Size | Use |
|---|---|---|
| small | 13 to 14px | sources, checked dates, captions, navigation, row names |
| body | 17 to 19px | running text, item names, buttons |
| lead | 20 to 26px | fees in the grid, quotes, supporting sentences |
| sub | 24 to 36px | place names, the two statements set as sentences |
| head | 40 to 88px | section headings |
| display | 11vw (15vw on a phone) | the headline and the close only |

The four verbs over the pictures and the cropped wordmark in the footer are larger still; nothing else is.

## Layout

- The first screen is two fields meeting at half height, paper above and red below. The headline crosses the
  seam and changes ink where it crosses. This happens once.
- A section is a short statement on the left and its proof on the right: a sheet, a list, the grid.
- The grid is a real table: one row per category, one column per place. On a phone each row stacks, and each
  cell says its place.
- A headline is never more than two lines at any width.

## Voice

Plain and exact, a little dry. Short sentences. It says what was read and what was not. "not stated" is never
softened, and a gap is never called an error. No exclamation marks, no promises about the law, and on every page
that shows a comparison: "A starting point to confirm with a lawyer, not legal advice."

## Pictures

Real photographs only, each credited in the footer and on the about page from `design/credits.json`: bundles of
1860s bond coupons tied in red tape (in the headline and behind "Check"), Austin City Hall, Manchester Town
Hall, the Dubai Municipality building. They show the world the paperwork lives in. They are never presented as
the product, and each of the four large ones carries an even dark layer so the word over it reads.

## Never

Gradients, shadows, rounded corners, thin rules, outlined boxes, icons, emoji, a second display face, monospace,
labels in small capitals above headings, numbered steps, status colours without words, a number that is not on
an official page.
