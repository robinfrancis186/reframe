# Android component destination

This is a Material 3 Compose Android app. Connect this folder in Reframe and select `app/src/main/java/com/reframe/demo/Screen.kt`. A working feature drop creates a Compose wrapper, an Android platform view, the validated Node backend, INTERNET permission and a debug-only localhost network policy.

With JDK 17+ and Android SDK 36 configured, build with `./gradlew assembleDebug`. Run `npm run reframe:backend` on the Mac. Install the generated APK and open Reframe Native Demo on an emulator. The default backend URL is `http://10.0.2.2:5176`. For physical USB testing, use `adb reverse tcp:5176 tcp:5176` and pass `apiBase = "http://127.0.0.1:5176"`.

Gradle wrapper and distribution checksums were verified against official Gradle metadata. Android Gradle Plugin 8.13.1, Kotlin/Compose compiler 2.2.21 and Compose BOM 2025.10.01 are pinned. Build/runtime testing remains pending because SDK/emulator installation was declined for this Mac.

The backend stays on loopback and has no multiuser identity layer. Use an authenticated HTTPS service before deployment.
