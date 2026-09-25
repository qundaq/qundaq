# Logo

Source artwork for the Qundaq logo. Files in this folder are **not** shipped with the app; the app only serves what is in `public/`.

## Files

| File | What it is |
|---|---|
| `qundaq-icon-source.png` | Original colour artwork (771×769, real transparency around a rounded dark tile). |
| `qundaq-icon.png` | Master app icon, 760×760. It is a full-bleed dark tile with the gold/teal emblem and no transparency, so the system can round the corners itself. |
| `qundaq-mark-white.png` | Emblem only: white strokes on a transparent background, for dark surfaces. |
| `qundaq-mark-dark.png` | Emblem only: dark strokes on a transparent background, for light surfaces. |

## How the app icons were made

1. `qundaq-icon.png` was built from `qundaq-icon-source.png` in three steps:
   - the source was flattened onto a solid `#212121` tile;
   - the emblem (with its glow and the surrounding tile texture) was cut out as a soft-edged circle;
   - the circle was centred on a 760×760 tile of the same colour.

   Starting from the transparent source as-is would not work on iOS. iOS fills transparent areas with black, which would draw a thin black frame around the tile. Building a full-bleed tile avoids that and leaves room for the rounded mask iOS applies.
2. Every icon in `public/` is a downscale of `qundaq-icon.png`:

| File | Size | Used for |
|---|---|---|
| `public/icons/icon-180.png` | 180×180 | iOS home screen (`apple-touch-icon`) |
| `public/icons/icon-192.png` | 192×192 | Web app manifest |
| `public/icons/icon-512.png` | 512×512 | Web app manifest, splash |
| `public/icons/favicon-32.png`, `favicon-16.png` | 32×32, 16×16 | Browser tab |
| `public/favicon.ico` | 16, 32, 48 | Browser tab (legacy) |

When replacing the artwork:
- Export square icons with a solid background.
- Keep the emblem inside the central ~80%.
- Run `npm run build` afterwards.

## Origin

| File | Source | License |
|---|---|---|
| `qundaq-icon-source.png` | AI-generated with Google Gemini by the project maintainer (2026-09-25) | Released with the project under MIT, to the extent any rights exist in AI-generated output |
| `qundaq-mark-white.png`, `qundaq-mark-dark.png` | Derived from a white variant of the same Gemini-generated artwork (2026-09-25) | As above |
| `qundaq-icon.png` and the icons in `public/` | Derived from `qundaq-icon-source.png` | As above |
