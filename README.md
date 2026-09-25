# Qundaq

**An offline-first, privacy-first baby tracker and sleep-sound mixer for twins (or any number of babies).**
Runs entirely on your phone as an installable web app. No accounts, no servers, no tracking — your data never leaves the device.

"Qundaq" is the Azerbaijani spelling of the Turkish *kundak*, a swaddling blanket.

[Türkçe açıklama aşağıda ↓](#türkçe)

---

## Status

🚧 **Early development.** The first version contains only the app shell and settings; tracking, backup and sounds come next.

## Why

Parents of twins log a lot: feeds, sleeps, diapers — times two, often at 3 a.m. with one free hand. Most tracker apps need an account, sync to someone's cloud, or ship analytics SDKs. This one is built for a phone that lives in the diaper bag in airplane mode.

## Principles

1. **Your data never leaves your phone.** No backend, no account, no sync. Everything is stored locally in the browser (IndexedDB).
2. **No network activity after the first load.** The app is served entirely from its offline cache.
3. **No tracking of any kind.** No analytics, crash reporting, ads, external fonts, CDNs or remote images.
4. **No permissions.** No camera, microphone, location or notifications.
5. **Minimal, audited dependencies.** Runtime dependencies are limited to React, React DOM and Dexie.
6. **Verifiable.** Open source, built and deployed by CI straight from this repository. The principles above are enforced by automated tests, not just promised.

The full commitments, how each is enforced, and the few things we cannot control are in [MANIFESTO.md](MANIFESTO.md).

## Planned features (v1)

- **Multiple babies**, each with their own name and color
- **Quick logging** built for one-handed use: sleep, breastfeeding (left/right timer), bottle, diapers, pumping, growth, temperature, medication, notes
- **Log for all babies at once** (e.g. a diaper round)
- **Timeline and daily summaries**, a 7-day overview and a growth chart
- **Stool color card** with a warning for pale/white/clay colors, an early sign of biliary atresia, one of the few things this app will ever nudge you about
- **Sleep sounds:** generated white/pink/brown noise, rain, waves, wind, heartbeat, shushing and more, mixed as layers, with a sleep timer and a volume safety cap
- **Backup & export:** JSON backup to the Files app, CSV export for your pediatrician
- **Night mode** with a dim red/amber palette
- **Turkish and English**

## How it will work on your phone

1. Open https://qundaq.github.io/qundaq/ once in Safari while online.
2. Tap **Share → Add to Home Screen**.
3. Open it from the home screen once. When it says **"Ready for offline"**, you can switch to airplane mode for good.
4. To update, go online briefly and tap **Settings → Check for updates**.

## Tech

TypeScript · React · Vite · Dexie (IndexedDB) · Web Audio API · a hand-written service worker · Vitest · Playwright. Hosted as static files on GitHub Pages.

## Development

Requires Node 24+.

```bash
npm ci                                  # install (install scripts are disabled by .npmrc)
npm run dev                             # dev server (no service worker, no CSP)
npm run verify                          # typecheck, unit tests, build, license check, e2e
npx playwright install chromium webkit  # once, before the first e2e run
```

Before a release, run the [device checklist](docs/device-checklist.md) on a real iPhone.

## Sounds

Most sounds are synthesized in code. Any bundled audio files will be listed with their source and license in `public/sounds/SOURCES.md`.

## Medical disclaimer

This app is a logbook, not medical advice. If you are worried about your baby, contact your pediatrician.

## License

MIT

---

## Türkçe

**İkizler (ya da herhangi sayıda bebek) için, internetsiz çalışan ve gizliliği öncelik alan bir bebek takip ve uyku sesi uygulaması.**
Telefonuna kurulan bir web uygulaması olarak çalışır. Hesap yok, sunucu yok, izleme yok. Verin telefondan asla çıkmaz.

"Qundaq", Türkçedeki *kundak* kelimesinin Azerbaycan Türkçesindeki yazılışıdır.

**Durum:** 🚧 Geliştirmenin başında. İlk sürüm yalnızca uygulama kabuğunu ve ayarları içeriyor; takip, yedekleme ve sesler sırada.

**İlkeler:**
- Veri yalnızca telefonda tutulur.
- İlk yüklemeden sonra uygulama hiçbir ağ isteği yapmaz.
- Analitik, izleme ya da reklam yoktur.
- Hiçbir izin istenmez.
- Bağımlılıklar asgari tutulur ve denetlenir.
- Kod açık kaynaktır. İlkeler otomatik testlerle zorunlu kılınır.

**Planlanan özellikler:**
- Birden çok bebek
- Tek elle hızlı kayıt: uyku, emzirme, biberon, bez, kaka rengi, sağım, büyüme, sağlık
- Kaydı tüm bebeklere birden işleme
- Günlük, özet ve büyüme grafiği
- Uyarılı kaka renk kartı
- Katmanlı uyku sesleri ve zamanlayıcı
- JSON yedek ve CSV çıktısı
- Gece modu
- Türkçe ve İngilizce

**Tıbbi uyarı:** Bu uygulama bir kayıt defteridir, tıbbi tavsiye değildir. Endişen varsa çocuk doktoruna danış.
