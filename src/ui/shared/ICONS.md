# Icons

Inline SVG icon set copied from [Lucide](https://lucide.dev) release `0.469.0`. Each entry in
`icons.ts` is the inner markup (`<path>`, `<circle>`, `<rect>`, `<line>`, `<polyline>`,
`<polygon>`) of that release's SVG for the name, with no `<svg>` wrapper and no colour, class or
other attribute carried over. `Icon.tsx` renders that markup inside an `<svg>` it owns
(`viewBox="0 0 24 24"`, `stroke="currentColor"`, `fill="none"`).

## Licence

Lucide is ISC licensed:

```
ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

(Copied from <https://github.com/lucide-icons/lucide/blob/0.469.0/LICENSE>.)

## Names

`house`, `list`, `chart-column`, `audio-lines`, `sliders-horizontal`, `heart`, `milk`, `moon`,
`baby`, `ellipsis`, `droplets`, `ruler`, `thermometer`, `pill`, `notebook-pen`, `plus`, `pencil`,
`trash-2`, `check`, `x`, `chevron-left`, `chevron-right`, `calendar`, `undo-2`, `play`, `pause`,
`volume-2`, `download`, `upload`, `triangle-alert`, `info`

## Adding an icon

Add an icon by copying its inner SVG from the same release; do not mix releases; no icon is
fetched at runtime.
