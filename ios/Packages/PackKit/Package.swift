// swift-tools-version:5.9
// PURE LOGIC. Foundation only. Must build and test on Linux (`swift test`).
import PackageDescription

let package = Package(
    name: "PackKit",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "PackKit", targets: ["PackKit"])],
    targets: [
        .target(name: "PackKit", resources: [.copy("supplier-pack.schema.json")]),
        .executableTarget(name: "RenderMeasureSamples", dependencies: ["PackKit"]),
        .testTarget(name: "PackKitTests", dependencies: ["PackKit"], resources: [.copy("Fixtures")]),
    ]
)
