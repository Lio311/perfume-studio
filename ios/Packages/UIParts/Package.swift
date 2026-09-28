// swift-tools-version:5.9
// DEVICE module (iOS frameworks). Not built in Linux CI; built by Xcode on the owner's Mac.
import PackageDescription

let package = Package(
    name: "UIParts",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "UIParts", targets: ["UIParts"])],
    dependencies: [.package(path: "../PackKit")],
    targets: [
        .target(name: "UIParts", dependencies: [.product(name: "PackKit", package: "PackKit")]),
        .testTarget(name: "UIPartsTests", dependencies: ["UIParts"]),
    ]
)
