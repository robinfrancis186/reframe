import Foundation
import Vision
import ImageIO

do {
    guard CommandLine.arguments.count == 2,
          let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: CommandLine.arguments[1]) as CFURL, nil),
          let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let width = properties[kCGImagePropertyPixelWidth] as? Int,
          let height = properties[kCGImagePropertyPixelHeight] as? Int,
          width > 0, height > 0, width * height <= 25_000_000 else {
        throw NSError(domain: "ReframeOCR", code: 1, userInfo: [NSLocalizedDescriptionKey: "Use a valid image under 25 megapixels."])
    }
    let request = VNRecognizeTextRequest()
    // Keep short captures independent of the system Neural Engine compilation queue.
    request.usesCPUOnly = true
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    let handler = VNImageRequestHandler(url: URL(fileURLWithPath: CommandLine.arguments[1]), options: [:])
    try handler.perform([request])
    let blocks: [[String: Any]] = (request.results ?? []).prefix(200).compactMap { observation in
        guard let text = observation.topCandidates(1).first, text.confidence > 0.25 else { return nil }
        let box = observation.boundingBox
        return ["text": String(text.string.prefix(2000)), "confidence": text.confidence,
                "bounds": [box.minX, 1 - box.maxY, box.width, box.height]]
    }
    let result: [String: Any] = ["width": width, "height": height, "blocks": blocks]
    FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]))
} catch {
    FileHandle.standardError.write(Data(error.localizedDescription.utf8))
    exit(1)
}
