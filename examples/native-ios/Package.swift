// swift-tools-version: 6.0
import PackageDescription
let package = Package(name: "ReframeNativeDemo", platforms: [.macOS(.v14), .iOS(.v17)], products: [.executable(name: "ReframeNativeDemo", targets: ["NativeDemo"])], targets: [.executableTarget(name: "NativeDemo", path: "Sources/NativeDemo")])
