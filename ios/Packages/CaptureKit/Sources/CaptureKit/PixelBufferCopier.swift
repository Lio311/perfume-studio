import CoreVideo
import Foundation

/// Deep-copies a camera buffer so the caller can drop the `ARFrame` immediately.
enum PixelBufferCopier {
    static func copy(_ source: CVPixelBuffer) -> CVPixelBuffer? {
        let width = CVPixelBufferGetWidth(source)
        let height = CVPixelBufferGetHeight(source)
        let format = CVPixelBufferGetPixelFormatType(source)
        guard width > 1, height > 1 else { return nil }
        var destination: CVPixelBuffer?
        let attributes = [kCVPixelBufferIOSurfacePropertiesKey: [:] as [String: Any]] as CFDictionary
        guard CVPixelBufferCreate(kCFAllocatorDefault, width, height, format, attributes, &destination) == kCVReturnSuccess,
              let destination else { return nil }
        guard CVPixelBufferLockBaseAddress(source, .readOnly) == kCVReturnSuccess else { return nil }
        defer { CVPixelBufferUnlockBaseAddress(source, .readOnly) }
        guard CVPixelBufferLockBaseAddress(destination, []) == kCVReturnSuccess else { return nil }
        defer { CVPixelBufferUnlockBaseAddress(destination, []) }

        let planes = CVPixelBufferGetPlaneCount(source)
        if planes == 0 {
            guard copy(from: source, to: destination, plane: nil) else { return nil }
        } else {
            for plane in 0..<planes {
                guard copy(from: source, to: destination, plane: plane) else { return nil }
            }
        }
        CVBufferPropagateAttachments(source, destination)
        return destination
    }

    private static func copy(from source: CVPixelBuffer, to destination: CVPixelBuffer, plane: Int?) -> Bool {
        let sourceBase: UnsafeMutableRawPointer?
        let destinationBase: UnsafeMutableRawPointer?
        let height: Int
        let sourceStride: Int
        let destinationStride: Int
        if let plane {
            sourceBase = CVPixelBufferGetBaseAddressOfPlane(source, plane)
            destinationBase = CVPixelBufferGetBaseAddressOfPlane(destination, plane)
            height = CVPixelBufferGetHeightOfPlane(source, plane)
            sourceStride = CVPixelBufferGetBytesPerRowOfPlane(source, plane)
            destinationStride = CVPixelBufferGetBytesPerRowOfPlane(destination, plane)
        } else {
            sourceBase = CVPixelBufferGetBaseAddress(source)
            destinationBase = CVPixelBufferGetBaseAddress(destination)
            height = CVPixelBufferGetHeight(source)
            sourceStride = CVPixelBufferGetBytesPerRow(source)
            destinationStride = CVPixelBufferGetBytesPerRow(destination)
        }
        guard let sourceBase, let destinationBase, height > 0, sourceStride > 0, destinationStride > 0 else { return false }
        let rowBytes = min(sourceStride, destinationStride)
        for row in 0..<height {
            destinationBase.advanced(by: row * destinationStride).copyMemory(
                from: sourceBase.advanced(by: row * sourceStride),
                byteCount: rowBytes
            )
        }
        return true
    }
}
