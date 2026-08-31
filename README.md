# Firestore Console Tools

A Chrome extension that adds three things to the Firebase Firestore console: a
search box on every list, a key filter for the fields of an open document, and a
**Copy JSON** button that copies a whole document without you expanding it
first.

It is **read-only by construction**. It holds one permission (`clipboardWrite`),
runs only on `console.firebase.google.com`, talks to no network of its own, and
never clicks a control that could add, edit or delete data — see
[Safety](#safety).

## What it does

### Search any list

Every list panel gets a filter box at the top — collections, documents inside a
collection, and the subcollections of a document. Type to filter that list,
click a result to open it, `Esc` to clear.

The console renders these lists through a virtual scroller, so only the rows on
screen exist in the DOM. Names are collected as rows render, and the first time
you type the extension scrolls the list once (time-boxed to 3s) to pick up the
rest. If that ran out of time, the results end with **scan further** — a 15s
sweep you trigger yourself, so a huge collection is never paged through
automatically.

#### Documents: filter what is loaded, or open an ID outright

A collection can hold more documents than the console will ever page into the
list, and **Firestore cannot search document IDs by substring** — no client-side
trick changes that. So the documents box does two things: it filters the IDs
loaded so far, and it offers **Open "<id>"** (or just press `Enter`) to navigate
straight to that exact ID, whether or not the list ever reached it.

The direct-open URL is derived from the panel's position in the panel chain,
which mirrors the data path — panel 1 lists the documents of path segment 0, and
so on. It is offered for documents only; a collections panel's place in that
chain is ambiguous.

#### Prefix search over the whole collection

Typing a partial ID offers **Search IDs starting with "…"** (or press `Enter`).
That runs server-side over the entire collection — not over what the list
happened to load — and returns instantly regardless of collection size.

It works by building the console's own query-builder URL. The query builder
accepts a **Document ID** condition, which it encodes in the URL as the reserved
`__name__` field, so the extension writes that URL and opens it **in a new tab** —
the panel you were browsing stays where it was:

```
?view=query-view
&query=2|LIM|2/50|WH|1|8/__name__|GTE|STR|3/p60
&scopeType=collection&scopeName=orders
```

`<clauses>|LIM|<len>/<limit>|WH|<conditions>|<len>/<field>|<op>|<type>|<len>/<value>`,
every value prefixed with its length. `src/query-view.ts` builds it; that file
is the only thing to change if the console's encoding moves.

The condition is `>=` with a limit of 50, so results start at your prefix and
run on past it in ID order — the matches are the ones at the top. The prefix is
case-sensitive, because it is a range over byte order.

The plain filter box still filters the IDs already loaded, case-insensitively,
which is faster when what you want is on screen — matches show the matched span
highlighted. `Shift+Enter`, or the **Open** row, opens the typed ID as an exact
document, also in a new tab.

#### Why the loaded list is not enough

The data view stops serving rows into a document list after a few hundred (~600
in the collections we tried), no matter how far you scroll — a console limit, not a Firestore
one. Neither can the panel's funnel filter reach document IDs: it validates
against real field names and rejects `__name__`. Hence the query-builder URL,
which is subject to neither.

## Safety

The reason this is a frontend-only extension is that it must not be able to
change anything. Two rules hold that up:

- No credentials, no API calls, no background page. It reads the DOM the console
  has already rendered.
- Expanding a document only ever clicks a **disclosure control**: an element with
  `aria-expanded="false"`, or, when the console ships no ARIA, an element sitting
  to the *left* of the field key (where the console puts the chevron and never
  puts a row action). Anything labelled edit / delete / add / copy is excluded,
  and a field whose disclosure cannot be identified is skipped and reported —
  the button then reads `Copied (N not expanded)`.

## Install

```bash
npm i
npm run build:zip     # → firestore-console-tools.zip
```

Then in Chrome: `chrome://extensions/` → **Developer mode** on → **Load
unpacked** → select `dist/` (keep the folder where it is; Chrome reads it from
disk on every load). After a rebuild, hit **↺** on the extension card.

## Layout

| File | Role |
| --- | --- |
| `src/console-dom.ts` | Every console selector, in one place |
| `src/list-filter.ts` | `PanelListFilter` per list, `PanelFilterManager` reconciles them |
| `src/field-filter.ts` | Key filter for an open document's fields |
| `src/document-expander.ts` | Opens collapsed maps/arrays before a copy or field search |
| `src/document-parser.ts` | Fields DOM → plain object |
| `src/copy-button.ts` | The breadcrumb button and clipboard write |
| `src/console-watcher.ts` | Re-injects across SPA navigation, ignores our own mutations |
| `src/theme.ts` | Resolves colours from what the console actually paints, light or dark |

## Theme

The console has light and dark themes and marks neither on the elements we
inject into. Rather than assume, `src/theme.ts` reads the first painted
ancestor behind an injected element and uses that as its background, decides
light-vs-dark from the page's own luminance, and picks the matching accent
(`#1a73e8` light, `#8ab4f8` dark). Hovers, borders and dividers are neutral
greys so they read on either. Flipping the theme with the page open remounts
everything, so nothing keeps stale colours.

## When the console changes under us

Firebase's markup is not a public contract, so a console release can break the
selectors. Everything the extension matches on lives in `src/console-dom.ts`,
and the expander is the piece most likely to drift. Open a document with a
collapsed map, run `window.__fctDebug()` in DevTools, and it prints the real
markup of one collapsed field's click target — enough to pin the selector.

Prior art: the collection-filter approach (filtering a virtual-scrolled list via
a harvested name cache and an overlay) is taken from
[`xorrier/copy-fb-doc`](https://github.com/xorrier/copy-fb-doc) by Amrit Sharma.
