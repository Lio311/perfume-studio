// swift-tools-version:5.9
// DEVICE module (iOS frameworks). Not built in Linux CI; built by Xcode on the owner's Mac.
import PackageDescription

let package = Package(
    name: "MeasureKit",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "MeasureKit", targets: ["MeasureKit"])],
    dependencies: [.package(path: "../PackKit")],
    targets: [
        .target(name: "MeasureKit", dependencies: [.product(name: "PackKit", package: "PackKit")]),
        .testTarget(name: "MeasureKitTests", dependencies: ["MeasureKit"]),
    ]
)
