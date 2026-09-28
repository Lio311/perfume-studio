// swift-tools-version:5.9
// Networking for API.md. Logic must build/test on Linux (import FoundationNetworking under #if canImport).
import PackageDescription

let package = Package(
    name: "APIClient",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "APIClient", targets: ["APIClient"])],
    dependencies: [.package(path: "../PackKit")],
    targets: [
        .target(name: "APIClient", dependencies: [.product(name: "PackKit", package: "PackKit")]),
        .testTarget(name: "APIClientTests", dependencies: ["APIClient"]),
    ]
)
