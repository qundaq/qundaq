# Sound sources

Every sound Qundaq can play is listed here with where it comes from and under which licence. The app
shows this file under Ayarlar → Hakkında → Ses kaynakları.

## Sounds generated in code

All nine sounds of this version are generated on the device by `src/audio/generators.ts` from a seeded
random number generator and a few filters. No recording is involved, nothing is downloaded, and no
third-party audio material is used. Licence: MIT (this repository).

| id        | Name (TR / EN)                   | Function    | Recipe                                                                                      | Notes                                                                                                 |
| --------- | -------------------------------- | ----------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| white     | Beyaz gürültü / White noise      | `white`     | uniform white noise                                                                         |                                                                                                       |
| pink      | Pembe gürültü / Pink noise       | `pink`      | white noise through Paul Kellet's "refined" pink filter                                     | algorithm: Paul Kellet's refined method, published on the music-dsp mailing list without restrictions |
| brown     | Kahverengi gürültü / Brown noise | `brown`     | leaky integrator of white noise, DC removed                                                 |                                                                                                       |
| rain      | Yağmur / Rain                    | `rain`      | band-limited pink noise with random droplet transients                                      |                                                                                                       |
| waves     | Dalgalar / Waves                 | `waves`     | brown noise under a slow swell, brighter at the top of each swell                           |                                                                                                       |
| wind      | Rüzgâr / Wind                    | `wind`      | pink noise through three band-passes whose levels drift                                     |                                                                                                       |
| heartbeat | Kalp atışı / Heartbeat           | `heartbeat` | "lub-dub" thumps (60–90 Hz with harmonics to about 300 Hz) at 70 bpm over a quiet brown bed |                                                                                                       |
| shush     | Şşş / Shush                      | `shush`     | high-passed pink noise with a rhythmic "shh" envelope (1 s on, 0.4 s off)                   |                                                                                                       |
| airplane  | Uçak kabini / Airplane cabin     | `airplane`  | low-passed brown and pink noise with a faint beating hum around 110 Hz                      |                                                                                                       |

Every sound is a seamless loop, normalised to the same weighted loudness (about −20 dBFS; the
heartbeat −24 dBFS) so that the sliders mean the same for all of them.

## Safety

The app caps the volume (Ayarlar → Ses güvenlik sınırı, default 50 %) and shows this advice: keep the
phone out of the crib, at least 2 metres away, keep the volume as low as works, and use the sleep timer
rather than playing all night. Source: Hugh SC, Wolter NE, Propst EJ, Gordon KA, Cushing SL, Papsin BC.
"Infant sleep machines and hazardous sound pressure levels." Pediatrics, 2014.

## Adding a recorded sound

No recording ships in this version. When one is added:

- Only CC0 files, or files generated with an AI tool. For an AI-generated file record the tool, the date,
  the prompt and any watermark (for example SynthID). For a CC0 file record the source URL and the author.
- Every file gets a row in the table below **before** it is added to the repository.
- Files live in `public/sounds/` and are precached by the service worker with everything else, so every
  app update downloads them again. Keep a file at or under 1 MB and all files together at or under 8 MB.
- The build's external-URL scan does not read `.md` files, so a source URL may appear here as plain text.

| file       | Name (TR / EN) | Origin | Licence | Notes |
| ---------- | -------------- | ------ | ------- | ----- |
| (none yet) |                |        |         |       |
