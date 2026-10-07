# Seeker and PWA readiness

RWA Lens includes an installable PWA and the Android shell source for Solana Seeker. The web build and browser journeys are checked; a release APK, device testing and dApp Store submission remain separate steps.

## What changed

- `app/manifest.ts` (served at `/manifest.webmanifest`), `public/icons/icon-192.png`, `icon-512.png` and `icon-maskable-512.png` rendered from `app/icon.svg`, so the site is installable on Android, iOS and desktop.
- `app/layout.tsx` exports `viewport` with `viewportFit: 'cover'` and a `themeColor`, plus Apple web-app metadata; `app/globals.css` pads `body` with `env(safe-area-inset-*)` so the inspector clears notches and gesture bars.
- `public/sw.js` caches build-addressed Next chunks, refreshes icons and brand assets from the network, and serves an offline notice for navigations. Cached assets remain available offline. RPC reads, metadata, saved reports and sign-in never enter Cache Storage. `components/app/mobile-support.tsx` registers it in production.
- The same component registers the Solana Mobile Wallet Adapter. `components/rwa/report-actions.tsx` discovers wallets through the standard `app-ready` / `register-wallet` exchange, so **Mobile Wallet Adapter** now appears in the *Save this report* sign-in dialog on Android and Seeker with no change to the message-signing flow.
- `next.config.ts` allows `ws://localhost:*` in `connect-src` (the MWA handoff) and declares `worker-src` and `manifest-src`.
- Inter is now self-hosted from `app/fonts/` (SIL OFL, licence alongside) instead of fetched from Google Fonts at build time, which removes the app's only third-party request and lets it build offline.
- `android/` is a Solana Mobile Web Shell project (`com.operatoruplift.rwalens`) wrapping `/rwa`.

## Test on a phone (no APK needed)

1. Open https://rwalensonsolana.vercel.app in Chrome on Android or Seeker. Use the browser menu → **Install app**, or the in-page install control where one exists. On iPhone use Safari → Share → **Add to Home Screen**.
2. Launch from the home screen. The app should open full-screen with the status bar in the theme colour and content clear of the notch and gesture bar.
3. Public deployment: inspect a mint on `/rwa`, open `/yield`, and export a JSON/CSV receipt. These flows need no wallet. On a deployment with cloud reports configured and enabled, **Save this report** opens the sign-in dialog; **Mobile Wallet Adapter** on Android and Seeker requests a message signature for authentication. The separately enabled yield-deploy action has its own transaction review and wallet signing flow.
4. Offline: after the service worker has installed, turn on airplane mode and relaunch. Navigation shows the offline notice with a link back to the inspector. Live inspection needs a connection; an old observation is not substituted for a fresh read.

Mobile Wallet Adapter registers itself only on Android in a secure context (or inside the Web Shell). Desktop, iOS and in-wallet browsers keep their injected wallets; nothing changes for them.

## Build the Android APK

The shell in `android/` was generated with `@solana-mobile/webshell-cli`, which the Solana Mobile docs now recommend over Bubblewrap. It wraps `https://rwalensonsolana.vercel.app/rwa` in a WebView with native wallet-intent handling, so the deployed site is the app: redeploying the web app updates the app without a new APK.

Build it with Gradle directly. Prerequisites: JDK 21 and the Android SDK with platform 36 and build-tools 36.1.0. On macOS these are Homebrew's `openjdk@21` and the SDK Android Studio installs.

```bash
export JAVA_HOME=/usr/local/opt/openjdk@21 ANDROID_HOME=$HOME/Library/Android/sdk
cd android

# Debug build, for testing on a device. No key needed.
./gradlew --no-daemon assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### Signed release build

The dApp Store accepts only a signed release APK. Create the release keystore once, with a **new** key never used on Google Play, and keep it and its passwords outside the repo. Losing it means you can never update the app on the dApp Store.

```bash
keytool -genkeypair -v -keystore ~/keys/rwalens-release.keystore -alias rwalens \
  -keyalg RSA -keysize 2048 -validity 10000
