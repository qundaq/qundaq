<p align="center"><img src="assets/logo/qundaq-icon.png" width="128" height="128" alt="Qundaq logo: a swaddled sleeping baby inside a circle, with sound waves"></p>

# Qundaq

**An offline-first, privacy-first baby tracker and sleep-sound mixer for twins (or any number of babies).**
Runs entirely on your phone as an installable web app. No accounts, no servers, no tracking — your data never leaves the device.

"Qundaq" is the Azerbaijani spelling of the Turkish *kundak*, a swaddling blanket.

[Türkçe açıklama aşağıda ↓](#türkçe)

---

## Status

🚧 **Early development.** The current version tracks babies, breastfeeding (with a left/right timer), bottles, sleep (with a timer), diapers with the stool color card, pumping, growth, temperature, medicines and health notes. The Log tab lists every entry by day and lets you correct or delete it; the Summary tab shows daily totals, a 7-day table and a growth chart. Backups (to the Files app, with a restore that previews every change) and a CSV export for your pediatrician are in. Sounds come next.

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

## Backups

Your entries live only on your phone, and iOS may delete a home-screen app's storage. Back up regularly; Home reminds you when the last backup is more than 7 days old.

- **Back up:** Settings → Backup → **Back up** → **Save to Files / share** → **Save to Files** → **On My iPhone**. This works in airplane mode. A file kept only in iCloud Drive cannot be opened in airplane mode.
- **Restore:** Settings → Backup → **Restore from a backup** (on a phone without babies, also on Home), pick the file, read the preview, then **Restore**. This merges: entries only on this phone are kept; for an entry on both sides the newer change wins, deletions included. After a wipe (a new phone, or the app deleted and added again) this brings everything back. **Replace everything** is also offered; it shows what it would delete and asks you to confirm.
- **CSV:** Settings → Backup → **Export as CSV** gives one spreadsheet per baby, for your pediatrician.
- The backup file is plain JSON and is **not encrypted**. The app never sends it anywhere: it goes only where you send it with the share sheet. If you pick iCloud Drive, Mail or WhatsApp, that service receives it.

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

**Durum:** 🚧 Geliştirmenin başında. Şu anki sürüm bebekleri, emzirmeyi (sol/sağ sayaçla), biberonu, uykuyu (sayaçla), kaka renk kartıyla bezi, sağımı, büyümeyi, ateşi, ilaçları ve sağlık notlarını takip ediyor. Günlük sekmesi kayıtları güne göre listeler, düzeltmenize ve silmenize izin verir; Özet sekmesi günlük toplamları, 7 günlük tabloyu ve büyüme grafiğini gösterir. Dosyalar uygulamasına yedek alma, her değişikliği önceden gösteren geri yükleme ve doktor için CSV çıktısı hazır. Sırada sesler var.

**Yedekler:** Kayıtlar yalnızca telefonda durur ve iOS ana ekrana eklenen uygulamaların verisini silebilir. Düzenli yedek alın; son yedek 7 günden eskiyse Ana ekran hatırlatır.
- **Yedek al:** Ayarlar → Yedekleme → **Yedek al** → **Dosyalar'a kaydet / paylaş** → **Dosyalar'a Kaydet** → **iPhone'umda**. Uçak modunda çalışır. Yalnızca iCloud Drive'da duran bir dosya uçak modunda açılamaz.
- **Geri yükle:** Ayarlar → Yedekleme → **Yedekten geri yükle** (bebek eklenmemiş bir telefonda Ana ekranda da), dosyayı seçin, önizlemeye bakın, **Geri yükle**'ye dokunun. Bu birleştirir: yalnızca bu telefonda olan kayıtlar korunur; iki tarafta da olan bir kayıtta, silme dahil, daha yeni değişiklik geçerli olur. Telefon silindikten sonra (yeni telefon ya da uygulama silinip yeniden eklendiğinde) her şeyi geri getirir. **Tamamen değiştir** seçeneği de var; neyi sileceğini gösterir ve onay ister.
- **CSV:** Ayarlar → Yedekleme → **CSV olarak dışa aktar**, doktor için her bebeğe bir tablo verir.
- Yedek dosyası düz JSON'dur ve **şifrelenmez**. Uygulama dosyayı hiçbir yere göndermez; dosya yalnızca paylaş menüsünde sizin seçtiğiniz yere gider. iCloud Drive, Mail ya da WhatsApp'ı seçerseniz dosya o hizmete gider.

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
