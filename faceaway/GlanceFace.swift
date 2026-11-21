// GlanceFace: FaceAway's face recognition, adapted from Glance (face unlock for Mac)
// https://github.com/jonnyoo/glance  (MIT License, Copyright (c) 2026 Jonathan Zhou; see LICENSE-glance.txt).
// What it does, like Glance: finds the eyes, nose and mouth corners, warps the face onto ArcFace's standard
// 112x112 five-point layout (a similarity transform), and turns it into a 512-number L2-normalised embedding
// with the ArcFace Core ML model (InsightFace w600k_mbf; the model is for personal, non-commercial use).
import Foundation
import CoreML
import CoreGraphics
import CoreImage
import CoreVideo
import Vision

enum GlanceFace {
    static let size = 112
    /// ArcFace's canonical landmark positions in the 112x112 crop: left eye, right eye, nose, mouth left, mouth right.
    static let reference: [CGPoint] = [CGPoint(x: 38.2946, y: 51.6963), CGPoint(x: 73.5318, y: 51.5014),
                                       CGPoint(x: 56.0252, y: 71.7366), CGPoint(x: 41.5493, y: 92.3655),
                                       CGPoint(x: 70.7299, y: 92.2041)]
    static let dimension = 512
    /// Same-person distance limit between two normalised embeddings (sqrt(2 - 2·cos): cos ≥ 0.45 ≈ 1.05).
    static let samePersonDistance: Float = 1.05

    private static let ciContext = CIContext(options: nil)
    private static var model: MLModel?
    private static var tried = false

    /// The ArcFace model: ArcFace.mlpackage next to the faceaway program, compiled once and kept in Application Support.
    static var available: Bool { loadModel() != nil }
    private static func loadModel() -> MLModel? {
        if tried { return model }
        tried = true
        let fm = FileManager.default
        let exe = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath().deletingLastPathComponent()
        let support = fm.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/FaceAway", isDirectory: true)
        let compiled = support.appendingPathComponent("ArcFace.mlmodelc", isDirectory: true)
        let package = [exe.appendingPathComponent("ArcFace.mlpackage"), fm.homeDirectoryForCurrentUser.appendingPathComponent("FaceAway/ArcFace.mlpackage")]
            .first { fm.fileExists(atPath: $0.path) }
        do {
            if !fm.fileExists(atPath: compiled.path) {
                guard let package else { return nil }
                let tmp = try MLModel.compileModel(at: package)
                try fm.createDirectory(at: support, withIntermediateDirectories: true)
                try? fm.removeItem(at: compiled)
                try fm.moveItem(at: tmp, to: compiled)
            }
            let config = MLModelConfiguration()
            config.computeUnits = .all
            model = try MLModel(contentsOf: compiled, configuration: config)
        } catch {
            model = nil
        }
        return model
    }

    /// The embedding of the face in `box` (Vision's normalised, bottom-left box), or nil.
    static func embedding(of pixels: CVPixelBuffer, box: CGRect) -> [Float]? {
        guard let model = loadModel() else { return nil }
        let w = CVPixelBufferGetWidth(pixels), h = CVPixelBufferGetHeight(pixels)
        guard let image = ciContext.createCGImage(CIImage(cvPixelBuffer: pixels), from: CGRect(x: 0, y: 0, width: w, height: h)) else { return nil }
        let imageSize = CGSize(width: w, height: h)
        // landmarks for this face
        let request = VNDetectFaceLandmarksRequest()
        request.inputFaceObservations = [VNFaceObservation(boundingBox: box)]
        try? VNImageRequestHandler(cvPixelBuffer: pixels, orientation: .up, options: [:]).perform([request])
        var aligned: CGImage?
        if let lm = request.results?.first?.landmarks, let points = fivePoints(lm, imageSize) {
            aligned = warp(image, from: points, to: reference)
        }
        if aligned == nil {   // no landmarks: a padded crop of the box, resized
            let r = CGRect(x: box.minX * CGFloat(w), y: (1 - box.maxY) * CGFloat(h), width: box.width * CGFloat(w), height: box.height * CGFloat(h))
                .insetBy(dx: -box.width * CGFloat(w) * 0.1, dy: -box.height * CGFloat(h) * 0.1)
                .intersection(CGRect(origin: .zero, size: imageSize))
            if let crop = image.cropping(to: r) { aligned = resize(crop) }
        }
        guard let face = aligned, let buffer = pixelBuffer(face) else { return nil }
        guard let input = try? MLDictionaryFeatureProvider(dictionary: ["input_image": MLFeatureValue(pixelBuffer: buffer)]),
              let out = try? model.prediction(from: input),
              let array = out.featureValue(for: "embedding")?.multiArrayValue, array.count == dimension else { return nil }
        var v = [Float](repeating: 0, count: array.count)
        for i in 0..<array.count { v[i] = array[i].floatValue }
        let norm = v.reduce(0) { $0 + $1 * $1 }.squareRoot()
        return norm > 0 ? v.map { $0 / norm } : nil
    }

