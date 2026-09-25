# Device checklist

Run on a real iPhone before telling anyone a release is ready. Automated tests cannot cover these.

**Device:** iPhone XR · **iOS:** ______ · **App version (Settings):** ______ · **Date:** ______

| # | Step | Expected | Result |
|---|------|----------|--------|
| 1 | Online: open the GitHub Pages URL in Safari → Share → Add to Home Screen → open from the home screen → Settings | "Çevrimdışı hazır (…)" | |
| 2 | Settings → Persistent storage | Record what it says | |
| 3 | Swipe the app away in the app switcher. Airplane mode ON, Wi-Fi OFF. Open from the home screen | App loads with tabs | |
| 4 | Switch language to English and turn night mode on. Swipe away, reopen | Still English + night mode | |
| 5 | iOS Settings → Apps → Safari → Clear History and Website Data. Reopen the app | Record: settings kept or reset? | |
| 6 | Online: Settings → Check for updates | "You are up to date." | |
| 7 | After a new deploy: online, open the app from the home screen and do NOT tap anything for a minute. Swipe it away, reopen → Settings | Version unchanged (the new version was not downloaded) | |
| 8 | Online: Settings → Check for updates → Restart → Settings | "A new version is ready." appears; after Restart the version changes | |

Notes:
- First launch: the home-screen app has its own storage, separate from Safari tabs. Records, settings and the
  offline cache from a Safari tab do not carry over, so open the home-screen app once while online (step 1).
- Playwright WebKit: route()/setOffline() act before the service worker, so offline and zero-network behavior on
  iOS is verified here (steps 1, 3), and the update gate in steps 7–8.
- From plan 4 onward add: sound keeps playing with the screen locked for 30 minutes.
