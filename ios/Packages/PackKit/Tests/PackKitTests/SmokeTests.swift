import XCTest
@testable import PackKit

final class SmokeTests: XCTestCase {
    func testVersion() { XCTAssertFalse(PackKit.version.isEmpty) }

    func testFixturesPresent() throws {
        for name in ["a-minimal-v1-pack", "b-v2-bottle-photo-cap-scan-price", "c-invalid-pack"] {
            let url = try XCTUnwrap(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures"),
                                    "missing fixture \(name)")
            XCTAssertNoThrow(try JSONSerialization.jsonObject(with: Data(contentsOf: url)))
        }
    }
}