    // ---- landmark geometry (image points with a top-left origin) ----
    private static func points(_ r: VNFaceLandmarkRegion2D, _ s: CGSize) -> [CGPoint] {
        r.pointsInImage(imageSize: s).map { CGPoint(x: $0.x, y: s.height - $0.y) }
    }
    private static func centre(_ r: VNFaceLandmarkRegion2D?, _ s: CGSize) -> CGPoint? {
        guard let r else { return nil }
        let p = points(r, s)
        guard !p.isEmpty else { return nil }
        return CGPoint(x: p.map(\.x).reduce(0, +) / CGFloat(p.count), y: p.map(\.y).reduce(0, +) / CGFloat(p.count))
    }
    private static func fivePoints(_ lm: VNFaceLandmarks2D, _ s: CGSize) -> [CGPoint]? {
        guard let a = centre(lm.leftPupil, s) ?? centre(lm.leftEye, s), let b = centre(lm.rightPupil, s) ?? centre(lm.rightEye, s),
              let nose = centre(lm.nose, s), let lips = lm.outerLips else { return nil }
        let lp = points(lips, s)
        guard let ml = lp.min(by: { $0.x < $1.x }), let mr = lp.max(by: { $0.x < $1.x }) else { return nil }
        return [a.x <= b.x ? a : b, a.x <= b.x ? b : a, nose, ml, mr]
    }
    /// Least-squares similarity transform (rotation, uniform scale, translation) taking src onto dst.
    private static func similarity(_ src: [CGPoint], _ dst: [CGPoint]) -> CGAffineTransform? {
        let n = CGFloat(src.count)
        let sm = CGPoint(x: src.map(\.x).reduce(0, +) / n, y: src.map(\.y).reduce(0, +) / n)
        let dm = CGPoint(x: dst.map(\.x).reduce(0, +) / n, y: dst.map(\.y).reduce(0, +) / n)
        var re: CGFloat = 0, im: CGFloat = 0, den: CGFloat = 0
        for i in src.indices {
            let p = CGPoint(x: src[i].x - sm.x, y: src[i].y - sm.y), q = CGPoint(x: dst[i].x - dm.x, y: dst[i].y - dm.y)
            re += q.x * p.x + q.y * p.y
            im += q.y * p.x - q.x * p.y
            den += p.x * p.x + p.y * p.y
        }
        guard den > 0 else { return nil }
        let a = re / den, b = im / den
        return CGAffineTransform(a: a, b: b, c: -b, d: a, tx: dm.x - (a * sm.x - b * sm.y), ty: dm.y - (b * sm.x + a * sm.y))
    }
    private static func warp(_ image: CGImage, from src: [CGPoint], to dst: [CGPoint]) -> CGImage? {
        let ih = CGFloat(image.height)
        guard let t = similarity(src.map { CGPoint(x: $0.x, y: ih - $0.y) }, dst.map { CGPoint(x: $0.x, y: CGFloat(size) - $0.y) }),
              let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        ctx.interpolationQuality = .high
        ctx.concatenate(t)
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
        return ctx.makeImage()
    }
    private static func resize(_ image: CGImage) -> CGImage? {
        guard let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        ctx.interpolationQuality = .high
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: size, height: size))
        return ctx.makeImage()
    }
    private static func pixelBuffer(_ image: CGImage) -> CVPixelBuffer? {
        var pb: CVPixelBuffer?
        let attrs: [String: Any] = [kCVPixelBufferIOSurfacePropertiesKey as String: [:] as [String: Any]]
        guard CVPixelBufferCreate(kCFAllocatorDefault, size, size, kCVPixelFormatType_32BGRA, attrs as CFDictionary, &pb) == kCVReturnSuccess, let buffer = pb else { return nil }
        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
        guard let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buffer), width: size, height: size, bitsPerComponent: 8,
                                  bytesPerRow: CVPixelBufferGetBytesPerRow(buffer), space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue) else { return nil }
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: size, height: size))
        return buffer
    }
}
