import Foundation
import PackKit

let output = URL(fileURLWithPath: CommandLine.arguments.dropFirst().first ?? "DebugSamples", isDirectory: true)
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys]

let names = [
    "bottle-100": "measure-bottle",
    "cap-25x30": "measure-cap",
    "box": "measure-box",
]
for sample in MeasureSampleLibrary.all {
    let stem = names[sample.id] ?? sample.id
    let meta = try encoder.encode(sample.file)
    try meta.write(to: output.appendingPathComponent("\(stem).json"))
    for photo in sample.photos {
        let ppmName = photo.fileName.replacingOccurrences(of: ".jpg", with: ".ppm")
        try writePPM(photo, to: output.appendingPathComponent(ppmName))
    }
    fputs("wrote \(stem)\n", stderr)
}

private func writePPM(_ photo: MeasureSamplePhoto, to url: URL) throws {
    var data = Data("P6\n\(photo.width) \(photo.height)\n255\n".utf8)
    data.append(contentsOf: photo.rgb)
    try data.write(to: url)
}
