import Foundation
import ReconstructCore

#if os(macOS)
import RealityKit
#endif

private enum HostProbe {
    static func current() -> HostFacts {
        let version = ProcessInfo.processInfo.operatingSystemVersion
        #if os(macOS)
        let systemName = "macOS"
        let supported = PhotogrammetrySession.isSupported
        #else
        let systemName = "Linux"
        let supported = false
        #endif
        #if os(macOS) && arch(arm64)
        let silicon = true
        #else
        let silicon = false
        #endif
        return HostFacts(
            systemName: systemName,
            major: version.majorVersion,
            minor: version.minorVersion,
            patch: version.patchVersion,
            isAppleSilicon: silicon,
            photogrammetrySupported: supported
        )
    }
}

let arguments = Array(CommandLine.arguments.dropFirst())
if arguments.contains("--help") || arguments.contains("-h") {
    print(HelpText.text)
    exit(0)
}

let gate = VersionGate.evaluate(HostProbe.current())
if !gate.allowed {
    FileHandle.standardError.write(Data((gate.message + "\n").utf8))
    exit(2)
}

switch ArgumentParser.parse(arguments) {
case .failure(.help):
    print(HelpText.text)
    exit(0)
case .failure(.invalid(let message)):
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
case .success(let options):
    #if os(macOS)
    Task {
        let code = await CommandDriver.run(options)
        exit(code)
    }
    dispatchMain()
    #else
    FileHandle.standardError.write(Data((gate.message + "\n").utf8))
    exit(2)
    #endif
}
