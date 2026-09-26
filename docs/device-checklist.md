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
| 9 | Add two babies. Start a breastfeeding timer for one and a sleep for the other. Swipe the app away, wait 5 minutes, reopen | Both timers still running with the right elapsed time | |
| 10 | Finish the feed, wake the baby. Log a diaper for "All" with a white stool | Warning text appears in the sheet; both cards show the diaper | |
| 11 | Turn on night mode and log a bottle in the dark | Everything readable, touch targets easy to hit one-handed | |
| 12 | Settings → Babies → Delete a baby | The system confirmation dialog appears in the home-screen app; cancelling keeps the baby, confirming removes it | |
| 13 | Günlük: tap the day in the middle and pick yesterday in the iOS date picker; pick a date after today | Yesterday's entries show; a future date shows today | |
| 14 | Günlük: tap an entry, change its time and save. Open it again and tap "Sil" twice quickly, then twice slowly | The entry moves to the new time; the quick double tap does not delete, the slow second tap does | |
| 15 | Home in Turkish, then in English: look at the five quick buttons (Emzir … Diğer / Nurse … Other) | All five on one row, no label cut off, no sideways scrolling | |
| 16 | Diğer → Büyüme: type 3,45 with the comma key of the Turkish keypad. Diğer → Ateş: 38,2 | Saved as 3,45 kg and 38,2 °C; the fever hint appears while typing | |
| 17 | Start a sleep, wait until the next morning (or set the phone's clock 13 hours ahead), open Home | "Durdurmayı unuttunuz mu?" under the timer; tapping it lets you set the real wake-up time | |
| 18 | Before updating to this version (the one that adds Günlük and Özet), start a sleep on the home-screen app. Then online: Settings → Güncellemeleri kontrol et → Yeniden başlat | Home still shows the sleep running with the right elapsed time; "Uyandı" stops it; Günlük lists it with the older entries | |
| 19 | Airplane mode ON. Ayarlar → Yedek al → "Dosyalar'a kaydet / paylaş" → Dosyalar'a Kaydet → iPhone'umda → Kaydet | The share sheet opens straight away and offers Dosyalar'a Kaydet; the sheet says "Yedek paylaşıldı."; the card says "Son yedek: bugün"; the file is in Dosyalar → iPhone'umda | |
| 20 | Ayarlar → Yedek al → share → in the Files location picker tap Vazgeç | Nothing is saved; "Son yedek" is unchanged; the share button still works | |
| 21 | Airplane mode ON. Ayarlar → Yedekten geri yükle → pick the file from step 19 | The picker opens and the file can be picked (not greyed out); the preview lists the babies and the entry count | |
| 22 | Disaster recovery: back up (step 19). Delete the home-screen app, add it again from Safari while online, open it once, turn airplane mode ON. Ayarlar → Yedekten geri yükle → Geri yükle | Every baby and entry is back; a timer that was running in the backup is either still running or listed as stopped at the backup time | |
| 23 | After step 22's reinstall, before restoring: add a baby with the same name and log one diaper. Then restore with "Birleştir" | The preview offers "Aynı bebek", ticked; afterwards there is one card for that baby and the new diaper is in its Günlük | |
| 24 | Ayarlar → CSV olarak dışa aktar (two babies with entries) → share → Dosyalar'a Kaydet; open a file in Numbers | One share sheet offers all the files at once; Numbers shows ş, ğ, ı correctly and ";" splits the columns | |
| 25 | After a wipe (as in step 22), before adding any baby: Ana → "Yedekten geri yükle" → pick the backup → Geri yükle | The button is on Home under "Bebek ekle"; every baby and entry is back without adding them again | |
| 26 | With at least one entry and no backup for more than 7 days, open Home; tap "Yarın hatırlat" | The backup banner shows above the cards; after the tap it stays away until 09:00 the next morning (at least 12 hours) | |

Notes:
- First launch: the home-screen app has its own storage, separate from Safari tabs. Records, settings and the
  offline cache from a Safari tab do not carry over, so open the home-screen app once while online (step 1).
- Playwright WebKit: route()/setOffline() act before the service worker, so offline and zero-network behavior on
  iOS is verified here (steps 1, 3), and the update gate in steps 7–8. The e2e checks of the /qundaq/ sub-path
  and of a cold start from a closed browser also run in Chromium only.
- The e2e tests replace the share sheet with a stub and cannot open the Files picker, so steps 19–25 are the
  only check of the real iOS share sheet, Files and Numbers. Run them in airplane mode.
- From plan 5 onward add: sound keeps playing with the screen locked for 30 minutes.
