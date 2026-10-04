# Sound sources

Every sound Qundaq can play is listed here with where it comes from and under which licence. The app
shows this file under Ayarlar → Hakkında → Ses kaynakları.

## Bundled recordings

Every sound Qundaq can play is a recording shipped with the app, listed below with where it comes from
and under which licence. Nothing is downloaded at run time: the files are part of the app and are cached
on the phone with everything else. Only CC0 files, or files generated with an AI tool, are used.

## Safety

The app caps the volume (Ayarlar → Ses güvenlik sınırı, default 50 %) and shows this advice: keep the
phone out of the crib, at least 2 metres away, keep the volume as low as works, and use the sleep timer
rather than playing all night. Source: Hugh SC, Wolter NE, Propst EJ, Gordon KA, Cushing SL, Papsin BC.
"Infant sleep machines and hazardous sound pressure levels." Pediatrics, 2014.

## Adding or replacing a recording

- Only CC0 files, or files generated with an AI tool. For an AI-generated file record the tool, the date,
  the prompt and any watermark (for example SynthID). For a CC0 file record the source URL and the author.
- Every file gets a row in the table below **before** it is committed to the repository.
- Files live in `public/sounds/` and are precached by the service worker with everything else, so every
  app update downloads them again. Keep a file at or under 1 MB and all files together at or under 8 MB.
- File contract: mono, 44.1 kHz, 30-60 s, the same format for all four, about -20 dBFS, no fades baked in
  (the app trims silence and blends the loop's seam itself).
- The build's external-URL scan does not read `.md` files, so a source URL may appear here as plain text.

| file       | Name (TR / EN) | Origin | Licence | Notes |
| ---------- | -------------- | ------ | ------- | ----- |
| (none yet) |                |        |         |       |
