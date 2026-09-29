// swift-tools-version:5.9
// File layer is Foundation only and tested on Linux. UIKit JPEG encoding is behind canImport(UIKit).
import PackageDescription

let package = Package(
    name: "Store",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "Store", targets: ["Store"])],
    dependencies: [.package(path: "../PackKit")],
    targets: [
        .target(name: "Store", dependencies: [.product(name: "PackKit", package: "PackKit")]),
        .testTarget(name: "StoreTests", dependencies: ["Store"]),
    ]
)