```

JDK 21's `keytool` writes a PKCS12 keystore, which has a single password: the key password is the store password. Give both variables below that same value; a different key password fails at packaging with `Failed to read key rwalens from store`.

Then build with the signing properties Gradle reads (`android/app/build.gradle.kts`). The passwords come from the environment; the store file and alias are Gradle properties:

```bash
export JAVA_HOME=/usr/local/opt/openjdk@21 ANDROID_HOME=$HOME/Library/Android/sdk
cd android
WEB_SHELL_SIGNING_STORE_PASSWORD=… WEB_SHELL_SIGNING_KEY_PASSWORD=… ./gradlew --no-daemon assembleRelease -PWEB_SHELL_SIGNING_STORE_FILE=$HOME/keys/rwalens-release.keystore -PWEB_SHELL_SIGNING_KEY_ALIAS=rwalens
```

> **A missing property silently produces an unsigned APK.** Gradle signs only when the store file, store password and key alias are all set. If one is missing, the build still succeeds and writes `app/build/outputs/apk/release/app-release-unsigned.apk`. The key password falls back to the store password. Older notes used `WEB_SHELL_KEYSTORE_PASSWORD` and `WEB_SHELL_KEY_PASSWORD`; Gradle never reads those names.

Check the APK before you upload it. It must be signed by your release key and declare English only:

```bash
$ANDROID_HOME/build-tools/36.1.0/apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk
$ANDROID_HOME/build-tools/36.1.0/aapt2 dump badging app/build/outputs/apk/release/app-release.apk | grep -E '^locales'
```

The second command must print `locales: '--_--' 'en'`. `'--_--'` is the default, unqualified resource set, not a language. `android/app/build.gradle.kts` limits resources to English (`androidResources.localeFilters`) and `res/values-en/` declares it. Without the filter the APK declares 86 locales, almost all from AndroidX translations, and the store would list each one as a supported language.

Bump the version for every release: raise `WEB_SHELL_VERSION_CODE` and set `WEB_SHELL_VERSION_NAME` in `android/gradle.properties`, or pass them as `-P` properties. The URL, application ID and icons are already recorded there and in `twa-manifest.json`.

## Publish on the Solana dApp Store

Winners must list on the dApp Store to claim CLOCK IN prizes, and the listing is the distribution channel for every Seeker owner. The listing copy, banner and screenshots are in [`docs/dapp-store/`](dapp-store/listing.md).

- **Publisher Portal:** https://publish.solanamobile.com. Registration requires KYC (individuals) or KYB (businesses).
- **Publisher wallet:** a desktop browser-extension wallet, not a Ledger. It pays about 0.05–0.1 SOL per release plus ArDrive storage for the uploaded files, and it signs every future update, so treat it like the keystore.
- **APK:** a signed release APK only, built as above. Debug and unsigned builds are rejected.
- **Listing limits:** app name up to 25 characters, subtitle up to 30.
- **Assets:** the 512×512 icon (`public/icons/icon-512.png`), a banner of exactly 1200×600, and 4 to 8 portrait screenshots at least 1080 px wide.
- **Review:** 3 to 5 business days. Each update is a new release, signed with the same key and paid from the same publisher wallet.

## Decisions to make before the first publish

- **Application ID is permanent.** This shell uses `com.operatoruplift.rwalens`. Change it now (`webshell init . --force --application-id ...`) or never.
- **Host is pinned.** The shell keeps navigation on `rwalensonsolana.vercel.app` and opens other hosts in the system browser. Moving to a custom domain later needs a rebuild but keeps the application ID.
- **Deep links.** The shell opens the start URL; if you want `/rwa?mint=...`-style links to open the app, add an intent filter for the host in `android/app/src/main/AndroidManifest.xml`.

## CLOCK IN checklist (Solana Mobile × RadiantsDAO, closes 8 October 2026)

- [ ] Release APK built with the steps above and installed on a Seeker or Android device
- [ ] Public GitHub repo (this one), with this branch merged
- [ ] Demo video showing the install, the wallet handoff and the core flow on a phone
- [ ] Pitch deck: problem, product, why mobile-first, traction, team
- [ ] Optional SKR integration for the separate $10K SKR prize
