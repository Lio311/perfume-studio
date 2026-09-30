import XCTest
@testable import MeasureKit

final class MeasureKitTests: XCTestCase {
    func testPipelineCancel() {
        let pipeline = MeasurePipeline()
        pipeline.cancel()
        XCTAssertEqual(MeasureKit.moduleName, "MeasureKit")
    }
}
