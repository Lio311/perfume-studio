// swift-tools-version:5.9
// ReconstructCore is Foundation only and tests on Linux.
// The `reconstruct` executable links RealityKit and ModelIO on macOS.
//
// GLB stays off until M7a merges PackKit.GLBWriter. Flip `enablePackKitGLB`
// to true after that merge; the path dependency and PACKKIT_GLB flag then
// compile PackKitGLBEncoder. Leaving it false keeps this package independent
// of a type that is not on main yet.
import PackageDescription

let enablePackKitGLB = false

var dependencies: [Package.Dependency] = []
var reconstructDependencies: [Target.Dependency] = ["ReconstructCore"]
var reconstructSettings: [SwiftSetting] = []

if enablePackKitGLB {
    dependencies.append(.package(path: "../../Packages/PackKit"))
    reconstructDependencies.append(.product(name: "PackKit", package: "PackKit"))
    reconstructSettings.append(.define("PACKKIT_GLB"))
}

let package = Package(
    name: "Reconstruct",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "reconstruct", targets: ["reconstruct"]),
        .library(name: "ReconstructCore", targets: ["ReconstructCore"]),
    ],
    dependencies: dependencies,
    targets: [
        .target(name: "ReconstructCore"),
        .executableTarget(
            name: "reconstruct",
            dependencies: reconstructDependencies,
            swiftSettings: reconstructSettings
        ),
        .testTarget(name: "ReconstructCoreTests", dependencies: ["ReconstructCore"]),
    ]
)
