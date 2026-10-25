# iOS native component destination

Connect this folder in Reframe and select `Sources/NativeDemo/App.swift`. Drop a working feature into its VStack. Generated SwiftUI UI and Foundation networking code use the same API and behavior specification as the web and Android clients.

Run `npm run reframe:backend` on the Mac. Open `ReframeNativeDemo.xcodeproj` with Xcode 16+ and run the ReframeNativeDemo scheme on an iOS Simulator. Synchronized source folders automatically include inserted Swift files. The default backend URL is http://127.0.0.1:5176. An Info.plist local-network ATS setting is provided. Physical iPhones need an explicit reachable HTTPS service; this demo does not expose the backend over LAN.

The same view can be compiler-checked and previewed on macOS with `./script/build_and_run.sh`. This is a macOS preview, not evidence of an iOS run. iOS simulator/device testing is explicitly pending because full Xcode is unavailable and the user chose to defer it.

The backend has local validation, persistent records, versions and retry protection. Production deployment requires authentication and a database migration.
