# Logo

Source artwork for the Qundaq logo lives here. Files in this folder are **not** shipped with the app; the app only serves what is in `public/`.

## What to put here

- `qundaq-logo.svg`: the master logo (vector, preferred)
- `qundaq-mark.svg`: the square symbol used for app icons (no text, works at 32px)
- Any exported previews you want to keep next to them

Only add artwork you created yourself or that is licensed for this project. Note its origin below.

## Exporting app icons

The app uses three square PNGs in `public/icons/`. Replace them with exports of `qundaq-mark.svg`:

| File | Size | Used for |
|---|---|---|
| `icon-180.png` | 180×180 | iOS home screen (`apple-touch-icon`) |
| `icon-192.png` | 192×192 | Web app manifest |
| `icon-512.png` | 512×512 | Web app manifest, splash |

Tips:
- Use a solid background. iOS fills transparent areas with black.
- Keep the symbol inside the central ~80% so rounded corners never clip it.
- After replacing the icons, build and check that nothing external slipped in: `npm run build`.

## Origin

| File | Author | License |
|---|---|---|
| — | — | — |
