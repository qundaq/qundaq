# Manifesto

Qundaq is a logbook for tired parents. It rests on one promise:
**what you record about your babies stays on your phone.**

This document states that promise in concrete, checkable terms. If the code ever breaks one of these
commitments, that is a bug — please report it as a security issue.

[Türkçe aşağıda ↓](#türkçe)

## Commitments

1. **No data leaves the device.** There is no server, no account and no sync. Every record lives in your
   browser's local database (IndexedDB) on your phone. Backups are files you export yourself.
2. **No network activity after the first load.** Once the app shows "Ready for offline", the app itself never
   makes a network request unless you tap "Check for updates". The service worker serves every file from its
   cache and refuses anything else. While your phone is online, Safari may still fetch the app's `sw.js` file
   to see whether it changed. A changed version is **not** downloaded unless you asked for it (see 5).
3. **No tracking.** No analytics, telemetry, crash reporting, advertising, fingerprinting, external fonts,
   CDNs, iframes or remote images. Ever.
4. **No permissions.** The app never asks for camera, microphone, location, contacts or notifications.
5. **Updates are your decision.** A new version is downloaded only after you tap "Check for updates". It
   starts after you tap "Restart", or the next time you open the app.
6. **Minimal dependencies.** At runtime the app uses exactly three libraries: React, React DOM and Dexie.
   Adding one requires a written justification in the pull request. Versions are pinned, install scripts are
   disabled, and CI runs `npm audit` and a license check.
7. **Verifiable.** The source is MIT-licensed. The hosted app is built by GitHub Actions from this repository
   and nothing else is deployed.

## How these are enforced

Every push that changes code runs these checks, and the app is deployed only if all of them pass:

| Check | Where |
|---|---|
| Strict Content-Security-Policy in every production build (own origin only, no inline scripts) | `build/csp.ts`, `e2e/privacy.spec.ts` |
| Zero network requests after the first load, while using the app (Chromium; iOS verified with docs/device-checklist.md) | `e2e/offline.spec.ts` |
| Cold start with the network disabled (Chromium; iOS verified with docs/device-checklist.md) | `e2e/offline.spec.ts` |
| Update gate: a new version on the server is neither downloaded nor installed until you tap "Check for updates" — only `sw.js` is fetched (Chromium) | `e2e/update.spec.ts`, `tests/sw/service-worker.test.ts` |
| Integrity check: every file of a new version must match the SHA-256 recorded at build time, or nothing is installed | `tests/scripts/sw-manifest.test.ts`, `tests/sw/service-worker.test.ts` (install behaviour) |
| No CSP violations while using the app | `e2e/privacy.spec.ts` |
| Bundle scan: no external URLs in the built files | `scripts/check-no-external-urls.mjs` |
| License policy for every installed package | `scripts/check-licenses.mjs` |
| Known-vulnerability audit | `npm audit` in `.github/workflows/ci.yml` |

## What we cannot control

Being honest about limits is part of the promise.

- **Hosting logs.** When you first open or update the app, GitHub Pages serves the files and, like any web
  server, may log your IP address and browser. None of your records are involved.
- **The browser's own update check.** While your phone is online, Safari may check by itself whether the
  app's `sw.js` file has changed. The app cannot switch this off. That request asks only for the file and
  carries none of your data. In airplane mode it never happens. If the file has changed, the app refuses to
  install anything you did not ask for: nothing else is downloaded and your current version keeps running.
- **Your device.** Your records are protected by your phone's lock and storage. Depending on your phone's
  settings, device backups (iCloud, Finder) may include them.
- **Cleared offline caches.** If Safari's website data is cleared, or iOS removes the app's offline cache,
  the next time you open the app online it installs the version currently published, without asking. That
  is the same as a first install.

## Sounds

Every bundled sound will be listed with its origin and license in `public/sounds/SOURCES.md`.
Sounds generated in code need no license; recordings are CC0 or clearly labeled as AI-generated with the tool and date.

---

## Türkçe

Qundaq yorgun ebeveynler için bir kayıt defteri. Tek bir söz üzerine kurulu:
**bebeklerin hakkında kaydettiğin her şey telefonunda kalır.**

Kod bu sözlerden birini bozarsa bu bir hatadır; lütfen güvenlik sorunu olarak bildir.

1. **Veri cihazdan çıkmaz.** Sunucu, hesap ya da senkronizasyon yok. Tüm kayıtlar telefonundaki yerel
   veritabanında (IndexedDB). Yedekler senin dışa aktardığın dosyalar.
2. **İlk yüklemeden sonra ağ trafiği yok.** Uygulama "Çevrimdışı hazır" dedikten sonra uygulamanın kendisi,
   "Güncellemeleri kontrol et"e basmadıkça hiçbir ağ isteği yapmaz. Service worker her dosyayı önbellekten
   sunar, başka her şeyi reddeder. Telefon çevrimiçiyken Safari, uygulamanın `sw.js` dosyasını değişip
   değişmediğini görmek için yine de indirebilir. Değişmiş bir sürüm, sen istemedikçe **indirilmez** (bkz. 5).
3. **İzleme yok.** Analitik, telemetri, çökme raporu, reklam, parmak izi, dış yazı tipi, CDN, iframe ya da
   uzak görsel yok.
4. **İzin yok.** Kamera, mikrofon, konum, rehber ya da bildirim izni istenmez.
5. **Güncelleme senin kararın.** Yeni sürüm yalnızca "Güncellemeleri kontrol et"e bastıktan sonra indirilir.
   "Yeniden başlat"a bastığında ya da uygulamayı bir sonraki açışında başlar.
6. **Asgari bağımlılık.** Çalışma anında yalnızca üç kütüphane: React, React DOM ve Dexie. Yenisi için
   PR'da yazılı gerekçe gerekir. Sürümler sabit, kurulum betikleri kapalı; CI `npm audit` ve lisans kontrolü çalıştırır.
7. **Doğrulanabilir.** Kaynak kod MIT lisanslı. Yayındaki uygulama bu depodan GitHub Actions ile derlenir.

**Kontrol edemediklerimiz:** GitHub Pages dosyaları sunarken standart sunucu kayıtları (IP, tarayıcı)
tutabilir. Telefon çevrimiçiyken Safari, `sw.js` dosyasının değişip değişmediğine kendiliğinden bakabilir;
bu istek hiçbir verini içermez ve uçak modunda hiç olmaz. Dosya değişmiş olsa bile uygulama senin istemediğin
hiçbir şeyi kurmaz: başka hiçbir dosya indirilmez ve kullandığın sürüm çalışmaya devam eder. Telefon
yedeklerin (iCloud, Finder) ayarlarına göre kayıtlarını içerebilir. Safari'nin site verileri temizlenirse ya
da iOS uygulamanın çevrimdışı önbelleğini kaldırırsa, uygulamayı bir sonraki çevrimiçi açışında sana
sormadan o an yayında olan sürümü kurar. Bu, ilk kurulumla aynı durumdur.
