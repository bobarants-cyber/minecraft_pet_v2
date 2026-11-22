// FaceAway — a little security system for your Mac.
//
//  * Instantly switches to a browser tab you choose (or puts up a decoy screen)
//    when your face leaves the camera, or when someone else appears behind you.
//  * Add the people who may use the Mac (you, your mom, ...) and it locks the Mac
//    when anyone else sits down, snaps their photo, and can text you about it.
//  * Optional extras: a live targeting window, hacker-style terminal, voice,
//    alarm, auto-mute, panic keys, and hand/camera-cover gestures.
//
// Build:  ./build.sh        (or: swiftc -O FaceAway.swift -o faceaway)
// Run:    ./faceaway        (lists your open tabs and asks which one to use)
// People: ./faceaway --add "Me"   then   ./faceaway --add "Mom"
// Extras: ./faceaway --all
//
// Requires macOS 11+ and the Xcode Command Line Tools (xcode-select --install).
//
// Why it's fast:
//  * Every camera frame is checked (up to 30 per second), not a few per second.
//  * It switches after 0.3 s without your face by default, and after 2 frames
//    (~70 ms) when a second face shows up.
//  * The tab's location is looked up every second in the background, and the
//    script that switches to it is compiled ahead of time. When it's time to
//    switch, nothing is searched or compiled: one pre-built script just runs.

import AppKit
import AVFoundation
import Carbon
import CoreImage
import Foundation
import QuartzCore
import Vision
import WebKit

// MARK: - Logging

let clock: DateFormatter = {
    let f = DateFormatter()
    f.dateFormat = "HH:mm:ss"
    return f
}()

enum Tone { case info, good, alert }

/// Hacker mode: green terminal text with a live status line at the bottom.
var hackerMode = false
var statusLine = ""

func say(_ message: String, _ tone: Tone = .info) {
    let time = clock.string(from: Date())
    if hackerMode {
        let color = tone == .alert ? "\u{1B}[1;31m" : tone == .good ? "\u{1B}[1;92m" : "\u{1B}[32m"
        print("\r\u{1B}[K\u{1B}[2;32m[\(time)]\u{1B}[0m \(color)\(message.uppercased())\u{1B}[0m")
        if !statusLine.isEmpty { print(statusLine, terminator: "") }
    } else {
        print("[\(time)] \(message)")
    }
    fflush(stdout)
}

/// Rewrites the status line in place (hacker mode only).
func setStatus(_ text: String) {
    guard hackerMode else { return }
    statusLine = "\u{1B}[32m" + text + "\u{1B}[0m"
    print("\r\u{1B}[K" + statusLine, terminator: "")
    fflush(stdout)
}

func bootSequence(profiles: Int) {
    let lines = [
        "> INITIALIZING FACEAWAY SECURITY CORE",
        "> LOADING FACE PRINTS ............ [\(profiles) PROFILE\(profiles == 1 ? "" : "S")]",
        "> CALIBRATING OPTICAL SENSOR ..... OK",
        "> PRE-COMPILING COUNTERMEASURES .. OK",
        "> ARMING INTRUDER LOCK ........... \(profiles > 0 ? "OK" : "SKIPPED (NO PROFILES)")",
        "> SYSTEM ARMED",
    ]
    print("\u{1B}[1;32m", terminator: "")
    for line in lines {
        for ch in line {
            print(ch, terminator: "")
            fflush(stdout)
            usleep(9_000)
        }
        print()
        usleep(140_000)
    }
    print("\u{1B}[0m")
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(("error: " + message + "\n").data(using: .utf8)!)
    exit(1)
}

func formatDuration(_ seconds: Int) -> String {
    if seconds >= 3600 { return "\(seconds / 3600)h \((seconds % 3600) / 60)m" }
    if seconds >= 60 { return "\(seconds / 60)m \(seconds % 60)s" }
    return "\(seconds)s"
}

// MARK: - AppleScript helpers

/// Quotes a Swift string as an AppleScript string literal.
func asQuoted(_ s: String) -> String {
    let escaped = s.replacingOccurrences(of: "\\", with: "\\\\")
                   .replacingOccurrences(of: "\"", with: "\\\"")
    return "\"\(escaped)\""
}

func reportScriptError(_ error: NSDictionary) {
    let msg = error[NSAppleScript.errorMessage] as? String ?? "\(error)"
    say("AppleScript error: \(msg)")
    if (error[NSAppleScript.errorNumber] as? Int) == -1743 {
        say("Allow control in System Settings → Privacy & Security → Automation.")
    }
}

/// Compiles a script now so running it later costs only the Apple events it sends.
func compileScript(_ source: String) -> NSAppleScript? {
    guard let script = NSAppleScript(source: source) else { return nil }
    var error: NSDictionary?
    if script.compileAndReturnError(&error) { return script }
    if let error = error { reportScriptError(error) }
    return nil
}

@discardableResult
func execute(_ script: NSAppleScript, quiet: Bool = false) -> NSAppleEventDescriptor? {
    var error: NSDictionary?
    let result = script.executeAndReturnError(&error)
    if let error = error {
        if !quiet { reportScriptError(error) }
        return nil
    }
    return result
}

@discardableResult
func runAppleScript(_ source: String) -> NSAppleEventDescriptor? {
    guard let script = compileScript(source) else { return nil }
    return execute(script)
}

// MARK: - Browsers

enum Browser: String, CaseIterable {
    case chrome, brave, edge, chromium, safari

    var appName: String {
        switch self {
        case .chrome: return "Google Chrome"
        case .brave: return "Brave Browser"
        case .edge: return "Microsoft Edge"
        case .chromium: return "Chromium"
        case .safari: return "Safari"
        }
    }

    var bundleID: String {
        switch self {
        case .chrome: return "com.google.Chrome"
        case .brave: return "com.brave.Browser"
        case .edge: return "com.microsoft.edgemac"
        case .chromium: return "org.chromium.Chromium"
        case .safari: return "com.apple.Safari"
        }
    }

    var isSafari: Bool { self == .safari }
    var titleProp: String { isSafari ? "name" : "title" }
    var activeIndexProp: String { isSafari ? "index of current tab" : "active tab index" }
    var minimizedProp: String { isSafari ? "miniaturized" : "minimized" }

    var isRunning: Bool {
        !NSRunningApplication.runningApplications(withBundleIdentifier: bundleID).isEmpty
    }

    /// AppleScript that makes tab number `idx` of window `w` the active tab.
    func selectTab(window w: String, index idx: Int) -> String {
        isSafari ? "set current tab of \(w) to tab \(idx) of \(w)"
                 : "set active tab index of \(w) to \(idx)"
    }

    /// Script that shows tab `index` of window `windowID`. Compiled ahead of time.
    func showScript(windowID: Int, index: Int) -> String {
        """
        tell application \(asQuoted(appName))
            set w to window id \(windowID)
            \(selectTab(window: "w", index: index))
            if \(minimizedProp) of w then set \(minimizedProp) of w to false
            set index of w to 1
            activate
        end tell
        """
    }

    /// Script that opens `url` in a new tab and brings it forward.
    func openScript(url: String) -> String {
        let q = asQuoted(url)
        if isSafari {
            return """
            tell application "Safari"
                if (count of windows) = 0 then
                    make new document with properties {URL:\(q)}
                else
                    tell front window
                        set newTab to make new tab at end of tabs with properties {URL:\(q)}
                        set current tab to newTab
                    end tell
                end if
                activate
            end tell
            """
        }
        return """
        tell application \(asQuoted(appName))
            if (count of windows) = 0 then make new window
            tell front window to make new tab with properties {URL:\(q)}
            activate
        end tell
        """
    }

    /// Reads every window's id, active tab and all tab URLs/titles, a few Apple events per window.
    var snapshotScript: String {
        """
        tell application \(asQuoted(appName))
            set out to {}
            repeat with w in windows
                try
                    set end of out to {id of w, \(activeIndexProp) of w, URL of every tab of w, \(titleProp) of every tab of w}
                end try
            end repeat
            return out
        end tell
        """
    }

    static func autodetect() -> Browser {
        Browser.allCases.first { $0.isRunning } ?? .safari
    }
}

struct BrowserTab {
    let windowID: Int
    let index: Int
    let title: String
    let url: String
}

struct BrowserWindow {
    let id: Int
    let activeIndex: Int
    let tabs: [BrowserTab]
}

func strings(_ list: NSAppleEventDescriptor?) -> [String] {
    guard let list = list, list.numberOfItems > 0 else { return [] }
    return (1...list.numberOfItems).map { list.atIndex($0)?.stringValue ?? "" }
}

/// Front-to-back list of the browser's windows. Never launches the browser.
func snapshot(_ b: Browser, using script: NSAppleScript?) -> [BrowserWindow] {
    guard b.isRunning, let script = script, let result = execute(script, quiet: true),
          result.numberOfItems > 0 else { return [] }
    return (1...result.numberOfItems).compactMap { i -> BrowserWindow? in
        guard let item = result.atIndex(i), item.numberOfItems >= 4,
              let wid = item.atIndex(1)?.int32Value else { return nil }
        let active = Int(item.atIndex(2)?.int32Value ?? 1)
        let urls = strings(item.atIndex(3))
        let titles = strings(item.atIndex(4))
        let tabs = urls.indices.map { n in
            BrowserTab(windowID: Int(wid), index: n + 1,
                       title: n < titles.count ? titles[n] : "", url: urls[n])
        }
        return BrowserWindow(id: Int(wid), activeIndex: active, tabs: tabs)
    }
}

/// The first tab whose URL, then title, contains `needle` (ignoring case).
func findTab(_ needle: String, in windows: [BrowserWindow]) -> BrowserTab? {
    let tabs = windows.flatMap(\.tabs)
    return tabs.first { $0.url.localizedCaseInsensitiveContains(needle) }
        ?? tabs.first { $0.title.localizedCaseInsensitiveContains(needle) }
}

// MARK: - Camera

/// Delivers each camera frame with the faces in it (largest first) on the camera queue.
final class FaceWatcher: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "faceaway.camera", qos: .userInteractive)
    private let request = VNDetectFaceRectanglesRequest()
    private var lastAnalysis = Date.distantPast
    private let interval: TimeInterval
    private let minSize: CGFloat
    private let onFrame: (CVPixelBuffer, [CGRect]) -> Void

    init(checksPerSecond: Double, minSize: Double,
         onFrame: @escaping (CVPixelBuffer, [CGRect]) -> Void) {
        self.interval = 1.0 / max(checksPerSecond, 1)
        self.minSize = CGFloat(minSize)
        self.onFrame = onFrame
    }

    private var configured = false
    private(set) var isRunning = false

    /// Turns the camera on (setting it up the first time).
    func start() {
        if !configured { configure() }
        guard !isRunning else { return }
        isRunning = true
        queue.async { self.session.startRunning() }
    }

    /// Turns the camera off (the green light goes out).
    func stop() {
        guard isRunning else { return }
        isRunning = false
        queue.async { self.session.stopRunning() }
    }

    private func configure() {
        configured = true
        let builtIn = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInWideAngleCamera], mediaType: .video, position: .unspecified
        ).devices.first
        guard let device = builtIn ?? AVCaptureDevice.default(for: .video) else {
            fail("No camera found.")
        }
        guard let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input) else {
            fail("Couldn't open the camera \(device.localizedName).")
        }
        session.beginConfiguration()
        // Small frames are plenty for finding faces and keep each check to a few milliseconds.
        if session.canSetSessionPreset(.vga640x480) { session.sessionPreset = .vga640x480 }
        session.addInput(input)

        let output = AVCaptureVideoDataOutput()
        output.alwaysDiscardsLateVideoFrames = true
        output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
        output.setSampleBufferDelegate(self, queue: queue)
        guard session.canAddOutput(output) else { fail("Couldn't read frames from the camera.") }
        session.addOutput(output)
        session.commitConfiguration()
        say("Camera ready: \(device.localizedName)")
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        let now = Date()
        guard now.timeIntervalSince(lastAnalysis) >= interval else { return }
        lastAnalysis = now
        guard let pixels = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

        let handler = VNImageRequestHandler(cvPixelBuffer: pixels, orientation: .up, options: [:])
        do { try handler.perform([request]) } catch { return }

        let faces = (request.results ?? [])
            .map(\.boundingBox)
            .filter { $0.width >= minSize }          // ignore tiny faces far in the background
            .sorted { $0.width * $0.height > $1.width * $1.height }
        onFrame(pixels, faces)
    }
}

// MARK: - Recognizing people

/// One sample of a face: Vision's feature-print vector, as plain numbers.
typealias FacePrint = [Float]

/// Straight-line distance between two face prints; nil if they can't be compared
/// (for example, samples made by a different macOS version's Vision model).
func distance(_ a: FacePrint, _ b: FacePrint) -> Float? {
    guard a.count == b.count, !a.isEmpty else { return nil }
    var sum: Float = 0
    for i in a.indices {
        let d = a[i] - b[i]
        sum += d * d
    }
    return sum.squareRoot()
}

/// A person FaceAway trusts, stored as samples of their face.
struct Person {
    let name: String
    let prints: [FacePrint]
    /// How close a new face must be to one of the samples to count as this person.
    let threshold: Float
}

enum FaceStore {
    static let folder: URL = FileManager.default
        .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("FaceAway", isDirectory: true)

    /// What's written to disk: a plain JSON file per person.
    struct File: Codable {
        var format = 1
        var prints: [FacePrint]
    }

    static func fileURL(for name: String) -> URL {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: " -_"))
        let safe = String(name.unicodeScalars.map { allowed.contains($0) ? Character($0) : "_" })
        return folder.appendingPathComponent(safe + ".faces.json")
    }

    static func displayName(_ url: URL) -> String {
        String(url.lastPathComponent.dropLast(".faces.json".count))
    }

    static func loadPrints(_ url: URL) -> [FacePrint] {
        guard FileManager.default.fileExists(atPath: url.path) else { return [] }
        do {
            return try JSONDecoder().decode(File.self, from: Data(contentsOf: url)).prints
        } catch {
            say("Couldn't read \(url.lastPathComponent): \(error.localizedDescription)")
            return []
        }
    }

    static func loadAll() -> [Person] {
        let files = (try? FileManager.default.contentsOfDirectory(
            at: folder, includingPropertiesForKeys: nil)) ?? []
        return files.filter { $0.lastPathComponent.hasSuffix(".faces.json") }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
            .compactMap { url in
                // only samples made the same way as now (Glance's 512-number embeddings, or the older Vision prints)
                let prints = loadPrints(url).filter { ($0.count == GlanceFace.dimension) == GlanceFace.available }
                guard prints.count >= 2 else { return nil }
                return Person(name: displayName(url), prints: prints, threshold: threshold(for: prints))
            }
    }

    /// Adds samples to a person (creating them if new). Returns the total sample count.
    static func add(_ prints: [FacePrint], to name: String) throws -> Int {
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let url = fileURL(for: name)
        let all = loadPrints(url) + prints
        try JSONEncoder().encode(File(prints: all)).write(to: url, options: .atomic)
        // Read it straight back so a save that can't be loaded is caught right away.
        let check = loadPrints(url)
        guard check.count == all.count else {
            throw NSError(domain: "FaceAway", code: 1, userInfo: [NSLocalizedDescriptionKey:
                "saved \(all.count) samples but could read back only \(check.count)"])
        }
        return all.count
    }

    static func remove(_ name: String) -> Bool {
        (try? FileManager.default.removeItem(at: fileURL(for: name))) != nil
    }

    /// Learns from the samples how much one person's face varies: the 95th percentile
    /// of distances between their own samples, plus 30% slack (samples taken in one sitting
    /// vary less than the same face does across a day).
    static func threshold(for prints: [FacePrint]) -> Float {
        if prints.first?.count == GlanceFace.dimension { return GlanceFace.samePersonDistance }
        var distances: [Float] = []
        for i in 0..<prints.count {
            for j in (i + 1)..<prints.count {
                if let d = distance(prints[i], prints[j]) { distances.append(d) }
            }
        }
        guard !distances.isEmpty else { return 0 }
        distances.sort()
        return distances[Int(Double(distances.count - 1) * 0.95)] * 1.3
    }
}

/// Copies Vision's feature-print bytes out as plain numbers.
func vector(of observation: VNFeaturePrintObservation) -> FacePrint {
    let data = observation.data
    switch observation.elementType {
    case .float:
        return data.withUnsafeBytes { Array($0.bindMemory(to: Float.self)) }
    case .double:
        return data.withUnsafeBytes { $0.bindMemory(to: Double.self).map { Float($0) } }
    default:
        return []
    }
}

/// Turns the face in `box` into a face print that can be compared with stored ones.
func featurePrint(of pixels: CVPixelBuffer, box: CGRect) -> FacePrint? {
    // Glance's recognition (aligned face → ArcFace embedding), when its model is next to the program.
    if GlanceFace.available { return GlanceFace.embedding(of: pixels, box: box) }
    // A little margin around the face, kept inside the frame.
    let region = box.insetBy(dx: -box.width * 0.15, dy: -box.height * 0.15)
        .intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
    guard !region.isNull, region.width > 0, region.height > 0 else { return nil }
    let request = VNGenerateImageFeaturePrintRequest()
    request.regionOfInterest = region
    let handler = VNImageRequestHandler(cvPixelBuffer: pixels, orientation: .up, options: [:])
    do { try handler.perform([request]) } catch { return nil }
    guard let observation = request.results?.first else { return nil }
    let v = vector(of: observation)
    return v.isEmpty ? nil : v
}

/// How usable each face is for recognition, 0–1 (sharp, facing the camera, not cut off).
/// A lowered or turned head scores low, so it isn't mistaken for a stranger.
func faceQualities(_ pixels: CVPixelBuffer, _ boxes: [CGRect]) -> [Float] {
    guard !boxes.isEmpty else { return [] }
    let request = VNDetectFaceCaptureQualityRequest()
    request.inputFaceObservations = boxes.map { VNFaceObservation(boundingBox: $0) }
    let handler = VNImageRequestHandler(cvPixelBuffer: pixels, orientation: .up, options: [:])
    guard (try? handler.perform([request])) != nil,
          let results = request.results, results.count == boxes.count else {
        return boxes.map { _ in 1 }   // can't measure: judge the face as before
    }
    return results.map { $0.faceCaptureQuality ?? 0 }
}

/// True when a person's head and shoulders are close in front of the camera, even if
/// their face can't be seen (looking down at a phone, turned away, leaning on a hand).
func bodyPresent(_ pixels: CVPixelBuffer) -> Bool {
    guard #available(macOS 12.0, *) else { return false }
    let request = VNDetectHumanRectanglesRequest()
    request.upperBodyOnly = true
    let handler = VNImageRequestHandler(cvPixelBuffer: pixels, orientation: .up, options: [:])
    guard (try? handler.perform([request])) != nil else { return false }
    return (request.results ?? []).contains { $0.boundingBox.width >= 0.2 && $0.confidence >= 0.5 }
}

/// False when the face touches the edge of the camera picture (part of it is cut off),
/// which makes it look different from your samples even when it's you.
func fullyInFrame(_ box: CGRect) -> Bool {
    box.minX > 0.01 && box.minY > 0.01 && box.maxX < 0.99 && box.maxY < 0.99
}

/// Ignores faces that never move, such as photos and paintings on the wall behind you,
/// which the camera can mistake for people. A face that has moved even once (a real
/// person) is never ignored while it stays in view.
final class StaticFaceFilter {
    private struct Track { var box: CGRect; let origin: CGRect; let first: Date; var last: Date; var moved: Bool }
    private var tracks: [Track] = []
    let stillFor: TimeInterval
    let tolerance: CGFloat

    init(stillFor: TimeInterval = 20, tolerance: CGFloat = 0.015) {
        self.stillFor = stillFor
        self.tolerance = tolerance
    }

    private func overlap(_ a: CGRect, _ b: CGRect) -> CGFloat {
        let i = a.intersection(b)
        guard !i.isNull else { return 0 }
        let inter = i.width * i.height
        return inter / (a.width * a.height + b.width * b.height - inter)
    }

    /// Returns the faces that belong to real people.
    func filter(_ boxes: [CGRect], now: Date = Date()) -> [CGRect] {
        tracks.removeAll { now.timeIntervalSince($0.last) > 1.5 }   // out of view for a while: forget it
        var used = Set<Int>()
        var keep: [CGRect] = []
        for b in boxes {
            if let i = tracks.indices.first(where: { !used.contains($0) && overlap(tracks[$0].box, b) > 0.4 }) {
                used.insert(i)
                tracks[i].box = b
                tracks[i].last = now
                let o = tracks[i].origin
                if abs(b.midX - o.midX) > tolerance || abs(b.midY - o.midY) > tolerance || abs(b.width - o.width) > tolerance {
                    tracks[i].moved = true
                }
                if !tracks[i].moved && now.timeIntervalSince(tracks[i].first) >= stillFor { continue }   // a picture
            } else {
                tracks.append(Track(box: b, origin: b, first: now, last: now, moved: false))
                used.insert(tracks.count - 1)
            }
            keep.append(b)
        }
        return keep
    }
}

/// One face's recognition result. `sure` is false when the view was too poor to judge.
struct Seen {
    let match: Match?
    let sure: Bool
    var isTrusted: Bool { sure && match?.name != nil }
    var isStranger: Bool { sure && match != nil && match?.name == nil }
}

struct Match {
    let name: String?        // nil = stranger
    let bestName: String
    let distance: Float
    let threshold: Float
}

extension Match {
    /// A friendly "how sure" number: 99% for a perfect match, 50% right at the limit.
    var percent: Int {
        guard threshold > 0 else { return 0 }
        return max(0, min(99, Int(100 * (1 - 0.5 * distance / threshold))))
    }
}

func identify(_ face: FacePrint, among people: [Person], tolerance: Float) -> Match? {
    var best: (person: Person, distance: Float)?
    for person in people {
        for sample in person.prints {
            guard let d = distance(face, sample) else { continue }
            if best == nil || d < best!.distance { best = (person, d) }
        }
    }
    guard let b = best else { return nil }
    let limit = b.person.threshold * tolerance
    return Match(name: b.distance <= limit ? b.person.name : nil,
                 bestName: b.person.name, distance: b.distance, threshold: limit)
}

// MARK: - Locking the Mac

/// Locks the screen, exactly like Ctrl+Cmd+Q. Unlocking needs the Mac's login password.
func lockScreen() {
    typealias LockFn = @convention(c) () -> Int32
    let path = "/System/Library/PrivateFrameworks/login.framework/Versions/Current/login"
    if let lib = dlopen(path, RTLD_NOW), let sym = dlsym(lib, "SACLockScreenImmediate") {
        _ = unsafeBitCast(sym, to: LockFn.self)()
        return
    }
    // Fallback: sleep the display (locks if "Require password" is set to Immediately).
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/usr/bin/pmset")
    p.arguments = ["displaysleepnow"]
    try? p.run()
}

// MARK: - Voice and alarm

func speak(_ text: String) {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/usr/bin/say")
    p.arguments = [text]
    try? p.run()
}

var alarmSound: NSSound?   // kept alive while it plays

func playAlarm() {
    alarmSound = NSSound(named: NSSound.Name("Sosumi")) ?? NSSound(named: NSSound.Name("Basso"))
    alarmSound?.play()
}

// MARK: - Event log

enum EventLog {
    static let url = FaceStore.folder.appendingPathComponent("log.txt")
    static let stamp: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return f
    }()

    static func add(_ line: String) {
        let data = "\(stamp.string(from: Date()))  \(line)\n".data(using: .utf8)!
        try? FileManager.default.createDirectory(at: FaceStore.folder, withIntermediateDirectories: true)
        if let handle = try? FileHandle(forWritingTo: url) {
            handle.seekToEndOfFile()
            handle.write(data)
            handle.closeFile()
        } else {
            try? data.write(to: url)
        }
    }

    static func tail(_ n: Int) -> [String] {
        let text = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
        return text.split(separator: "\n").suffix(n).map(String.init)
    }
}

// MARK: - Intruder photos

enum Intruders {
    static let folder: URL = FileManager.default
        .urls(for: .picturesDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("FaceAway Intruders", isDirectory: true)

    static func save(_ jpeg: Data) -> URL? {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd 'at' HH.mm.ss"
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let url = folder.appendingPathComponent("Intruder \(f.string(from: Date())).jpg")
            try jpeg.write(to: url)
            return url
        } catch {
            say("Couldn't save intruder photo: \(error.localizedDescription)")
            return nil
        }
    }
}

/// Sends you an iMessage (and the photo, if Messages allows it) through the Messages app.
/// Set with --text-via-bridge: Bbokari sends the texts (it already may use Messages) and reads your replies.
var textViaBridge = false

func textMe(_ to: String, message: String, photo: URL?) {
    if textViaBridge {
        var ev: [String: Any] = ["type": "text", "message": message]
        if let photo = photo { ev["photo"] = photo.path }
        Bridge.emit(ev)
        say("Asked Bbokari to text you.")
        EventLog.add("Text sent via Bbokari")
        return
    }
    for keyword in ["participant", "buddy"] {   // "buddy" on macOS 12 and older
        var src = """
        tell application "Messages"
            set svc to 1st account whose service type = iMessage
            set who to \(keyword) \(asQuoted(to)) of svc
            send \(asQuoted(message)) to who
        """
        if let photo = photo {
            src += """

                try
                    send (POSIX file \(asQuoted(photo.path))) to who
                end try
            """
        }
        src += "\nend tell"
        if let script = NSAppleScript(source: src) {
            var error: NSDictionary?
            _ = script.executeAndReturnError(&error)
            if error == nil { say("Texted \(to)."); return }
            if keyword == "buddy", let error = error { reportScriptError(error) }
        }
    }
}

// MARK: - Your answers by text ("Lock computer?" → YES / NO)

/// Reads the replies you send back from your phone, from the Messages app's database on this Mac.
/// (macOS only lets apps read it with Full Disk Access.)
enum Replies {
    static let db = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Messages/chat.db").path

    static func sqlite(_ sql: String) -> (ok: Bool, out: String) {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/sqlite3")
        p.arguments = ["-readonly", "-separator", "\u{1F}", db, sql]
        let out = Pipe()
        p.standardOutput = out
        p.standardError = Pipe()
        do { try p.run() } catch { return (false, "") }
        let data = out.fileHandleForReading.readDataToEndOfFile()
        p.waitUntilExit()
        return (p.terminationStatus == 0, String(data: data, encoding: .utf8) ?? "")
    }

    /// The newest message's number, or nil if FaceAway isn't allowed to read Messages.
    static func lastRow() -> Int? {
        let r = sqlite("SELECT IFNULL(MAX(ROWID),0) FROM message;")
        return r.ok ? Int(r.out.trimmingCharacters(in: .whitespacesAndNewlines)) : nil
    }

    /// Newer macOS keeps the text inside a blob: the words follow "NSString", a '+' and a length.
    static func text(fromHexBody hex: String) -> String? {
        guard hex.count >= 32 else { return nil }
        var bytes: [UInt8] = []
        bytes.reserveCapacity(hex.count / 2)
        var i = hex.startIndex
        while i < hex.endIndex {
            let j = hex.index(i, offsetBy: 2, limitedBy: hex.endIndex) ?? hex.endIndex
            if let b = UInt8(hex[i..<j], radix: 16) { bytes.append(b) }
            i = j
        }
        let marker = Array("NSString".utf8)
        guard bytes.count > marker.count + 4,
              let m = (0...(bytes.count - marker.count)).first(where: { Array(bytes[$0..<($0 + marker.count)]) == marker }) else { return nil }
        var k = m + marker.count
        while k < bytes.count && bytes[k] != 0x2B { k += 1 }
        k += 1
        guard k < bytes.count else { return nil }
        var len = Int(bytes[k])
        k += 1
        if len == 0x81, k + 1 < bytes.count { len = Int(bytes[k]) | (Int(bytes[k + 1]) << 8); k += 2 }
        guard len > 0, k + len <= bytes.count else { return nil }
        return String(bytes: bytes[k..<(k + len)], encoding: .utf8)
    }

    /// Is this Messages handle (phone number or email) the person we texted?
    static func samePerson(_ handle: String, _ to: String) -> Bool {
        let a = handle.filter(\.isNumber), b = to.filter(\.isNumber)
        if b.count >= 7 && a.count >= 7 { return a.hasSuffix(String(b.suffix(9))) || b.hasSuffix(String(a.suffix(9))) }
        return handle.lowercased() == to.lowercased()
    }

    /// The first word of each new message from `to` (lowercased), and the newest row seen.
    static func words(from to: String, after: Int) -> (words: [String], last: Int) {
        let r = sqlite("SELECT m.ROWID, IFNULL(h.id,''), REPLACE(IFNULL(m.text,''), char(10), ' '), IFNULL(hex(m.attributedBody),''), IFNULL(c.chat_identifier,''), m.is_from_me FROM message m LEFT JOIN handle h ON m.handle_id = h.ROWID LEFT JOIN chat_message_join j ON j.message_id = m.ROWID LEFT JOIN chat c ON c.ROWID = j.chat_id WHERE m.ROWID > \(after) ORDER BY m.ROWID;")
        guard r.ok else { return ([], after) }
        var last = after
        var out: [String] = []
        for line in r.out.split(separator: "\n") {
            let f = line.split(separator: "\u{1F}", omittingEmptySubsequences: false).map(String.init)
            guard f.count >= 6, let id = Int(f[0]) else { continue }
            last = max(last, id)
            if f[5] == "1" { continue }   // what the Mac itself sent
            guard samePerson(f[1], to) || (!f[4].isEmpty && samePerson(f[4], to)) else { continue }
            var t = f[2]
            if t.isEmpty { t = text(fromHexBody: f[3]) ?? "" }
            out.append(t.lowercased().components(separatedBy: CharacterSet.letters.inverted).first(where: { !$0.isEmpty }) ?? "")
        }
        return (out, last)
    }

    /// A YES (true) or NO (false) from `to` in the messages after row `after`, and the newest row seen.
    static func answer(from to: String, after: Int) -> (answer: Bool?, last: Int) {
        let (words, last) = Replies.words(from: to, after: after)
        var result: Bool?
        for word in words {
            if ["yes", "y", "yeah", "yep", "yup", "lock", "si", "sí", "s"].contains(word) { result = true }
            if ["no", "n", "nope", "nah", "dont", "don"].contains(word) { result = false }
        }
        return (result, last)
    }

}

// MARK: - Auto-mute

final class Media {
    private var mutedByUs = false
    private var paused: [String] = []
    private let players = [("com.apple.Music", "Music"), ("com.spotify.client", "Spotify")]

    /// Mutes the Mac and pauses Music/Spotify if they're playing.
    func quiet() {
        let muted = runAppleScript("output muted of (get volume settings)")?.booleanValue ?? false
        if !muted {
            runAppleScript("set volume with output muted")
            mutedByUs = true
        }
        for (bundle, name) in players
        where !NSRunningApplication.runningApplications(withBundleIdentifier: bundle).isEmpty {
            let result = runAppleScript("""
            tell application \(asQuoted(name))
                if player state is playing then
                    pause
                    return "paused"
                end if
            end tell
            return ""
            """)
            if result?.stringValue == "paused" { paused.append(name) }
        }
    }

    func unmute() {
        guard mutedByUs else { return }
        runAppleScript("set volume without output muted")
        mutedByUs = false
    }

    func restore() {
        unmute()
        for name in paused { runAppleScript("tell application \(asQuoted(name)) to play") }
        paused = []
    }
}

// MARK: - Decoy screen

/// Covers every screen with a fake "installing update" screen, or plain black.
final class Decoy {
    let style: String
    let schoolName: String
    private var windows: [NSWindow] = []
    private var bars: [NSProgressIndicator] = []
    private var notes: [NSTextField] = []
    private var timer: Timer?
    private var progress = 0.0

    init(style: String, schoolName: String = "Northfield Academy") {
        self.style = style
        self.schoolName = schoolName
    }

    func show() {
        guard windows.isEmpty else { return }
        progress = Double.random(in: 18...46)
        for screen in NSScreen.screens {
            let w = NSWindow(contentRect: screen.frame, styleMask: .borderless,
                             backing: .buffered, defer: false)
            w.level = .screenSaver
            w.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
            w.isOpaque = true
            w.hasShadow = false
            w.isReleasedWhenClosed = false
            switch style {
            case "black":
                w.backgroundColor = .black
            case "school":
                w.backgroundColor = .white
                w.contentView = schoolView(size: screen.frame.size)
            default:
                w.backgroundColor = NSColor(calibratedWhite: 0.07, alpha: 1)
                w.contentView = updateView(size: screen.frame.size)
            }
            w.setFrame(screen.frame, display: true)
            w.orderFrontRegardless()
            windows.append(w)
        }
        if style == "update" {
            tick()
            timer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: true) { [weak self] _ in self?.tick() }
        }
    }

    func dismiss() {
        timer?.invalidate()
        timer = nil
        windows.forEach { $0.orderOut(nil) }
        windows = []
        bars = []
        notes = []
    }

    private func tick() {
        progress = min(progress + Double.random(in: 0...0.6), 97)
        let minutes = max(1, Int((100 - progress) * 0.4))
        bars.forEach { $0.doubleValue = progress }
        notes.forEach { $0.stringValue = "About \(minutes) minute\(minutes == 1 ? "" : "s") remaining" }
    }

    private func label(_ text: String, size: CGFloat, white: CGFloat, y: CGFloat, width: CGFloat) -> NSTextField {
        let l = NSTextField(labelWithString: text)
        l.font = .systemFont(ofSize: size, weight: size > 16 ? .medium : .regular)
        l.textColor = NSColor(calibratedWhite: white, alpha: 1)
        l.alignment = .center
        l.frame = NSRect(x: 0, y: y, width: width, height: size + 10)
        return l
    }

    /// A made-up school's student portal, drawn by a web view from the HTML below.
    private func schoolView(size: CGSize) -> NSView {
        let web = WKWebView(frame: NSRect(origin: .zero, size: size), configuration: WKWebViewConfiguration())
        web.loadHTMLString(schoolPortalHTML(schoolName: schoolName), baseURL: nil)
        return web
    }

    private func updateView(size: CGSize) -> NSView {
        let v = NSView(frame: NSRect(origin: .zero, size: size))
        v.appearance = NSAppearance(named: .darkAqua)
        let mid = size.height / 2
        let bar = NSProgressIndicator(frame: NSRect(x: (size.width - 320) / 2, y: mid - 6, width: 320, height: 12))
        bar.style = .bar
        bar.isIndeterminate = false
        bar.minValue = 0
        bar.maxValue = 100
        let note = label("", size: 13, white: 0.6, y: mid - 44, width: size.width)
        v.addSubview(label("Installing update…", size: 22, white: 0.9, y: mid + 24, width: size.width))
        v.addSubview(bar)
        v.addSubview(note)
        v.addSubview(label("Please don't turn off your computer.", size: 13, white: 0.45, y: mid - 68, width: size.width))
        bars.append(bar)
        notes.append(note)
        return v
    }
}

/// HTML for the school decoy: a believable, generic student portal. Dates, the greeting
/// and the current lesson are filled in from the Mac's clock, so it always looks current.
func schoolPortalHTML(schoolName: String) -> String {
    func escape(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
         .replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "\"", with: "&quot;")
    }
    let initials = schoolName.split(separator: " ").prefix(2).compactMap(\.first).map(String.init).joined().uppercased()
    return schoolPortalTemplate
        .replacingOccurrences(of: "{{SCHOOL}}", with: escape(schoolName))
        .replacingOccurrences(of: "{{INITIALS}}", with: escape(initials.isEmpty ? "S" : initials))
}

let schoolPortalTemplate = #"""
<!doctype html>
<html><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font: 14px/1.5 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1f2933; background: #f3f5f8;
         height: 100vh; display: flex; flex-direction: column; cursor: default; user-select: none; }
  header { background: #1d4e89; color: #fff; display: flex; align-items: center; gap: 28px; padding: 0 28px; height: 60px; flex: none; }
  .brand { display: flex; align-items: center; gap: 12px; font-weight: 600; font-size: 17px; }
  .crest { width: 36px; height: 36px; border-radius: 50%; background: #f2b632; color: #1d4e89; display: grid;
           place-items: center; font-weight: 800; font-size: 14px; border: 2px solid #fff; }
  nav { display: flex; gap: 4px; flex: 1; }
  nav a { color: #d6e4f5; text-decoration: none; padding: 8px 14px; border-radius: 6px; font-size: 14px; }
  nav a.on { background: rgba(255,255,255,.16); color: #fff; }
  .me { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #d6e4f5; }
  .avatar { width: 32px; height: 32px; border-radius: 50%; background: #5b8fd1; color: #fff; display: grid; place-items: center; font-weight: 600; }
  .bell { position: relative; font-size: 18px; margin-right: 6px; }
  .bell b { position: absolute; top: -4px; right: -8px; background: #e5484d; color: #fff; font-size: 10px; border-radius: 8px; padding: 0 5px; }
  main { flex: 1; display: grid; grid-template-columns: 220px 1fr 330px; gap: 24px; padding: 24px 28px; overflow: hidden; }
  aside.left { display: flex; flex-direction: column; gap: 4px; }
  aside.left h4, .card h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #6b7785; margin-bottom: 8px; }
  .course { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 8px; color: #1f2933; }
  .course:hover { background: #e7edf5; }
  .dot { width: 10px; height: 10px; border-radius: 3px; flex: none; }
  .col { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
  h1 { font-size: 24px; font-weight: 600; }
  .sub { color: #6b7785; margin-top: 2px; }
  .card { background: #fff; border: 1px solid #e1e6ec; border-radius: 12px; padding: 18px 20px; }
  .task { display: grid; grid-template-columns: 6px 1fr auto; gap: 14px; align-items: center; padding: 12px 0; border-top: 1px solid #eef1f4; }
  .task:first-of-type { border-top: 0; }
  .bar { width: 6px; height: 38px; border-radius: 3px; }
  .task .t { font-weight: 600; }
  .task .c { color: #6b7785; font-size: 13px; }
  .due { font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 999px; background: #eef3fb; color: #1d4e89; white-space: nowrap; }
  .due.soon { background: #fdecec; color: #c53030; }
  .done { background: #e6f6ee; color: #1f7a4d; }
  .progress { height: 8px; background: #eef1f4; border-radius: 4px; overflow: hidden; margin-top: 6px; }
  .progress span { display: block; height: 100%; background: #2f855a; }
  .row { display: flex; justify-content: space-between; align-items: baseline; }
  .grades .row { padding: 8px 0; border-top: 1px solid #eef1f4; }
  .grades .row:first-of-type { border-top: 0; }
  .grade { font-weight: 700; font-variant-numeric: tabular-nums; }
  .lesson { display: grid; grid-template-columns: 92px 1fr; gap: 10px; padding: 8px 10px; border-radius: 8px; font-size: 13px; }
  .lesson .time { color: #6b7785; font-variant-numeric: tabular-nums; }
  .lesson.now { background: #fff6dd; font-weight: 600; }
  .ann { padding: 10px 0; border-top: 1px solid #eef1f4; font-size: 13px; }
  .ann:first-of-type { border-top: 0; }
  .ann .when { color: #6b7785; font-size: 12px; }
</style></head>
<body>
<header>
  <div class="brand"><div class="crest">{{INITIALS}}</div>{{SCHOOL}}</div>
  <nav><a class="on">Dashboard</a><a>Courses</a><a>Assignments</a><a>Grades</a><a>Calendar</a><a>Messages</a></nav>
  <div class="me"><span class="bell">&#128276;<b>3</b></span><span>Student</span><div class="avatar">ST</div></div>
</header>
<main>
  <aside class="left">
    <h4>My courses</h4>
    <div class="course"><span class="dot" style="background:#3b82f6"></span>Mathematics</div>
    <div class="course"><span class="dot" style="background:#10b981"></span>Science</div>
    <div class="course"><span class="dot" style="background:#f59e0b"></span>English Literature</div>
    <div class="course"><span class="dot" style="background:#8b5cf6"></span>History</div>
    <div class="course"><span class="dot" style="background:#ef4444"></span>Spanish</div>
    <div class="course"><span class="dot" style="background:#14b8a6"></span>Computing</div>
    <div class="course"><span class="dot" style="background:#ec4899"></span>Art &amp; Design</div>
  </aside>
  <section class="col">
    <div><h1 id="hello">Good afternoon</h1><p class="sub" id="today"></p></div>
    <div class="card">
      <h3>Due soon</h3>
      <div class="task"><span class="bar" style="background:#3b82f6"></span><div><div class="t">Algebra practice: simultaneous equations</div><div class="c">Mathematics · 20 questions</div></div><span class="due soon" data-days="1"></span></div>
      <div class="task"><span class="bar" style="background:#f59e0b"></span><div><div class="t">Reading response: chapters 7–9</div><div class="c">English Literature · 400 words</div></div><span class="due" data-days="2"></span></div>
      <div class="task"><span class="bar" style="background:#10b981"></span><div><div class="t">Lab report: density of liquids</div><div class="c">Science · include results table</div></div><span class="due" data-days="4"></span></div>
      <div class="task"><span class="bar" style="background:#8b5cf6"></span><div><div class="t">Source analysis: the Industrial Revolution</div><div class="c">History · 3 sources</div></div><span class="due" data-days="6"></span></div>
      <div class="task"><span class="bar" style="background:#14b8a6"></span><div><div class="t">Python loops worksheet</div><div class="c">Computing</div></div><span class="due done">Submitted</span></div>
    </div>
    <div class="card">
      <h3>This term</h3>
      <div class="row"><span>Assignments completed</span><span class="grade">18 / 22</span></div>
      <div class="progress"><span style="width:82%"></span></div>
    </div>
  </section>
  <aside class="col">
    <div class="card">
      <h3>Today's timetable</h3>
      <div id="timetable"></div>
    </div>
    <div class="card grades">
      <h3>Recent grades</h3>
      <div class="row"><span>Science quiz: forces</span><span class="grade">17/20</span></div>
      <div class="row"><span>Spanish vocabulary test</span><span class="grade">B+</span></div>
      <div class="row"><span>Maths: fractions review</span><span class="grade">88%</span></div>
    </div>
    <div class="card">
      <h3>Announcements</h3>
      <div class="ann">Library opening hours extended during exam season.<div class="when" data-ago="1"></div></div>
      <div class="ann">Reminder: bring your PE kit on Thursday.<div class="when" data-ago="2"></div></div>
    </div>
  </aside>
</main>
<script>
  var now = new Date();
  var h = now.getHours();
  document.getElementById('hello').textContent = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  var opts = { weekday: 'long', day: 'numeric', month: 'long' };
  document.getElementById('today').textContent = now.toLocaleDateString('en-GB', opts);
  function addDays(n) { var d = new Date(now); d.setDate(d.getDate() + n); return d; }
  document.querySelectorAll('[data-days]').forEach(function (el) {
    var n = +el.getAttribute('data-days');
    el.textContent = n === 1 ? 'Due tomorrow' : 'Due ' + addDays(n).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  });
  document.querySelectorAll('[data-ago]').forEach(function (el) {
    var n = +el.getAttribute('data-ago');
    el.textContent = n === 1 ? 'Yesterday' : addDays(-n).toLocaleDateString('en-GB', { weekday: 'long' });
  });
  var lessons = [['08:50','09:50','Mathematics'],['09:50','10:50','English Literature'],['10:50','11:10','Break'],
                 ['11:10','12:10','Science'],['12:10','13:00','Lunch'],['13:00','14:00','History'],['14:00','15:00','Computing']];
  var mins = h * 60 + now.getMinutes();
  function toMin(t) { var p = t.split(':'); return +p[0] * 60 + +p[1]; }
  document.getElementById('timetable').innerHTML = lessons.map(function (l) {
    var on = mins >= toMin(l[0]) && mins < toMin(l[1]);
    return '<div class="lesson' + (on ? ' now' : '') + '"><span class="time">' + l[0] + '–' + l[1] + '</span><span>' + l[2] + '</span></div>';
  }).join('');
</script>
</body></html>
"""#

// MARK: - Targeting window

/// Live camera view with corner brackets and labels around every face.
final class HUD {
    private let window: NSWindow
    private let preview: AVCaptureVideoPreviewLayer
    private let overlay = CALayer()
    private let status = CATextLayer()
    private let scanline = CALayer()
    private let scale: CGFloat

    init(session: AVCaptureSession) {
        let size = NSRect(x: 0, y: 0, width: 560, height: 420)
        window = NSWindow(contentRect: size, styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "FaceAway — Targeting"
        window.isReleasedWhenClosed = false
        window.backgroundColor = .black
        scale = window.backingScaleFactor

        let view = NSView(frame: size)
        view.wantsLayer = true
        let root = view.layer!
        root.backgroundColor = NSColor.black.cgColor

        preview = AVCaptureVideoPreviewLayer(session: session)
        preview.videoGravity = .resizeAspectFill
        if let c = preview.connection, c.isVideoMirroringSupported {
            c.automaticallyAdjustsVideoMirroring = false
            c.isVideoMirrored = true   // like a mirror, matching the boxes below
        }
        for layer in [preview, overlay] as [CALayer] {
            layer.frame = root.bounds
            layer.autoresizingMask = [.layerWidthSizable, .layerHeightSizable]
            root.addSublayer(layer)
        }

        scanline.backgroundColor = NSColor.systemGreen.withAlphaComponent(0.35).cgColor
        scanline.frame = CGRect(x: 0, y: 0, width: root.bounds.width, height: 2)
        scanline.autoresizingMask = [.layerWidthSizable]
        root.addSublayer(scanline)
        let sweep = CABasicAnimation(keyPath: "position.y")
        sweep.fromValue = root.bounds.height
        sweep.toValue = 0
        sweep.duration = 2.5
        sweep.repeatCount = .infinity
        scanline.add(sweep, forKey: "sweep")

        status.font = "Menlo-Bold" as CFString
        status.fontSize = 12
        status.foregroundColor = NSColor.systemGreen.cgColor
        status.backgroundColor = NSColor.black.withAlphaComponent(0.6).cgColor
        status.contentsScale = scale
        status.frame = CGRect(x: 0, y: root.bounds.height - 20, width: root.bounds.width, height: 20)
        status.autoresizingMask = [.layerWidthSizable, .layerMinYMargin]
        root.addSublayer(status)

        window.contentView = view
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    /// `faces` are Vision boxes (0–1, origin bottom-left) in the camera image.
    func update(faces: [CGRect], labels: [(String, NSColor)], imageSize: CGSize, status text: String) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        status.string = " " + text
        overlay.sublayers?.forEach { $0.removeFromSuperlayer() }

        let b = overlay.bounds
        if imageSize.width > 0 && imageSize.height > 0 {
            // Same "aspect fill" math the preview uses, mirrored horizontally.
            let s = max(b.width / imageSize.width, b.height / imageSize.height)
            let dw = imageSize.width * s, dh = imageSize.height * s
            let ox = (b.width - dw) / 2, oy = (b.height - dh) / 2
            for (i, f) in faces.enumerated() {
                let r = CGRect(x: ox + (1 - f.maxX) * dw, y: oy + f.minY * dh,
                               width: f.width * dw, height: f.height * dh)
                let (text, color) = i < labels.count ? labels[i] : ("TARGET", NSColor.systemTeal)

                let shape = CAShapeLayer()
                shape.path = brackets(r)
                shape.strokeColor = color.cgColor
                shape.fillColor = nil
                shape.lineWidth = 2.5
                overlay.addSublayer(shape)

                let label = CATextLayer()
                label.string = text
                label.font = "Menlo-Bold" as CFString
                label.fontSize = 13
                label.foregroundColor = color.cgColor
                label.contentsScale = scale
                label.frame = CGRect(x: r.minX, y: r.maxY + 4, width: max(r.width, 240), height: 18)
                overlay.addSublayer(label)
            }
        }
        CATransaction.commit()
    }

    private func brackets(_ r: CGRect) -> CGPath {
        let p = CGMutablePath()
        let l = min(r.width, r.height) * 0.25
        let corners: [(CGFloat, CGFloat, CGFloat, CGFloat)] = [
            (r.minX, r.minY, l, l), (r.maxX, r.minY, -l, l),
            (r.minX, r.maxY, l, -l), (r.maxX, r.maxY, -l, -l),
        ]
        for (x, y, dx, dy) in corners {
            p.move(to: CGPoint(x: x + dx, y: y))
            p.addLine(to: CGPoint(x: x, y: y))
            p.addLine(to: CGPoint(x: x, y: y + dy))
        }
        return p
    }
}

// MARK: - Face ID animation (Glance's pill and scan videos — see GlanceUI.swift)

/// Glance's Face ID look. On a Mac without a notch it's Glance's floating pill at the top centre of the screen:
/// waiting → the still; recognised → Glance's unlock video (blue scan → check); not recognised → the failure video.
final class FaceIDOverlay {
    private let pill = GlancePill()
    /// While the lock screen is up, the pill stays open (waiting) after a failure.
    var holdOpen = false

    static let blue = NSColor(calibratedRed: 0.16, green: 0.47, blue: 1.0, alpha: 1)
    static let cyan = NSColor(calibratedRed: 0.35, green: 0.85, blue: 1.0, alpha: 1)
    static let green = NSColor(calibratedRed: 0.30, green: 0.85, blue: 0.40, alpha: 1)
    static let red = NSColor(calibratedRed: 1.0, green: 0.27, blue: 0.23, alpha: 1)

    var isVisible: Bool { pill.isOpen }

    /// Corner brackets, two eyes, a nose and a smile, in a box `s` points wide.
    static func facePath(size s: CGFloat) -> CGPath {
        let L = s * 0.27, r = s * 0.17
        let p = CGMutablePath()
        // Corners: (corner point, direction along x, direction along y)
        let corners: [(CGFloat, CGFloat, CGFloat, CGFloat)] = [(0, s, 1, -1), (s, s, -1, -1), (0, 0, 1, 1), (s, 0, -1, 1)]
        for (x, y, dx, dy) in corners {
            p.move(to: CGPoint(x: x, y: y + dy * L))
            p.addArc(tangent1End: CGPoint(x: x, y: y), tangent2End: CGPoint(x: x + dx * L, y: y), radius: r)
            p.addLine(to: CGPoint(x: x + dx * L, y: y))
        }
        p.move(to: CGPoint(x: s * 0.32, y: s * 0.70)); p.addLine(to: CGPoint(x: s * 0.32, y: s * 0.60))    // left eye
        p.move(to: CGPoint(x: s * 0.68, y: s * 0.70)); p.addLine(to: CGPoint(x: s * 0.68, y: s * 0.60))    // right eye
        p.move(to: CGPoint(x: s * 0.51, y: s * 0.70)); p.addLine(to: CGPoint(x: s * 0.51, y: s * 0.50))    // nose
        p.addQuadCurve(to: CGPoint(x: s * 0.44, y: s * 0.46), control: CGPoint(x: s * 0.51, y: s * 0.45))
        p.move(to: CGPoint(x: s * 0.33, y: s * 0.34))                                                     // smile
        p.addQuadCurve(to: CGPoint(x: s * 0.67, y: s * 0.34), control: CGPoint(x: s * 0.50, y: s * 0.20))
        return p
    }

    /// The lock screen is up: the pill opens and waits for a face.
    func scanning() { holdOpen = true; pill.show(.idle) }
    func success(_ text: String) { holdOpen = false; pill.play(.success, thenClose: true) }
    func failure(_ text: String) { pill.play(.failure, thenClose: !holdOpen) }
    func progress(_ fraction: Double) { pill.show(.idle) }
    func dismissNow() { holdOpen = false; pill.hide() }
}

// MARK: - Face-unlock lock screen

/// FaceAway's own Face ID-style lock screen. It covers every screen, blocks app switching,
/// Force Quit and the keyboard, and opens when FaceAway recognizes a trusted face, like an
/// iPhone. (Only macOS can open its real lock screen, which needs the password; FaceAway
/// switches to it only if a stranger keeps trying.)
final class SoftLock {
    private final class KeyWindow: NSWindow {
        override var canBecomeKey: Bool { true }
        override var canBecomeMain: Bool { true }
    }

    private var windows: [NSWindow] = []
    private var messages: [NSTextField] = []
    private var clocks: [NSTextField] = []
    private var dates: [NSTextField] = []
    private let dateFormat: DateFormatter = {
        let f = DateFormatter()
        f.setLocalizedDateFormatFromTemplate("EEEEdMMMM")
        return f
    }()
    private var timer: Timer?
    /// "Use Mac password": hands over to the real macOS lock (e.g. the camera can't see you in the dark).
    var onUsePassword: (() -> Void)?
    private var buttonActions: [MenuAction] = []
    private(set) var message = SoftLock.prompt
    static let prompt = "Look at the camera to unlock"
    var isShowing: Bool { !windows.isEmpty }

    func show() {
        guard windows.isEmpty else { return }
        message = SoftLock.prompt
        for (i, screen) in NSScreen.screens.enumerated() {
            let w = KeyWindow(contentRect: screen.frame, styleMask: .borderless, backing: .buffered, defer: false)
            w.level = .screenSaver
            w.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
            w.isOpaque = true
            w.hasShadow = false
            w.isReleasedWhenClosed = false
            w.backgroundColor = NSColor(calibratedWhite: 0.06, alpha: 1)
            w.contentView = lockView(size: screen.frame.size)
            w.setFrame(screen.frame, display: true)
            if i == 0 { w.makeKeyAndOrderFront(nil) } else { w.orderFrontRegardless() }
            windows.append(w)
        }
        NSApp.activate(ignoringOtherApps: true)
        // Kiosk mode while locked: no Dock, menu bar, app switching, Force Quit or log out.
        NSApp.presentationOptions = [.hideDock, .hideMenuBar, .disableProcessSwitching,
                                     .disableForceQuit, .disableSessionTermination, .disableHideApplication]
        tick()
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.tick() }
    }

    func dismiss() {
        timer?.invalidate()
        timer = nil
        if !windows.isEmpty { NSApp.presentationOptions = [] }
        windows.forEach { $0.orderOut(nil) }
        windows = []
        messages = []
        clocks = []
        dates = []
        buttonActions = []
    }

    /// The line under "Locked": the unlock prompt, or a red "Not recognized".
    func setMessage(_ text: String, alert: Bool = false) {
        message = text
        messages.forEach {
            $0.stringValue = text
            $0.textColor = alert ? FaceIDOverlay.red : NSColor(calibratedWhite: 0.65, alpha: 1)
        }
    }

    private func tick() {
        clocks.forEach { $0.stringValue = clock.string(from: Date()).prefix(5).description }
        dates.forEach { $0.stringValue = dateFormat.string(from: Date()) }
    }

    private func text(_ s: String, size: CGFloat, weight: NSFont.Weight, white: CGFloat, y: CGFloat, width: CGFloat) -> NSTextField {
        let l = NSTextField(labelWithString: s)
        l.font = .systemFont(ofSize: size, weight: weight)
        l.textColor = NSColor(calibratedWhite: white, alpha: 1)
        l.alignment = .center
        l.frame = NSRect(x: 0, y: y, width: width, height: size + 14)
        return l
    }

    private func lockView(size: CGSize) -> NSView {
        let v = NSView(frame: NSRect(origin: .zero, size: size))
        v.wantsLayer = true
        // Your own wallpaper, blurred, like the macOS lock screen.
        if let screen = NSScreen.main, let url = NSWorkspace.shared.desktopImageURL(for: screen),
           let picture = NSImage(contentsOf: url) {
            let wall = CALayer()
            wall.frame = CGRect(origin: .zero, size: size)
            wall.contents = picture
            wall.contentsGravity = .resizeAspectFill
            v.layer?.addSublayer(wall)
        }
        let blur = NSVisualEffectView(frame: NSRect(origin: .zero, size: size))
        blur.material = .fullScreenUI
        blur.blendingMode = .withinWindow
        blur.state = .active
        blur.appearance = NSAppearance(named: .darkAqua)
        v.addSubview(blur)

        let top = size.height
        let date = text("", size: 24, weight: .semibold, white: 0.92, y: top - 170, width: size.width)
        let clockLabel = text("", size: 112, weight: .bold, white: 0.95, y: top - 310, width: size.width)
        if let rounded = NSFont.systemFont(ofSize: 112, weight: .bold).fontDescriptor.withDesign(.rounded) {
            clockLabel.font = NSFont(descriptor: rounded, size: 112)
        }
        v.addSubview(date)
        v.addSubview(clockLabel)

        let glyphSize: CGFloat = 76
        let glyphView = NSView(frame: NSRect(x: (size.width - glyphSize) / 2, y: 190, width: glyphSize, height: glyphSize))
        glyphView.wantsLayer = true
        let face = CAShapeLayer()
        face.frame = CGRect(x: 0, y: 0, width: glyphSize, height: glyphSize)
        face.path = FaceIDOverlay.facePath(size: glyphSize)
        face.strokeColor = NSColor.white.cgColor
        face.fillColor = nil
        face.lineWidth = 4.5
        face.lineCap = .round
        face.lineJoin = .round
        let pulse = CABasicAnimation(keyPath: "opacity")
        pulse.fromValue = 1.0
        pulse.toValue = 0.4
        pulse.duration = 1.1
        pulse.autoreverses = true
        pulse.repeatCount = .infinity
        face.add(pulse, forKey: "pulse")
        glyphView.layer?.addSublayer(face)
        v.addSubview(glyphView)

        let prompt = text(message, size: 14, weight: .medium, white: 0.85, y: 140, width: size.width)
        v.addSubview(prompt)
        let action = MenuAction { [weak self] in self?.onUsePassword?() }
        buttonActions.append(action)
        let button = NSButton(title: "Use Mac password", target: action, action: #selector(MenuAction.fire))
        button.bezelStyle = .rounded
        button.appearance = NSAppearance(named: .darkAqua)
        button.sizeToFit()
        button.frame.origin = NSPoint(x: (size.width - button.frame.width) / 2, y: 60)
        v.addSubview(button)
        messages.append(prompt)
        clocks.append(clockLabel)
        dates.append(date)
        return v
    }
}

// MARK: - Your FaceAway password (for the panic screen)

/// SHA-256, written out so FaceAway needs no extra libraries.
enum SHA256 {
    private static let k: [UInt32] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]

    static func hash(_ message: [UInt8]) -> [UInt8] {
        var h: [UInt32] = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
        var data = message
        let bitLength = UInt64(message.count) * 8
        data.append(0x80)
        while data.count % 64 != 56 { data.append(0) }
        for i in (0..<8).reversed() { data.append(UInt8((bitLength >> (UInt64(i) * 8)) & 0xff)) }
        func rotr(_ x: UInt32, _ n: UInt32) -> UInt32 { (x >> n) | (x << (32 - n)) }
        var w = [UInt32](repeating: 0, count: 64)
        for chunk in stride(from: 0, to: data.count, by: 64) {
            for i in 0..<16 {
                let j = chunk + i * 4
                w[i] = UInt32(data[j]) << 24 | UInt32(data[j + 1]) << 16 | UInt32(data[j + 2]) << 8 | UInt32(data[j + 3])
            }
            for i in 16..<64 {
                let s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >> 3)
                let s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >> 10)
                w[i] = w[i - 16] &+ s0 &+ w[i - 7] &+ s1
            }
            var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7]
            for i in 0..<64 {
                let s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
                let ch = (e & f) ^ (~e & g)
                let t1 = hh &+ s1 &+ ch &+ k[i] &+ w[i]
                let s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
                let maj = (a & b) ^ (a & c) ^ (b & c)
                let t2 = s0 &+ maj
                hh = g; g = f; f = e; e = d &+ t1; d = c; c = b; b = a; a = t1 &+ t2
            }
            h[0] = h[0] &+ a; h[1] = h[1] &+ b; h[2] = h[2] &+ c; h[3] = h[3] &+ d
            h[4] = h[4] &+ e; h[5] = h[5] &+ f; h[6] = h[6] &+ g; h[7] = h[7] &+ hh
        }
        return h.flatMap { v in (0..<4).map { UInt8((v >> (24 - UInt32($0) * 8)) & 0xff) } }
    }

    static func hex(_ bytes: [UInt8]) -> String { bytes.map { String(format: "%02x", $0) }.joined() }
}

/// Your FaceAway password, stored only as a salted, stretched hash (never the password itself).
enum PasswordStore {
    static let url = FaceStore.folder.appendingPathComponent("password.json")
    struct Saved: Codable { let salt: String; let hash: String; let rounds: Int }

    static var isSet: Bool { load() != nil }

    static func load() -> Saved? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Saved.self, from: data)
    }

    static func digest(_ password: String, salt: [UInt8], rounds: Int) -> [UInt8] {
        var h = SHA256.hash(salt + Array(password.utf8))
        for _ in 1..<max(rounds, 1) { h = SHA256.hash(h + salt) }
        return h
    }

    static func set(_ password: String) throws {
        let salt = (0..<16).map { _ in UInt8.random(in: 0...255) }
        let rounds = 20_000
        let saved = Saved(salt: SHA256.hex(salt), hash: SHA256.hex(digest(password, salt: salt, rounds: rounds)), rounds: rounds)
        try FileManager.default.createDirectory(at: FaceStore.folder, withIntermediateDirectories: true)
        try JSONEncoder().encode(saved).write(to: url, options: .atomic)
    }

    static func check(_ password: String) -> Bool {
        guard let saved = load() else { return false }
        var salt: [UInt8] = []
        var i = saved.salt.startIndex
        while i < saved.salt.endIndex, let j = saved.salt.index(i, offsetBy: 2, limitedBy: saved.salt.endIndex) {
            guard let b = UInt8(saved.salt[i..<j], radix: 16) else { return false }
            salt.append(b)
            i = j
        }
        let got = Array(SHA256.hex(digest(password, salt: salt, rounds: saved.rounds)).utf8)
        let want = Array(saved.hash.utf8)
        guard got.count == want.count else { return false }
        var diff: UInt8 = 0
        for (x, y) in zip(got, want) { diff |= x ^ y }   // same time whether it's close or not
        return diff == 0
    }
}

// MARK: - Panic screen ("Enter password")

/// Covers every screen with "Enter password". Only your FaceAway password closes it;
/// app switching, Force Quit and logging out are blocked while it's up.
final class PanicScreen: NSObject, NSTextFieldDelegate {
    private final class KeyWindow: NSWindow {
        override var canBecomeKey: Bool { true }
        override var canBecomeMain: Bool { true }
    }

    var hacker: Bool
    var onUnlock: () -> Void = {}
    private var windows: [NSWindow] = []
    private var field: NSSecureTextField?
    private var status: NSTextField?
    private var failures = 0
    private var blockedUntil = Date.distantPast
    var isShowing: Bool { !windows.isEmpty }
    private(set) var statusText = ""

    init(hacker: Bool) { self.hacker = hacker }

    func show() {
        guard windows.isEmpty else { return }
        Bridge.emit(["type": "panic"])
        let main = NSScreen.main ?? NSScreen.screens.first
        for screen in NSScreen.screens {
            let w = KeyWindow(contentRect: screen.frame, styleMask: .borderless, backing: .buffered, defer: false)
            w.level = NSWindow.Level(rawValue: NSWindow.Level.screenSaver.rawValue + 2)
            w.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
            w.isOpaque = true
            w.hasShadow = false
            w.isReleasedWhenClosed = false
            w.backgroundColor = hacker ? .black : NSColor(calibratedWhite: 0.08, alpha: 1)
            let isMain = screen === main
            w.contentView = isMain ? promptView(size: screen.frame.size) : NSView(frame: NSRect(origin: .zero, size: screen.frame.size))
            w.setFrame(screen.frame, display: true)
            if isMain { w.makeKeyAndOrderFront(nil) } else { w.orderFrontRegardless() }
            windows.append(w)
        }
        NSApp.activate(ignoringOtherApps: true)
        NSApp.presentationOptions = [.hideDock, .hideMenuBar, .disableProcessSwitching,
                                     .disableForceQuit, .disableSessionTermination, .disableHideApplication]
        focus()
    }

    func dismiss() {
        if !windows.isEmpty { NSApp.presentationOptions = [] }
        windows.forEach { $0.orderOut(nil) }
        windows = []
        field = nil
        status = nil
        failures = 0
    }

    private func focus() {
        if let f = field, let w = windows.first(where: { $0.contentView?.subviews.contains(f) == true }) {
            w.makeFirstResponder(f)
        }
    }

    private func setStatus(_ text: String, alert: Bool) {
        statusText = text
        status?.stringValue = text
        status?.textColor = alert ? NSColor(calibratedRed: 1, green: 0.32, blue: 0.3, alpha: 1)
                                  : NSColor(calibratedWhite: 0.55, alpha: 1)
    }

    /// Checks a password; returns true and closes the screen if it's right.
    @discardableResult
    func attempt(_ password: String) -> Bool {
        guard !password.isEmpty else { return false }
        let wait = blockedUntil.timeIntervalSinceNow
        if wait > 0 {
            setStatus("Too many tries. Wait \(Int(wait.rounded(.up))) s.", alert: true)
            return false
        }
        if PasswordStore.check(password) {
            EventLog.add("Panic screen unlocked")
            Bridge.emit(["type": "panicEnd"])
            dismiss()
            onUnlock()
            return true
        }
        failures += 1
        EventLog.add("Panic screen: wrong password")
        if failures >= 5 {
            failures = 0
            blockedUntil = Date().addingTimeInterval(30)
            setStatus("Too many tries. Wait 30 s.", alert: true)
        } else {
            setStatus(hacker ? "ACCESS DENIED" : "Wrong password", alert: true)
        }
        return false
    }

    // Pressing Return in the password box.
    func controlTextDidEndEditing(_ obj: Notification) {
        guard let f = field else { return }
        let entered = f.stringValue
        f.stringValue = ""
        attempt(entered)
        DispatchQueue.main.async { self.focus() }
    }

    private func label(_ text: String, size: CGFloat, weight: NSFont.Weight, color: NSColor, y: CGFloat, width: CGFloat) -> NSTextField {
        let l = NSTextField(labelWithString: text)
        l.font = hacker ? .monospacedSystemFont(ofSize: size, weight: weight) : .systemFont(ofSize: size, weight: weight)
        l.textColor = color
        l.alignment = .center
        l.frame = NSRect(x: 0, y: y, width: width, height: size + 14)
        return l
    }

    private func promptView(size: CGSize) -> NSView {
        let v = NSView(frame: NSRect(origin: .zero, size: size))
        let mid = size.height / 2
        let green = NSColor(calibratedRed: 0.3, green: 1, blue: 0.53, alpha: 1)
        let fg = hacker ? green : NSColor(calibratedWhite: 0.95, alpha: 1)
        let dim = hacker ? NSColor(calibratedRed: 0.12, green: 0.65, blue: 0.31, alpha: 1) : NSColor(calibratedWhite: 0.55, alpha: 1)
        v.addSubview(label(hacker ? "[ ACCESS RESTRICTED ]" : "🔒", size: hacker ? 30 : 54, weight: .bold, color: fg, y: mid + 70, width: size.width))
        v.addSubview(label(hacker ? "> ENTER PASSWORD:" : "Enter password", size: 24, weight: .semibold, color: fg, y: mid + 20, width: size.width))
        let f = NSSecureTextField(frame: NSRect(x: (size.width - 280) / 2, y: mid - 26, width: 280, height: 32))
        f.font = hacker ? .monospacedSystemFont(ofSize: 18, weight: .regular) : .systemFont(ofSize: 18, weight: .regular)
        f.alignment = .center
        f.placeholderString = hacker ? "********" : "Password"
        if hacker {
            f.textColor = green
            f.backgroundColor = .black
            f.isBordered = true
        }
        f.delegate = self
        v.addSubview(f)
        field = f
        let st = label("", size: 14, weight: .regular, color: dim, y: mid - 64, width: size.width)
        v.addSubview(st)
        status = st
        v.addSubview(label(hacker ? "faceaway // session locked" : "Type your FaceAway password and press Return",
                           size: 12, weight: .regular, color: dim, y: mid - 100, width: size.width))
        return v
    }
}

/// A round PANIC button that floats above every window. Drag it anywhere; click it to
/// cover the screen with the password screen.
final class PanicButton {
    private final class ButtonView: NSView {
        var onClick: () -> Void = {}
        private var last = NSPoint.zero
        private var dragged = false
        override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
        override func mouseDown(with event: NSEvent) { last = NSEvent.mouseLocation; dragged = false }
        override func mouseDragged(with event: NSEvent) {
            guard let w = window else { return }
            let p = NSEvent.mouseLocation
            let dx = p.x - last.x, dy = p.y - last.y
            if abs(dx) + abs(dy) > 0 { dragged = true }
            w.setFrameOrigin(NSPoint(x: w.frame.origin.x + dx, y: w.frame.origin.y + dy))
            last = p
        }
        override func mouseUp(with event: NSEvent) { if !dragged { onClick() } }
    }

    private var window: NSWindow?
    private(set) var view: NSView?
    let size: CGFloat = 76

    func show(hacker: Bool, onClick: @escaping () -> Void) {
        guard window == nil else { return }
        let screen = NSScreen.main?.frame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let frame = NSRect(x: screen.maxX - size - 28, y: screen.minY + 90, width: size, height: size)
        let w = NSWindow(contentRect: frame, styleMask: .borderless, backing: .buffered, defer: false)
        w.level = .floating
        w.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        w.isOpaque = false
        w.hasShadow = true
        w.backgroundColor = .clear
        w.isReleasedWhenClosed = false
        let v = ButtonView(frame: NSRect(x: 0, y: 0, width: size, height: size))
        v.onClick = onClick
        v.wantsLayer = true
        if let l = v.layer {
            l.cornerRadius = size / 2
            l.backgroundColor = hacker ? NSColor.black.cgColor : NSColor(calibratedRed: 0.9, green: 0.28, blue: 0.3, alpha: 1).cgColor
            l.borderWidth = hacker ? 2 : 3
            l.borderColor = hacker ? NSColor(calibratedRed: 1, green: 0.3, blue: 0.3, alpha: 1).cgColor
                                   : NSColor(calibratedWhite: 1, alpha: 0.85).cgColor
            let t = CATextLayer()
            t.string = "PANIC"
            t.font = hacker ? NSFont.monospacedSystemFont(ofSize: 15, weight: .bold) : NSFont.systemFont(ofSize: 15, weight: .bold)
            t.fontSize = 15
            t.foregroundColor = hacker ? NSColor(calibratedRed: 1, green: 0.3, blue: 0.3, alpha: 1).cgColor : NSColor.white.cgColor
            t.alignmentMode = .center
            t.contentsScale = w.backingScaleFactor
            t.frame = CGRect(x: 0, y: size / 2 - 10, width: size, height: 20)
            l.addSublayer(t)
        }
        w.contentView = v
        w.setFrame(frame, display: true)
        w.orderFrontRegardless()
        window = w
        view = v
    }
}

// MARK: - Home screen

struct AppEntry: Codable {
    let name: String
    let path: String
    let icon: String   // a data: URL with a 64×64 PNG
}

/// Your home screen settings, saved to home.json. The ⚙️ panel on the home screen edits them.
struct HomeConfig: Codable {
    var name: String
    var theme: String
    var apps: [String]
    var notes: String
    var widgets: [String: Bool]

    static let themes = ["clean", "midnight", "sunset", "hacker", "glass"]
    static let url = FaceStore.folder.appendingPathComponent("home.json")

    static func defaults(apps: [AppEntry]) -> HomeConfig {
        let favorites = ["Safari", "Google Chrome", "Messages", "Music", "Notes", "Calendar", "Photos", "FaceTime",
                         "Terminal", "System Settings"]
        let chosen = favorites.compactMap { f in apps.first { $0.name == f }?.path }
        let first = NSFullUserName().split(separator: " ").first.map(String.init) ?? ""
        return HomeConfig(name: first, theme: "clean", apps: chosen, notes: "",
                          widgets: ["apps": true, "stats": true, "notes": true, "quote": true, "panic": true])
    }

    static func load(apps: [AppEntry]) -> HomeConfig {
        guard let data = try? Data(contentsOf: url), var c = try? JSONDecoder().decode(HomeConfig.self, from: data) else {
            return defaults(apps: apps)
        }
        if !themes.contains(c.theme) { c.theme = "clean" }
        return c
    }

    func save() {
        try? FileManager.default.createDirectory(at: FaceStore.folder, withIntermediateDirectories: true)
        try? JSONEncoder().encode(self).write(to: HomeConfig.url, options: .atomic)
    }
}

/// Every app in /Applications (and the system and user app folders), with its icon.
func installedApps() -> [AppEntry] {
    let folders = ["/Applications", "/System/Applications", "/System/Applications/Utilities",
                   NSHomeDirectory() + "/Applications"]
    var seen = Set<String>()
    var apps: [AppEntry] = []
    for folder in folders {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: folder)) ?? []
        for file in names where file.hasSuffix(".app") {
            let name = String(file.dropLast(4))
            guard seen.insert(name).inserted else { continue }
            let path = folder + "/" + file
            apps.append(AppEntry(name: name, path: path, icon: appIconDataURL(path)))
        }
    }
    return apps.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
}

func appIconDataURL(_ path: String) -> String {
    let icon = NSWorkspace.shared.icon(forFile: path)
    guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 64, pixelsHigh: 64, bitsPerSample: 8,
                                     samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                                     bytesPerRow: 0, bitsPerPixel: 0) else { return "" }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    icon.draw(in: NSRect(x: 0, y: 0, width: 64, height: 64))
    NSGraphicsContext.restoreGraphicsState()
    guard let png = rep.representation(using: .png, properties: [:]) else { return "" }
    return "data:image/png;base64," + png.base64EncodedString()
}

struct MacStats: Codable {
    var battery: Int?
    var charging = false
    var diskFree: Int?
    var diskTotal: Int?
    var uptime: Int
    var load: Double?

    static func now() -> MacStats {
        var s = MacStats(uptime: Int(ProcessInfo.processInfo.systemUptime))
        if let out = HackerMac.run("/usr/bin/pmset", ["-g", "batt"]) {
            s.battery = MacStats.percent(in: out)
            s.charging = out.contains("charging") && !out.contains("discharging")
        }
        if let a = try? FileManager.default.attributesOfFileSystem(forPath: "/") {
            if let free = (a[.systemFreeSize] as? NSNumber)?.int64Value { s.diskFree = Int(free / 1_000_000_000) }
            if let total = (a[.systemSize] as? NSNumber)?.int64Value { s.diskTotal = Int(total / 1_000_000_000) }
        }
        var loads = [Double](repeating: 0, count: 3)
        if getloadavg(&loads, 3) > 0 { s.load = loads[0] }
        return s
    }

    /// The first "NN%" in pmset's output.
    static func percent(in text: String) -> Int? {
        guard let r = text.range(of: #"\d{1,3}%"#, options: .regularExpression) else { return nil }
        return Int(text[r].dropLast())
    }
}

/// A file found by the home screen's search bar.
struct FileHit: Codable, Equatable {
    let path: String
    let name: String
    let folder: String
}

/// Turns Spotlight's list of paths into search results, skipping hidden and system clutter.
func parseSpotlight(_ output: String, home: String, limit: Int = 12) -> [FileHit] {
    output.split(separator: "\n").map(String.init)
        .filter { !$0.contains("/Library/") && !$0.contains("/.") && !$0.hasPrefix("/System/") && !$0.hasPrefix("/private/") }
        .prefix(limit)
        .map { path in
            let url = URL(fileURLWithPath: path)
            var folder = url.deletingLastPathComponent().path
            if folder.hasPrefix(home) { folder = "~" + folder.dropFirst(home.count) }
            return FileHit(path: path, name: url.lastPathComponent, folder: folder)
        }
}

/// Searches your Mac's files by name with Spotlight (mdfind).
func spotlightSearch(_ query: String) -> [FileHit] {
    guard query.count >= 2, let out = HackerMac.run("/usr/bin/mdfind", ["-name", query]) else { return [] }
    return parseSpotlight(out, home: NSHomeDirectory())
}

struct ScreenInsets: Codable { var top: Double = 0; var bottom: Double = 0 }

func homePageHTML(config: HomeConfig, apps: [AppEntry], stats: MacStats, insets: ScreenInsets = ScreenInsets()) -> String {
    struct Payload: Codable { let config: HomeConfig; let apps: [AppEntry]; let stats: MacStats; let insets: ScreenInsets }
    let payload = Payload(config: config, apps: apps, stats: stats, insets: insets)
    let data = (try? JSONEncoder().encode(payload)) ?? Data("{}".utf8)
    let json = String(decoding: data, as: UTF8.self).replacingOccurrences(of: "</", with: "<\\/")
    return homeTemplate.replacingOccurrences(of: "__FACEAWAY_DATA__", with: json)
}

/// Your home screen: a window on the desktop, behind your other windows.
final class HomeScreen: NSObject, WKScriptMessageHandler {
    private final class KeyWindow: NSWindow {
        override var canBecomeKey: Bool { true }   // so you can type in Notes
    }

    private(set) var config: HomeConfig
    let apps: [AppEntry]
    var onPanic: () -> Void = {}
    private var windows: [NSWindow] = []
    private var webViews: [WKWebView] = []
    private var timer: Timer?
    private var lastFiles = Set<String>()        // files the search bar just showed
    var searcher: (String) -> [FileHit] = spotlightSearch

    init(theme: String?) {
        apps = installedApps()
        var c = HomeConfig.load(apps: apps)
        if let t = theme, HomeConfig.themes.contains(t) { c.theme = t; c.save() }
        config = c
    }

    var isShowing: Bool { !windows.isEmpty }

    /// Room to leave for the menu bar (top) and the Dock (bottom).
    private func insets(_ screen: NSScreen) -> ScreenInsets {
        let f = screen.frame, v = screen.visibleFrame
        return ScreenInsets(top: Double(f.maxY - v.maxY), bottom: Double(v.minY - f.minY))
    }

    /// Switches the theme and redraws the home screen.
    func setTheme(_ theme: String) {
        guard HomeConfig.themes.contains(theme) else { return }
        config.theme = theme
        config.save()
        Bridge.emit(["type": "theme", "name": theme])
        if isShowing { hide(); show() }
    }

    func hide() {
        timer?.invalidate()
        timer = nil
        windows.forEach { $0.orderOut(nil) }
        windows = []
        webViews = []
    }

    func show() {
        guard windows.isEmpty else { return }
        for screen in NSScreen.screens {
            let w = KeyWindow(contentRect: screen.frame, styleMask: .borderless, backing: .buffered, defer: false)
            // Above the desktop icons (which would otherwise catch every click), below normal windows.
            w.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopIconWindow)) + 1)
            w.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
            w.isOpaque = true
            w.hasShadow = false
            w.isReleasedWhenClosed = false
            let cfg = WKWebViewConfiguration()
            cfg.userContentController.add(self, name: "faceaway")
            let web = WKWebView(frame: NSRect(origin: .zero, size: screen.frame.size), configuration: cfg)
            web.loadHTMLString(homePageHTML(config: config, apps: apps, stats: MacStats.now(), insets: insets(screen)), baseURL: nil)
            w.contentView = web
            w.setFrame(screen.frame, display: true)
            w.orderFrontRegardless()
            windows.append(w)
            webViews.append(web)
        }
        timer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in self?.pushStats() }
    }

    private func pushStats() {
        guard let data = try? JSONEncoder().encode(MacStats.now()) else { return }
        let js = "window.faceawayStats && faceawayStats(" + String(decoding: data, as: UTF8.self) + ")"
        webViews.forEach { $0.evaluateJavaScript(js, completionHandler: nil) }
    }

    private func pushSearch(id: Int, results: [FileHit]) {
        struct Reply: Codable { let id: Int; let results: [FileHit] }
        guard let data = try? JSONEncoder().encode(Reply(id: id, results: results)) else { return }
        let js = "window.faceawaySearch && faceawaySearch(" + String(decoding: data, as: UTF8.self) + ")"
        webViews.forEach { $0.evaluateJavaScript(js, completionHandler: nil) }
    }

    /// Messages from the page: open an app, save settings, or panic.
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        handle(type: type, body: body)
    }

    func handle(type: String, body: [String: Any]) {
        switch type {
        case "open":
            // Only apps from the list FaceAway showed you.
            if let path = body["path"] as? String, apps.contains(where: { $0.path == path }) {
                NSWorkspace.shared.open(URL(fileURLWithPath: path))
            }
        case "save":
            if let text = body["config"] as? String,
               var c = try? JSONDecoder().decode(HomeConfig.self, from: Data(text.utf8)) {
                if !HomeConfig.themes.contains(c.theme) { c.theme = "clean" }
                c.apps = c.apps.filter { p in apps.contains { $0.path == p } }
                config = c
                c.save()
            }
        case "panic":
            onPanic()
        case "search":
            guard let q = body["q"] as? String else { return }
            let id = (body["id"] as? Int) ?? (body["id"] as? Double).map { Int($0) } ?? 0
            let search = searcher
            DispatchQueue.global(qos: .userInitiated).async {
                let results = search(q)
                DispatchQueue.main.async {
                    self.lastFiles = Set(results.map(\.path))
                    self.pushSearch(id: id, results: results)
                }
            }
        case "openFile":
            // Only files the search bar just showed you.
            if let path = body["path"] as? String, lastFiles.contains(path) {
                NSWorkspace.shared.open(URL(fileURLWithPath: path))
            }
        case "web":
            if let q = body["q"] as? String, !q.isEmpty {
                var url = URLComponents(string: "https://www.google.com/search")!
                url.queryItems = [URLQueryItem(name: "q", value: q)]
                if let u = url.url { NSWorkspace.shared.open(u) }
            }
        default:
            break
        }
    }
}

// MARK: - Hacker Mac

/// Makes the whole Mac look like a hacker's computer, and puts everything back after.
enum HackerMac {
    static let backupURL = FaceStore.folder.appendingPathComponent("hacker-mac-backup.json")
    static let blackWallpaper = "/System/Library/Desktop Pictures/Solid Colors/Black.png"

    struct Backup: Codable {
        var darkMode: Bool?
        var accent: String?
        var highlight: String?
        var terminalDefault: String?
        var terminalStartup: String?
        var wallpaper: String?
    }

    /// Runs a command and returns what it printed, or nil if it failed.
    @discardableResult
    static func run(_ path: String, _ args: [String]) -> String? {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: path)
        p.arguments = args
        let out = Pipe()
        p.standardOutput = out
        p.standardError = Pipe()
        do { try p.run() } catch { return nil }
        p.waitUntilExit()
        guard p.terminationStatus == 0 else { return nil }
        return String(decoding: out.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func readDefault(_ domain: String, _ key: String) -> String? { run("/usr/bin/defaults", ["read", domain, key]) }

    static func writeDefault(_ domain: String, _ key: String, _ value: String?) {
        if let v = value { run("/usr/bin/defaults", ["write", domain, key, "-string", v]) }
        else { run("/usr/bin/defaults", ["delete", domain, key]) }
    }

    static func apply() {
        if FileManager.default.fileExists(atPath: backupURL.path) {
            say("Hacker mode is already on. Turn it off with: ./faceaway --hacker-mac off")
            return
        }
        let b = Backup(
            darkMode: runAppleScript("tell application \"System Events\" to tell appearance preferences to get dark mode")?.booleanValue,
            accent: readDefault("-g", "AppleAccentColor"),
            highlight: readDefault("-g", "AppleHighlightColor"),
            terminalDefault: readDefault("com.apple.Terminal", "Default Window Settings"),
            terminalStartup: readDefault("com.apple.Terminal", "Startup Window Settings"),
            wallpaper: runAppleScript("tell application \"System Events\" to get picture of desktop 1")?.stringValue)
        try? FileManager.default.createDirectory(at: FaceStore.folder, withIntermediateDirectories: true)
        try? JSONEncoder().encode(b).write(to: backupURL, options: .atomic)

        runAppleScript("tell application \"System Events\" to tell appearance preferences to set dark mode to true")
        run("/usr/bin/defaults", ["write", "-g", "AppleAccentColor", "-int", "3"])   // green
        writeDefault("-g", "AppleHighlightColor", "0.752941 0.964706 0.678431 Green")
        writeDefault("com.apple.Terminal", "Default Window Settings", "Homebrew")       // green on black
        writeDefault("com.apple.Terminal", "Startup Window Settings", "Homebrew")
        if FileManager.default.fileExists(atPath: blackWallpaper) { setWallpaper(blackWallpaper) }
        say("Hacker mode on: dark mode, green accent and highlight, black wallpaper, green Terminal.", .good)
        say("Some apps show the green accent after you quit and reopen them.")
        say("Also try: ./faceaway --home-only --theme hacker --panic-button")
    }

    static func restore() {
        guard let data = try? Data(contentsOf: backupURL), let b = try? JSONDecoder().decode(Backup.self, from: data) else {
            say("Hacker mode isn't on.")
            return
        }
        if let dark = b.darkMode {
            runAppleScript("tell application \"System Events\" to tell appearance preferences to set dark mode to \(dark)")
        }
        if let a = b.accent { run("/usr/bin/defaults", ["write", "-g", "AppleAccentColor", "-int", a]) }
        else { run("/usr/bin/defaults", ["delete", "-g", "AppleAccentColor"]) }
        writeDefault("-g", "AppleHighlightColor", b.highlight)
        writeDefault("com.apple.Terminal", "Default Window Settings", b.terminalDefault)
        writeDefault("com.apple.Terminal", "Startup Window Settings", b.terminalStartup)
        if let w = b.wallpaper, !w.isEmpty { setWallpaper(w) }
        try? FileManager.default.removeItem(at: backupURL)
        say("Hacker mode off: everything is back the way it was.", .good)
    }

    static func setWallpaper(_ path: String) {
        runAppleScript("tell application \"System Events\" to tell every desktop to set picture to POSIX file \(asQuoted(path))")
    }
}

let homeTemplate = ##"""
<!doctype html>
<html><head><meta charset="utf-8">
<style>
  :root { --r: 18px; --top: 0px; --bottom: 0px; }
  body[data-theme="clean"]    { --bg: linear-gradient(135deg,#dfe9f5 0%,#f6efe7 100%); --card: rgba(255,255,255,.62); --line: rgba(20,30,50,.08);
                                --fg: #17202c; --muted: #5d6b7c; --accent: #2f6fdb; --font: -apple-system, "Helvetica Neue", sans-serif; --mono: ui-monospace, Menlo, monospace; }
  body[data-theme="midnight"] { --bg: radial-gradient(1200px 700px at 20% 10%,#1d2b4a 0%,#0b1020 60%); --card: rgba(255,255,255,.06); --line: rgba(255,255,255,.08);
                                --fg: #e8edf6; --muted: #8e9ab0; --accent: #7aa2ff; --font: -apple-system, "Helvetica Neue", sans-serif; --mono: ui-monospace, Menlo, monospace; }
  body[data-theme="sunset"]   { --bg: linear-gradient(160deg,#ff9a6b 0%,#c3477a 55%,#3b1f5a 100%); --card: rgba(255,255,255,.16); --line: rgba(255,255,255,.18);
                                --fg: #fff7f2; --muted: #ffd9c9; --accent: #fff0a8; --font: -apple-system, "Helvetica Neue", sans-serif; --mono: ui-monospace, Menlo, monospace; }
  body[data-theme="hacker"]   { --bg: #020602; --card: rgba(0,20,4,.72); --line: rgba(0,255,90,.22);
                                --fg: #4dff88; --muted: #1fa64f; --accent: #9dffb9; --font: ui-monospace, Menlo, "Courier New", monospace; --mono: ui-monospace, Menlo, monospace; }
  body[data-theme="glass"]    { --bg: #0b1020; --card: transparent; --line: rgba(255,255,255,.22);
                                --fg: #ffffff; --muted: rgba(255,255,255,.78); --accent: #a8d8ff; --font: -apple-system, "Helvetica Neue", sans-serif; --mono: ui-monospace, Menlo, monospace; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; overflow: hidden; }
  body { background: var(--bg); color: var(--fg); font: 15px/1.45 var(--font); cursor: default; user-select: none; -webkit-font-smoothing: antialiased; }
  #matrix { position: fixed; inset: 0; display: none; opacity: .55; }
  /* Liquid Glass: a WebGL canvas draws the wallpaper and refracts it through every card. */
  #glass { position: fixed; inset: 0; width: 100%; height: 100%; display: none; }
  body[data-theme="glass"] #glass { display: block; }
  body[data-theme="glass"] .card, body[data-theme="glass"] .gear, body[data-theme="glass"] .drawer,
  body[data-theme="glass"] .search input, body[data-theme="glass"] .results {
    background: transparent; border-color: transparent; backdrop-filter: none; -webkit-backdrop-filter: none; }
  body[data-theme="glass"] { text-shadow: 0 1px 3px rgba(0,0,0,.45), 0 0 14px rgba(0,0,0,.35); }
  /* The clock itself is drawn as liquid glass by the WebGL canvas; the text only keeps its place. */
  body[data-theme="glass"]:not(.noglass) .time { color: transparent; text-shadow: none; font-weight: 700; }
  body[data-theme="glass"]:not(.noglass) .results { background: rgba(12,16,40,.55); }
  body[data-theme="glass"].noglass .card, body[data-theme="glass"].noglass .gear, body[data-theme="glass"].noglass .drawer,
  body[data-theme="glass"].noglass .search input, body[data-theme="glass"].noglass .results {
    background: rgba(255,255,255,.14); border-color: rgba(255,255,255,.3); backdrop-filter: blur(26px) saturate(1.7);
    -webkit-backdrop-filter: blur(26px) saturate(1.7); }
  body[data-theme="glass"].noglass { background: linear-gradient(135deg,#3a7bd5,#8e44ad 50%,#f39c6b); }
  body[data-theme="hacker"] #matrix { display: block; }
  body[data-theme="hacker"]::after { content: ""; position: fixed; inset: 0; pointer-events: none;
    background: repeating-linear-gradient(0deg, rgba(0,0,0,.18) 0 1px, transparent 1px 3px); }
  /* Search everything */
  .search { position: fixed; top: calc(var(--top) + 18px); left: 50%; transform: translateX(-50%); width: 560px; z-index: 5; }
  .search input { width: 100%; padding: 12px 18px 12px 44px; border-radius: 16px; border: 1px solid var(--line); background: var(--card);
                  color: var(--fg); font: 16px var(--font); outline: 0; user-select: text; backdrop-filter: blur(22px); -webkit-backdrop-filter: blur(22px); }
  .search input::placeholder { color: var(--muted); }
  .search .icon { position: absolute; left: 16px; top: 11px; color: var(--muted); font-size: 17px; pointer-events: none; }
  body[data-theme="hacker"] .search input { border-radius: 3px; }
  body[data-theme="hacker"] .search input::placeholder { color: var(--muted); }
  .results { margin-top: 8px; border-radius: 16px; border: 1px solid var(--line); background: var(--card); padding: 6px;
             backdrop-filter: blur(30px); -webkit-backdrop-filter: blur(30px); max-height: 460px; overflow-y: auto; }
  body[data-theme="clean"] .results { background: rgba(250,251,253,.96); }
  body[data-theme="hacker"] .results { background: rgba(0,12,2,.96); border-radius: 3px; }
  body[data-theme="midnight"] .results { background: rgba(14,20,38,.96); }
  body[data-theme="sunset"] .results { background: rgba(90,40,90,.92); }
  .results h4 { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); padding: 8px 10px 4px; font-weight: 600; }
  .hit { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; cursor: pointer; }
  .hit.sel, .hit:hover { background: var(--line); }
  .hit img, .hit .glyph { width: 24px; height: 24px; flex: none; }
  .hit .glyph { display: grid; place-items: center; font-size: 16px; }
  .hit .t { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hit small { display: block; color: var(--muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .page { position: relative; height: 100%; display: grid; grid-template-columns: 1fr 360px; grid-template-rows: auto 1fr; gap: 22px; padding: calc(var(--top) + 80px) 64px calc(var(--bottom) + 40px); }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r); padding: 20px 22px; backdrop-filter: blur(22px); -webkit-backdrop-filter: blur(22px); }
  body[data-theme="hacker"] .card { border-radius: 4px; box-shadow: 0 0 18px rgba(0,255,90,.08) inset; }
  .label { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); margin-bottom: 12px; display: flex; justify-content: space-between; }
  .hero { grid-column: 1 / 2; display: flex; flex-direction: column; gap: 4px; padding-top: 6px; }
  .time { font-size: 112px; font-weight: 200; letter-spacing: -.04em; line-height: 1; font-variant-numeric: tabular-nums; }
  body[data-theme="hacker"] .time { font-weight: 400; letter-spacing: 0; text-shadow: 0 0 18px rgba(0,255,90,.55); }
  .date { font-size: 22px; color: var(--muted); }
  .hello { font-size: 28px; font-weight: 600; margin-top: 10px; }
  body[data-theme="hacker"] .hello::before { content: "root@"; color: var(--muted); font-weight: 400; }
  .side { grid-column: 2; grid-row: 1 / 3; display: flex; flex-direction: column; gap: 18px; min-height: 0; }
  .main { grid-column: 1; grid-row: 2; display: flex; flex-direction: column; gap: 18px; min-height: 0; }
  .apps { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 10px 8px; }
  .app { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 4px; border-radius: 14px; cursor: pointer; text-align: center; }
  .app:hover { background: var(--line); }
  .app img { width: 56px; height: 56px; }
  .app span { font-size: 12px; max-width: 92px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  body[data-theme="hacker"] .apps { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 2px 16px; }
  body[data-theme="hacker"] .app { flex-direction: row; justify-content: flex-start; padding: 5px 8px; border-radius: 2px; gap: 10px; }
  body[data-theme="hacker"] .app img { width: 20px; height: 20px; filter: grayscale(1) brightness(1.4) sepia(1) hue-rotate(70deg) saturate(6); }
  body[data-theme="hacker"] .app span { font-size: 14px; max-width: none; }
  body[data-theme="hacker"] .app span::before { content: "> launch "; color: var(--muted); }
  .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .stat b { display: block; font-size: 24px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .stat small { color: var(--muted); font-size: 12px; }
  .bar { height: 5px; border-radius: 3px; background: var(--line); margin-top: 6px; overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--accent); }
  textarea { width: 100%; min-height: 120px; resize: none; border: 0; outline: 0; background: transparent; color: var(--fg); font: 14px/1.5 var(--font); user-select: text; }
  textarea::placeholder { color: var(--muted); }
  .quote { font-size: 17px; line-height: 1.5; }
  .quote small { display: block; margin-top: 8px; color: var(--muted); font-size: 13px; }
  .log { font: 12px/1.6 var(--mono); color: var(--muted); height: 150px; overflow: hidden; display: flex; flex-direction: column; justify-content: flex-end; }
  .log .hot { color: var(--fg); }
  .panic { width: 100%; padding: 14px; border: 0; border-radius: 14px; background: #e5484d; color: #fff; font: 700 15px var(--font); letter-spacing: .08em; cursor: pointer; }
  .panic:hover { filter: brightness(1.1); }
  body[data-theme="hacker"] .panic { border-radius: 3px; background: transparent; color: #ff4d4d; border: 1px solid #ff4d4d; text-shadow: 0 0 8px rgba(255,77,77,.6); }
  .gear { position: fixed; top: calc(var(--top) + 18px); right: 20px; z-index: 6; width: 38px; height: 38px; border-radius: 50%; border: 1px solid var(--line); background: var(--card);
          color: var(--fg); font-size: 18px; cursor: pointer; backdrop-filter: blur(18px); }
  [hidden] { display: none !important; }
  /* Settings drawer */
  .drawer { position: fixed; top: var(--top); right: 0; bottom: var(--bottom); width: 400px; z-index: 7; background: var(--card); border-left: 1px solid var(--line);
            backdrop-filter: blur(30px); -webkit-backdrop-filter: blur(30px); padding: 26px 24px; display: flex; flex-direction: column; gap: 18px; overflow-y: auto; }
  body[data-theme="clean"] .drawer { background: rgba(250,251,253,.94); }
  body[data-theme="hacker"] .drawer { background: rgba(0,12,2,.96); }
  .drawer h2 { font-size: 20px; }
  .drawer input[type=text] { width: 100%; padding: 9px 12px; border-radius: 10px; border: 1px solid var(--line); background: transparent; color: var(--fg); font: 14px var(--font); user-select: text; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { padding: 7px 14px; border-radius: 999px; border: 1px solid var(--line); cursor: pointer; font-size: 13px; }
  .chip.on { background: var(--accent); color: #fff; border-color: var(--accent); }
  body[data-theme="hacker"] .chip.on, body[data-theme="sunset"] .chip.on { color: #000; }
  .toggles label, .picker label { display: flex; align-items: center; gap: 10px; padding: 5px 0; font-size: 14px; cursor: pointer; }
  .picker { max-height: 300px; overflow-y: auto; border: 1px solid var(--line); border-radius: 12px; padding: 6px 12px; }
  .picker img { width: 20px; height: 20px; }
  .done { padding: 11px; border-radius: 12px; border: 0; background: var(--accent); color: #fff; font: 600 14px var(--font); cursor: pointer; }
  body[data-theme="hacker"] .done, body[data-theme="sunset"] .done { color: #000; }
</style></head>
<body data-theme="clean">
<canvas id="matrix"></canvas>
<canvas id="glass"></canvas>
<div class="search" id="searchBox">
  <span class="icon">&#9906;</span>
  <input type="text" id="q" placeholder="Search apps, files and the web" autocomplete="off" spellcheck="false">
  <div class="results" id="results" hidden></div>
</div>
<div class="page">
  <section class="hero">
    <div class="time" id="time">--:--</div>
    <div class="date" id="date"></div>
    <div class="hello" id="hello"></div>
  </section>
  <section class="main">
    <div class="card" id="w-apps"><div class="label"><span id="appsLabel">Apps</span></div><div class="apps" id="apps"></div></div>
    <div class="card" id="w-quote"><div class="label">Today</div><div class="quote" id="quote"></div></div>
  </section>
  <aside class="side">
    <div class="card" id="w-stats"><div class="label">This Mac</div><div class="stats" id="stats"></div></div>
    <div class="card" id="w-log" hidden><div class="label"><span>System log</span><span>live</span></div><div class="log" id="log"></div></div>
    <div class="card" id="w-notes"><div class="label">Notes</div><textarea id="notes" placeholder="Write anything. It saves by itself."></textarea></div>
    <div class="card" id="w-panic"><button class="panic" id="panic">PANIC</button></div>
  </aside>
</div>
<button class="gear" id="gear" title="Customize">&#9881;</button>
<div class="drawer" id="drawer" hidden>
  <h2>Customize</h2>
  <div><div class="label">Your name</div><input type="text" id="name" maxlength="40"></div>
  <div><div class="label">Theme</div><div class="chips" id="themes"></div></div>
  <div><div class="label">Widgets</div><div class="toggles" id="toggles"></div></div>
  <div><div class="label"><span>Apps on your home screen</span><span id="appCount"></span></div>
    <input type="text" id="search" placeholder="Search apps">
    <div class="picker" id="picker" style="margin-top:8px"></div></div>
  <button class="done" id="done">Done</button>
</div>
<script>
var FA = __FACEAWAY_DATA__;
var cfg = FA.config;
// Leave room for the macOS menu bar and Dock.
if (FA.insets) {
  document.documentElement.style.setProperty('--top', (FA.insets.top || 0) + 'px');
  document.documentElement.style.setProperty('--bottom', (FA.insets.bottom || 0) + 'px');
}
var THEMES = [['clean','Clean'],['midnight','Midnight'],['sunset','Sunset'],['hacker','Hacker'],['glass','Liquid Glass']];
var WIDGETS = [['apps','Apps'],['stats','Mac stats'],['notes','Notes'],['quote','Quote'],['panic','Panic button']];
var QUOTES = [['Small steps every day add up to big things.','Anonymous'],['Stay curious.','Anonymous'],
  ['The best way to predict the future is to create it.','Peter Drucker'],['Done is better than perfect.','Sheryl Sandberg'],
  ['First, solve the problem. Then, write the code.','John Johnson'],['Simplicity is the soul of efficiency.','Austin Freeman']];
function post(msg) { try { window.webkit.messageHandlers.faceaway.postMessage(msg); } catch (e) {} }
function save() { post({ type: 'save', config: JSON.stringify(cfg) }); }
function el(id) { return document.getElementById(id); }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function appByPath(p) { for (var i = 0; i < FA.apps.length; i++) if (FA.apps[i].path === p) return FA.apps[i]; return null; }

function tickClock() {
  var now = new Date(), h = now.getHours();
  var hh = String(h).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0');
  el('time').textContent = cfg.theme === 'hacker' ? hh + ':' + mm + ':' + String(now.getSeconds()).padStart(2, '0') : hh + ':' + mm;
  el('date').textContent = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  var greet = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  el('hello').textContent = cfg.theme === 'hacker' ? (cfg.name || 'user').toLowerCase().replace(/\s+/g, '') + ' — access granted' : greet + ', ' + (cfg.name || 'there');
}

function renderApps() {
  var html = cfg.apps.map(appByPath).filter(Boolean).map(function (a) {
    return '<div class="app" data-path="' + esc(a.path) + '"><img src="' + a.icon + '" alt=""><span>' + esc(a.name) + '</span></div>';
  }).join('');
  el('apps').innerHTML = html || '<span style="color:var(--muted)">No apps yet. Click &#9881; to add some.</span>';
  el('appsLabel').textContent = cfg.theme === 'hacker' ? 'Programs' : 'Apps';
}
el('apps').addEventListener('click', function (e) {
  var t = e.target.closest('.app'); if (t) post({ type: 'open', path: t.getAttribute('data-path') });
});

function renderStats(s) {
  s = s || {};
  function stat(label, value, pct) {
    return '<div class="stat"><b>' + value + '</b><small>' + label + '</small>' + (pct == null ? '' : '<div class="bar"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></div>') + '</div>';
  }
  var up = s.uptime || 0, d = Math.floor(up / 86400), h = Math.floor(up % 86400 / 3600), m = Math.floor(up % 3600 / 60);
  el('stats').innerHTML =
    stat('Battery' + (s.charging ? ' · charging' : ''), s.battery == null ? '—' : s.battery + '%', s.battery) +
    stat('Disk free', s.diskFree == null ? '—' : s.diskFree + ' GB', s.diskFree == null ? null : 100 * s.diskFree / (s.diskTotal || 1)) +
    stat('Uptime', (d ? d + 'd ' : '') + h + 'h ' + m + 'm', null) +
    stat('Load', s.load == null ? '—' : s.load.toFixed(2), s.load == null ? null : Math.min(100, s.load * 12.5));
}
window.faceawayStats = renderStats;

function renderQuote() {
  var day = Math.floor(Date.now() / 86400000), q = QUOTES[day % QUOTES.length];
  el('quote').innerHTML = esc(q[0]) + '<small>— ' + esc(q[1]) + '</small>';
}

function applyLayout() {
  document.body.setAttribute('data-theme', cfg.theme);
  WIDGETS.forEach(function (w) { el('w-' + w[0]).hidden = !cfg.widgets[w[0]]; });
  el('w-log').hidden = cfg.theme !== 'hacker';
  el('panic').textContent = cfg.theme === 'hacker' ? '[ PANIC ]' : 'PANIC';
  el('q').placeholder = cfg.theme === 'hacker' ? '$ find --everywhere' : 'Search apps, files and the web';
  renderApps(); tickClock();
}

// Notes save themselves a moment after you stop typing.
var notesTimer;
el('notes').addEventListener('input', function () {
  cfg.notes = el('notes').value; clearTimeout(notesTimer); notesTimer = setTimeout(save, 600);
});
el('panic').addEventListener('click', function () { post({ type: 'panic' }); });

// Settings drawer
function renderDrawer() {
  el('name').value = cfg.name || '';
  el('themes').innerHTML = THEMES.map(function (t) {
    return '<span class="chip' + (cfg.theme === t[0] ? ' on' : '') + '" data-theme-id="' + t[0] + '">' + t[1] + '</span>';
  }).join('');
  el('toggles').innerHTML = WIDGETS.map(function (w) {
    return '<label><input type="checkbox" data-widget="' + w[0] + '"' + (cfg.widgets[w[0]] ? ' checked' : '') + '> ' + w[1] + '</label>';
  }).join('');
  renderPicker();
}
function renderPicker() {
  var q = el('search').value.toLowerCase();
  el('picker').innerHTML = FA.apps.filter(function (a) { return a.name.toLowerCase().indexOf(q) >= 0; }).map(function (a) {
    return '<label><input type="checkbox" data-app="' + esc(a.path) + '"' + (cfg.apps.indexOf(a.path) >= 0 ? ' checked' : '') + '><img src="' + a.icon + '" alt="">' + esc(a.name) + '</label>';
  }).join('');
  el('appCount').textContent = cfg.apps.length + ' chosen';
}
el('gear').addEventListener('click', function () { var d = el('drawer'); d.hidden = !d.hidden; if (!d.hidden) renderDrawer(); });
el('done').addEventListener('click', function () { el('drawer').hidden = true; });
el('name').addEventListener('input', function () { cfg.name = el('name').value.trim(); tickClock(); save(); });
el('search').addEventListener('input', renderPicker);
el('themes').addEventListener('click', function (e) {
  var t = e.target.closest('[data-theme-id]'); if (!t) return;
  cfg.theme = t.getAttribute('data-theme-id'); applyLayout(); renderDrawer(); save();
});
el('toggles').addEventListener('change', function (e) {
  var w = e.target.getAttribute('data-widget'); if (!w) return;
  cfg.widgets[w] = e.target.checked; applyLayout(); save();
});
el('picker').addEventListener('change', function (e) {
  var p = e.target.getAttribute('data-app'); if (!p) return;
  var i = cfg.apps.indexOf(p);
  if (e.target.checked && i < 0) cfg.apps.push(p); else if (!e.target.checked && i >= 0) cfg.apps.splice(i, 1);
  renderApps(); el('appCount').textContent = cfg.apps.length + ' chosen'; save();
});

// Hacker theme: Matrix rain and a scrolling fake system log.
var canvas = el('matrix'), ctx = canvas.getContext('2d'), drops = [];
function resize() { canvas.width = innerWidth; canvas.height = innerHeight; drops = []; for (var i = 0; i < Math.ceil(innerWidth / 16); i++) drops.push(Math.random() * -60); }
addEventListener('resize', resize); resize();
var GLYPHS = 'アイウエオカキクケコサシスセソタチツテト0123456789ABCDEF<>/{}[]#$%&*';
setInterval(function () {
  if (cfg.theme !== 'hacker') return;
  ctx.fillStyle = 'rgba(2,6,2,0.12)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = '15px Menlo, monospace';
  for (var i = 0; i < drops.length; i++) {
    var y = drops[i] * 16;
    ctx.fillStyle = Math.random() < 0.06 ? '#c8ffd8' : '#1fd65f';
    ctx.fillText(GLYPHS[Math.floor(Math.random() * GLYPHS.length)], i * 16, y);
    if (y > canvas.height && Math.random() > 0.975) drops[i] = 0; else drops[i]++;
  }
}, 50);
var LOG = ['handshake 10.0.%d.%d ... ok','decrypting packet stream [%d kb]','firewall: %d threats blocked','tracing route hop %d ... %d ms',
  'faceaway: face lock armed','kernel: entropy pool %d%%','ssh session %d authenticated','compiling payload %d/%d ... done','scanning port %d ... closed'];
function r(n) { return Math.floor(Math.random() * n); }
setInterval(function () {
  if (cfg.theme !== 'hacker') return;
  var line = LOG[r(LOG.length)].replace(/%d/g, function () { return r(255); });
  var log = el('log'), div = document.createElement('div');
  var t = new Date(); div.textContent = '[' + t.toTimeString().slice(0, 8) + '] ' + line;
  if (Math.random() < 0.2) div.className = 'hot';
  log.appendChild(div); while (log.children.length > 9) log.removeChild(log.firstChild);
}, 700);

// ---- Search everything: apps (instant), files (Spotlight, via FaceAway), the web ----
var searchId = 0, hits = [], sel = 0, files = [], filesPending = false;
function renderResults() {
  var q = el('q').value.trim(), box = el('results');
  if (!q) { box.hidden = true; hits = []; return; }
  var lq = q.toLowerCase();
  var apps = FA.apps.filter(function (a) { return a.name.toLowerCase().indexOf(lq) >= 0; })
    .sort(function (a, b) { return a.name.toLowerCase().indexOf(lq) - b.name.toLowerCase().indexOf(lq); }).slice(0, 6);
  hits = apps.map(function (a) { return { kind: 'app', path: a.path, name: a.name, icon: a.icon }; })
    .concat(files.map(function (f) { return { kind: 'file', path: f.path, name: f.name, folder: f.folder, icon: f.icon }; }))
    .concat([{ kind: 'web', name: q }]);
  if (sel >= hits.length) sel = 0;
  var html = '', last = '';
  hits.forEach(function (h, i) {
    var section = h.kind === 'app' ? 'Apps' : h.kind === 'file' ? 'Files' : 'Web';
    if (section !== last) { html += '<h4>' + section + '</h4>'; last = section; }
    var icon = h.icon ? '<img src="' + h.icon + '" alt="">' : '<span class="glyph">' + (h.kind === 'web' ? '&#127760;' : '&#128196;') + '</span>';
    var text = h.kind === 'web' ? 'Search the web for &ldquo;' + esc(h.name) + '&rdquo;'
      : esc(h.name) + (h.folder ? '<small>' + esc(h.folder) + '</small>' : '');
    html += '<div class="hit' + (i === sel ? ' sel' : '') + '" data-i="' + i + '">' + icon + '<div class="t">' + text + '</div></div>';
    if (h.kind === 'app' && i === apps.length - 1 && filesPending && !files.length) html += '<h4>Files</h4><div class="hit"><span class="glyph">&#8230;</span><div class="t">Searching your Mac</div></div>';
  });
  box.innerHTML = html; box.hidden = false;
}
function activate(h) {
  if (!h) return;
  if (h.kind === 'app') post({ type: 'open', path: h.path });
  else if (h.kind === 'file') post({ type: 'openFile', path: h.path });
  else post({ type: 'web', q: h.name });
  el('q').value = ''; files = []; renderResults(); el('q').blur();
}
var searchTimer;
el('q').addEventListener('input', function () {
  var q = el('q').value.trim(); sel = 0; files = [];
  filesPending = q.length >= 2; renderResults();
  clearTimeout(searchTimer);
  if (filesPending) searchTimer = setTimeout(function () { post({ type: 'search', q: q, id: ++searchId }); }, 200);
});
window.faceawaySearch = function (res) {
  if (!res || res.id !== searchId) return;   // an older search finished late
  files = res.results || []; filesPending = false; renderResults();
};
el('q').addEventListener('keydown', function (e) {
  if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, hits.length - 1); renderResults(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); renderResults(); e.preventDefault(); }
  else if (e.key === 'Enter') { activate(hits[sel]); }
  else if (e.key === 'Escape') { el('q').value = ''; renderResults(); el('q').blur(); }
});
el('results').addEventListener('click', function (e) {
  var t = e.target.closest('.hit[data-i]'); if (t) activate(hits[+t.getAttribute('data-i')]);
});
document.addEventListener('keydown', function (e) {
  var typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
  if ((e.key === '/' && !typing) || (e.key === 'k' && (e.metaKey || e.ctrlKey))) { el('q').focus(); e.preventDefault(); }
});

// ---- Liquid Glass ----
// Based on the techniques in Liquid Glass Studio by Charles Yin (MIT License,
// github.com/iyinchao/liquid-glass-studio): Snell's-law edge refraction of a
// blurred background, chromatic dispersion, a fresnel rim and angled glare.
var glass = (function () {
  var c = el('glass'), gl = c.getContext('webgl', { antialias: false, premultipliedAlpha: false });
  if (!gl) { document.body.classList.add('noglass'); return null; }
  var MAX = 12;
  var vs = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  var fs = [
    'precision highp float;',
    'uniform vec2 res;uniform float time;uniform vec4 rects[' + MAX + '];uniform float radii[' + MAX + '];uniform float count;uniform vec3 lens;',
    'uniform sampler2D tmask;',
    'float sdBox(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}',
    'float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}',
    // The wallpaper: soft moving color blobs over a deep gradient, with faint diagonal lines so bending is visible.
    'vec3 bg(vec2 px){vec2 p=px/res.y;float t=time*.05;',
    ' vec3 col=mix(vec3(.05,.07,.18),vec3(.10,.04,.16),p.y);',
    ' vec2 c1=vec2(.35+.25*sin(t*1.3),.65+.2*cos(t*1.1));vec2 c2=vec2(1.2+.3*cos(t*.9),.35+.25*sin(t*1.7));',
    ' vec2 c3=vec2(.9+.4*sin(t*.7+2.),.85+.15*sin(t*1.9));vec2 c4=vec2(1.55+.2*sin(t*1.5+1.),.8+.2*cos(t*.8));',
    ' col+=vec3(.20,.55,1.00)*exp(-dot(p-c1,p-c1)*5.);col+=vec3(1.00,.35,.55)*exp(-dot(p-c2,p-c2)*4.);',
    ' col+=vec3(.55,.30,1.00)*exp(-dot(p-c3,p-c3)*6.);col+=vec3(1.00,.70,.30)*exp(-dot(p-c4,p-c4)*7.);',
    ' col+=.025*smoothstep(.3,1.,sin((p.x+p.y)*90.));return col;}',
    'vec3 blurred(vec2 px){return (bg(px)*2.+bg(px+vec2(9.,0.))+bg(px-vec2(9.,0.))+bg(px+vec2(0.,9.))+bg(px-vec2(0.,9.)))/6.;}',
    'float scene(vec2 p){float d=1e5;',
    ' for(int i=0;i<' + MAX + ';i++){if(float(i)>=count)break;vec4 r=rects[i];d=smin(d,sdBox(p-(r.xy+r.zw*.5),r.zw*.5,radii[i]),18.);}',
    ' if(lens.z>0.)d=smin(d,length(p-lens.xy)-lens.z,46.);return d;}',
    'void main(){vec2 p=gl_FragCoord.xy;float d=scene(p);',
    // The clock: a blurred text mask is the glass height map; its slope is the surface normal.
    ' vec2 uv=p/res;float m=texture2D(tmask,uv).a;',
    ' if(d>0.&&m>.42){vec2 px=2./res;',
    '  vec2 gr=vec2(texture2D(tmask,uv+vec2(px.x,0.)).a-texture2D(tmask,uv-vec2(px.x,0.)).a,texture2D(tmask,uv+vec2(0.,px.y)).a-texture2D(tmask,uv-vec2(0.,px.y)).a);',
    '  vec2 tn=-gr/max(length(gr),1e-4);float x=1.-clamp((m-.42)/.58,0.,1.);',
    '  float ti=asin(clamp(x*x,0.,1.));float tt=asin(clamp(sin(ti)/1.5,-1.,1.));float te=-tan(tt-ti);vec2 to=-tn*te*34.;',
    '  vec3 tc=vec3(blurred(p+to*1.08).r,blurred(p+to).g,blurred(p+to*.92).b);tc=mix(tc,vec3(1.),.16);',
    '  tc+=pow(x,4.)*.45;float tg=dot(tn,normalize(vec2(-.7,.75)));tc+=pow(max(tg,0.),4.)*.8*x+pow(max(-tg,0.),6.)*.3*x;',
    '  tc+=(1.-smoothstep(.42,.5,m))*.4;gl_FragColor=vec4(tc,1.);return;}',
    ' if(d>0.){vec3 col=bg(p);col*=1.-.28*exp(-d/22.);col*=1.-.22*smoothstep(.05,.42,m);gl_FragColor=vec4(col,1.);return;}',
    ' vec2 e=vec2(1.5,0.);vec2 n=vec2(scene(p+e.xy)-scene(p-e.xy),scene(p+e.yx)-scene(p-e.yx));n=n/max(length(n),1e-4);',
    ' float depth=-d,thick=26.;float edge=0.;',
    ' if(depth<thick){float x=1.-depth/thick;float ti=asin(clamp(x*x,0.,1.));float tt=asin(clamp(sin(ti)/1.45,-1.,1.));edge=-tan(tt-ti);}',
    ' vec2 off=-n*edge*42.;',
    ' vec3 col=vec3(blurred(p+off*1.07).r,blurred(p+off).g,blurred(p+off*.93).b);',
    ' col=mix(col,vec3(.03,.05,.12),.24);',
    ' float fres=clamp(pow(1.-depth/thick,5.),0.,1.);col+=fres*.32;',
    ' float g=dot(n,normalize(vec2(-.7,.75)));float glare=pow(max(g,0.),5.)*.75+pow(max(-g,0.),6.)*.3;',
    ' col+=glare*pow(clamp(1.-depth/(thick*1.4),0.,1.),1.6);',
    ' col+=(1.-smoothstep(0.,1.6,depth))*.35;',
    ' gl_FragColor=vec4(col,1.);}'
  ].join('\n');
  function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  var prog;
  try { prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(prog); }
  catch (err) { document.body.classList.add('noglass'); return null; }
  gl.useProgram(prog);
  var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  var U = {}; ['res','time','rects','radii','count','lens','tmask'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
  // The clock's text, drawn blurred into a texture that the shader turns into glass.
  var tc = document.createElement('canvas'), tctx = tc.getContext('2d'), tex = gl.createTexture(), lastMask = '';
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  function updateMask(w, h) {
    var te = el('time'), b = te.getBoundingClientRect(), cs = getComputedStyle(te);
    var key = te.textContent + '|' + w + 'x' + h + '|' + b.left + ',' + b.top + ',' + cs.fontSize;
    if (key === lastMask) return;
    lastMask = key;
    tc.width = w; tc.height = h;
    tctx.clearRect(0, 0, w, h);
    tctx.filter = 'blur(' + Math.max(4, parseFloat(cs.fontSize) / 16) + 'px)';
    tctx.fillStyle = '#fff'; tctx.textBaseline = 'middle'; tctx.textAlign = 'left';
    tctx.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    if ('letterSpacing' in tctx) tctx.letterSpacing = cs.letterSpacing;
    tctx.fillText(te.textContent, b.left, b.top + b.height / 2);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tc);
  }
  var mouse = { x: -999, y: -999, sx: -999, sy: -999, r: 0 };
  addEventListener('mousemove', function (e) { mouse.x = e.clientX; mouse.y = e.clientY; });
  addEventListener('mouseleave', function () { mouse.x = -999; });
  var start = performance.now();
  function frame() {
    requestAnimationFrame(frame);
    if (cfg.theme !== 'glass') return;
    var w = innerWidth, h = innerHeight;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
    // Every visible glass element, in GL coordinates (origin bottom-left).
    var els = Array.prototype.slice.call(document.querySelectorAll('.card, .gear, .search input, .results, .drawer'))
      .filter(function (x) { var b = x.getBoundingClientRect(); return !x.closest('[hidden]') && b.width > 0 && b.height > 0; })
      .slice(0, MAX);
    var rects = new Float32Array(MAX * 4), radii = new Float32Array(MAX);
    els.forEach(function (x, i) {
      var b = x.getBoundingClientRect();
      rects.set([b.left, h - b.bottom, b.width, b.height], i * 4);
      radii[i] = Math.min(parseFloat(getComputedStyle(x).borderTopLeftRadius) || 0, b.width / 2, b.height / 2);
    });
    // A glass bubble follows the mouse (springy), and melts into nearby glass.
    mouse.sx += (mouse.x - mouse.sx) * .18; mouse.sy += (mouse.y - mouse.sy) * .18;
    mouse.r += ((mouse.x > -900 ? 34 : 0) - mouse.r) * .15;
    gl.uniform2f(U.res, w, h); gl.uniform1f(U.time, (performance.now() - start) / 1000);
    gl.uniform4fv(U.rects, rects); gl.uniform1fv(U.radii, radii); gl.uniform1f(U.count, els.length);
    gl.uniform3f(U.lens, mouse.sx, h - mouse.sy, mouse.r);
    updateMask(w, h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(U.tmask, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  frame();
  return true;
})();

el('notes').value = cfg.notes || '';
renderQuote(); applyLayout(); renderStats(FA.stats);
setInterval(tickClock, 1000);
</script>
</body></html>

"""##

// MARK: - Menu bar button

/// Runs a closure when a menu item is clicked.
final class MenuAction: NSObject {
    let run: () -> Void
    init(_ run: @escaping () -> Void) { self.run = run }
    #if canImport(ObjectiveC)
    @objc func fire() { run() }
    #endif
}

/// Set before the menu is made: Bbokari's menu bar icon runs FaceAway, so FaceAway shows no eye of its own.
var statusItemHidden = false

/// FaceAway's icon in the menu bar: the easy on/off button for everything.
final class StatusMenu {
    private let item: NSStatusItem
    private(set) var actions: [(title: String, action: MenuAction)] = []
    private weak var controller: Controller?
    var homeToggle: (() -> Void)?
    var homeShowing: () -> Bool = { false }
    var panic: (() -> Void)?
    var setTheme: ((String) -> Void)?
    var currentTheme: () -> String = { "clean" }

    init(controller: Controller) {
        self.controller = controller
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.isVisible = !statusItemHidden   // Bbokari's menu bar icon runs FaceAway then
        rebuild()
    }

    func rebuild() {
        guard let c = controller else { return }
        let symbol = c.softLockedNow ? "lock.fill" : c.watching ? "eye.fill" : "eye.slash"
        item.button?.image = NSImage(systemSymbolName: symbol, accessibilityDescription: "FaceAway")
        item.button?.image?.isTemplate = true
        let menu = NSMenu()
        actions = []
        func add(_ title: String, on: Bool? = nil, to target: NSMenu? = nil, _ run: @escaping () -> Void) {
            let action = MenuAction(run)
            let mi = NSMenuItem(title: title, action: nil, keyEquivalent: "")
            mi.target = action
            #if canImport(ObjectiveC)
            mi.action = #selector(MenuAction.fire)
            #endif
            if let on = on { mi.state = on ? .on : .off }
            (target ?? menu).addItem(mi)
            actions.append((title, action))
        }
        func note(_ title: String) {
            let mi = NSMenuItem(title: title, action: nil, keyEquivalent: "")
            mi.isEnabled = false
            menu.addItem(mi)
        }
        note(c.watching ? "Watching: ON (camera on)" : "Watching: OFF (camera off)")
        add(c.watching ? "Turn watching off" : "Turn watching on") { [weak c] in c?.toggleWatching() }
        menu.addItem(NSMenuItem.separator())
        if c.lockEnabled && c.options.faceUnlock {
            add("Lock now (Face ID)") { [weak c] in c?.lockNowFromMenu() }
            note("Face ID lock when you close the lid: ON")
        } else {
            note("Face ID: add your face with --add \"Me\"")
        }
        if let panic = panic { add("Panic (password)") { panic() } }
        if let toggle = homeToggle { add("Home screen", on: homeShowing()) { toggle() } }
        if let set = setTheme {
            let sub = NSMenu()
            let names = [("clean", "Clean"), ("midnight", "Midnight"), ("sunset", "Sunset"), ("hacker", "Hacker"), ("glass", "Liquid Glass")]
            for (id, title) in names { add(title, on: currentTheme() == id, to: sub) { set(id) } }
            let parent = NSMenuItem(title: "Theme", action: nil, keyEquivalent: "")
            parent.submenu = sub
            menu.addItem(parent)
        }
        menu.addItem(NSMenuItem.separator())
        add("Quit FaceAway") { exit(0) }
        item.menu = menu
    }
}

// MARK: - Panic keys

var hotKeyActions: [UInt32: () -> Void] = [:]
var hotKeyRefs: [EventHotKeyRef?] = []

/// Registers Ctrl+Option+Cmd+<key> shortcuts that work from any app.
var hotKeyHandlerInstalled = false

func registerHotKeys(_ keys: [(keyCode: Int, action: () -> Void)]) {
    var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
    if !hotKeyHandlerInstalled {
        hotKeyHandlerInstalled = true
        InstallEventHandler(GetApplicationEventTarget(), { _, event, _ -> OSStatus in
            var id = EventHotKeyID()
            GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID),
                              nil, MemoryLayout<EventHotKeyID>.size, nil, &id)
            let action = hotKeyActions[id.id]
            DispatchQueue.main.async { action?() }
            return noErr
        }, 1, &spec, nil, nil)
    }

    for key in keys {
        let id = UInt32(hotKeyActions.count + 1)
        hotKeyActions[id] = key.action
        var ref: EventHotKeyRef?
        RegisterEventHotKey(UInt32(key.keyCode), UInt32(cmdKey | optionKey | controlKey),
                            EventHotKeyID(signature: OSType(0x4641_5741), id: id),  // 'FAWA'
                            GetApplicationEventTarget(), 0, &ref)
        hotKeyRefs.append(ref)
    }
}

// MARK: - Gestures

/// Average brightness (0–255) from a grid of pixels; near 0 means the camera is covered.
func averageBrightness(_ pixels: CVPixelBuffer) -> Double {
    CVPixelBufferLockBaseAddress(pixels, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(pixels, .readOnly) }
    guard let base = CVPixelBufferGetBaseAddress(pixels) else { return 255 }
    let w = CVPixelBufferGetWidth(pixels), h = CVPixelBufferGetHeight(pixels)
    let row = CVPixelBufferGetBytesPerRow(pixels)
    let p = base.assumingMemoryBound(to: UInt8.self)
    var total = 0.0
    for gy in 0..<15 {
        for gx in 0..<20 {
            let x = (gx * 2 + 1) * w / 40, y = (gy * 2 + 1) * h / 30
            let o = y * row + x * 4                       // BGRA
            total += 0.114 * Double(p[o]) + 0.587 * Double(p[o + 1]) + 0.299 * Double(p[o + 2])
        }
    }
    return total / 300
}

/// True when an open hand, fingers spread, is held up close to the camera.
func palmShown(_ pixels: CVPixelBuffer, request: VNDetectHumanHandPoseRequest) -> Bool {
    let handler = VNImageRequestHandler(cvPixelBuffer: pixels, orientation: .up, options: [:])
    guard (try? handler.perform([request])) != nil,
          let hand = request.results?.first,
          let points = try? hand.recognizedPoints(.all) else { return false }
    let tips: [VNHumanHandPoseObservation.JointName] = [.thumbTip, .indexTip, .middleTip, .ringTip, .littleTip]
    guard tips.compactMap({ points[$0] }).filter({ $0.confidence > 0.4 }).count == 5 else { return false }
    let seen = points.values.filter { $0.confidence > 0.3 }
    let xs = seen.map(\.location.x), ys = seen.map(\.location.y)
    guard let minX = xs.min(), let maxX = xs.max(), let minY = ys.min(), let maxY = ys.max() else { return false }
    return maxX - minX > 0.2 && maxY - minY > 0.25
}

// MARK: - Options

enum Mode {
    case run, list, enroll(String), people, remove(String), check, log, intruders
    case setPassword, setPasswordStdin, hackerMac(Bool), homeOnly, app
}

struct Options {
    var mode = Mode.run
    var browser: Browser?
    var needle: String?
    var openURL: String?
    var delay: Double = 0.6
    var watchOthers = true
    var goBack = false
    var lock = true
    var tolerance: Double = 1.0
    var grace: Double = 30
    var minSize: Double = 0.06
    var checksPerSecond: Double = 30
    var verbose = false
    // Extras
    var hud = false
    var hacker = false
    var voice = false
    var alarm = false
    var photos = true
    var textTo: String?
    var decoy: String?
    var schoolName = "Northfield Academy"
    var gestures = false
    var mute = false
    var hotkeys = true
    var faceID = false
    var faceUnlock = false
    var softLockSeconds: Double = 60   // how long a stranger may try before the Mac lock (0 = never)
    var lockAfter: Double = 30         // face-lock after you've been away this long (0 = don't)
    var minQuality: Double = 0.3
    var strict = false
    var home = false
    var panicButton = false
    var theme: String?
    var guardMode = false      // --guard: Face ID is the lock; no decoy or tab switching unless asked for
    var startWatching = false  // --watch: start with the camera checking who's there
    var noStatusItem = false   // --no-status-item: no eye in the menu bar (Bbokari's menu runs FaceAway)
    var askFirst = false       // --ask-first: text "Lock computer?" and wait for YES / NO instead of locking at once
    var askTimeout: Double = 120 // --ask-timeout: no answer in this many seconds → lock (0 = never)
    var textViaBridge = false  // --text-via-bridge: Bbokari sends the texts and reads your Y / N
}

let usage = """
FaceAway — a little security system for your Mac.

USAGE
  faceaway --app                    Menu bar app (recommended): everything starts OFF. Click the
                                    eye icon in the menu bar to turn watching on/off. With your
                                    face added, closing the lid locks with Face ID.
  faceaway                          List your open tabs and pick one
  faceaway --tab "Google Docs"      Use the first tab whose URL or title contains this text
  faceaway --url https://...        Use a tab with this URL (opens it if it isn't open)
  faceaway --decoy update           Show a fake "Installing update…" screen instead of a tab
  faceaway --decoy school           Show a fake school portal (assignments, timetable, grades)
  faceaway --all                    Turn on every extra below (targeting window, hacker
                                    terminal, voice, alarm, gestures, auto-mute, Face ID animation,
                                    face unlock). The targeting window is separate: --hud

PEOPLE (once anyone is added, the Mac locks when someone else is at the screen)
  faceaway --add "Me"               Teach FaceAway your face (run again to add more samples)
  faceaway --add "Mom"              Add another person who's allowed to use the Mac
  faceaway --people                 List the people FaceAway knows
  faceaway --remove "Mom"           Forget someone
  faceaway --check                  Live test: shows who it thinks it sees, and how sure it is

EXTRAS
  --hud             Live targeting window: brackets and names around every face
  --hacker          Green hacker terminal with a boot sequence and live status line
  --voice           Says "Access denied" to strangers and "Welcome back" to you
  --alarm           Plays an alarm sound when a stranger is caught
  --text-me WHO     iMessage WHO (your phone number or Apple ID email) when a stranger is caught
  --decoy STYLE     Cover the screen instead of / as well as switching tabs: update, school or black
  --school-name N   The school name shown on the school decoy (default: Northfield Academy)
  --gestures        Show your palm to hide (show it again to undo); cover the camera to hide
  --mute            Mute the Mac and pause Music/Spotify while hidden
  --faceid          Face ID-style animation: a green check when Face ID unlocks,
                    a red cross before a stranger gets locked out
  --face-unlock     Use FaceAway's Face ID lock screen, like an iPhone: it locks when you've
                    been away, when a stranger sits down, or with Ctrl+Option+Cmd+L, and it
                    unlocks as soon as it sees you. No password.
  --lock-after S    Face-lock after you've been away this many seconds (default: 30, 0 = don't)
  --unlock-time S   If a stranger keeps trying this long, switch to the real Mac lock, which
                    needs your password (default: 60, 0 = never)
  --no-photos       Don't save photos of strangers
  --no-hotkeys      Turn off the panic keys
  --guard           With --app: Face ID is your lock. Watching only checks who's there: you → nothing
                    happens; nobody for --lock-after seconds → Face ID lock; a stranger → Face ID lock,
                    a photo and a text (--text-me). No decoy or tab switching unless you ask for one.
  --watch           With --app: start with watching on
  --ask-first       With --text-me: when a stranger sits down, text "Lock computer? Reply YES or NO" and
                    do what you answer (reading replies needs Full Disk Access)
  --ask-timeout S   No answer in this many seconds → lock (default: 120, 0 = never)
  --no-status-item  With --app: no eye in the menu bar (when Bbokari's menu runs FaceAway)

HOME SCREEN AND PANIC BUTTON
  faceaway --set-password           Choose the password that closes the panic screen
  faceaway --home-only              Just the home screen and panic button, no camera
  --home            Show your customizable home screen on the desktop (click ⚙️ on it to customize)
  --panic-button    A floating PANIC button: click it and the screen asks for your password
  --theme NAME      clean, midnight, sunset, hacker or glass (Liquid Glass); hacker also turns
                    on the hacker terminal. The home screen's search bar finds apps, files and
                    web results: press / or Cmd+K to jump to it.
  faceaway --hacker-mac on          Make the whole Mac look like a hacker's computer
  faceaway --hacker-mac off         Put everything back

PANIC KEYS (work from any app)
  Ctrl+Option+Cmd+H   Hide now (press again to come back)
  Ctrl+Option+Cmd+L   Lock the Mac now
  Ctrl+Option+Cmd+D   Cover the screen with the decoy now (press again to come back)
  Ctrl+Option+Cmd+P   Panic screen: asks for your password (with --home or --panic-button)
  Ctrl+Option+Cmd+W   Turn watching on/off

OTHER OPTIONS
  --browser NAME    chrome, safari, brave, edge or chromium (default: whichever is running)
  --delay SECONDS   How long your face must be gone before switching (default: 0.6, 0 = instant)
  --only-me         Don't switch tabs when a second face appears
  --back            Return to the app and tab you were on when you're back
  --no-lock         Never lock the Mac, even if people are added
  --tolerance N     How loosely faces must match: lower is stricter (default: 1.0)
  --grace SECONDS   After the Mac is unlocked, wait this long before locking again (default: 30)
  --min-size N      Ignore faces narrower than this fraction of the frame (default: 0.06)
  --min-quality N   Only judge faces at least this clear, 0–1; tilted or lowered faces score
                    low and are skipped instead of counting as strangers (default: 0.3)
  --strict          Hide whenever your face isn't visible, even if you're still sitting there
  --rate N          Face checks per second (default: 30)
  --list            Print open tabs and exit
  --log             Show the last 50 events (switches, locks, intruders)
  --intruders       Open the folder of intruder photos
  --verbose         Print who's in view and how long each switch took
  -h, --help        Show this help

Press Ctrl+C to stop.
"""

func parseOptions() -> Options {
    var o = Options()
    var args = Array(CommandLine.arguments.dropFirst())
    func value(_ flag: String) -> String {
        guard !args.isEmpty else { fail("\(flag) needs a value.") }
        return args.removeFirst()
    }
    func number(_ flag: String) -> Double {
        let v = value(flag)
        guard let d = Double(v), d >= 0 else { fail("\(flag) needs a number, got \"\(v)\".") }
        return d
    }
    while !args.isEmpty {
        let a = args.removeFirst()
        switch a {
        case "--browser":
            let v = value(a).lowercased()
            guard let b = Browser(rawValue: v) else {
                fail("Unknown browser \"\(v)\". Use: \(Browser.allCases.map(\.rawValue).joined(separator: ", "))")
            }
            o.browser = b
        case "--tab": o.needle = value(a)
        case "--url": o.openURL = value(a)
        case "--delay": o.delay = number(a)
        case "--only-me": o.watchOthers = false
        case "--back": o.goBack = true
        case "--no-lock": o.lock = false
        case "--tolerance": o.tolerance = number(a)
        case "--grace": o.grace = number(a)
        case "--min-size": o.minSize = number(a)
        case "--rate": o.checksPerSecond = number(a)
        case "--list": o.mode = .list
        case "--add", "--enroll":
            let name = value(a).trimmingCharacters(in: .whitespaces)
            guard !name.isEmpty else { fail("\(a) needs a name, like --add \"Mom\".") }
            o.mode = .enroll(name)
        case "--people": o.mode = .people
        case "--remove": o.mode = .remove(value(a))
        case "--check": o.mode = .check
        case "--log": o.mode = .log
        case "--intruders": o.mode = .intruders
        case "--hud": o.hud = true
        case "--hacker": o.hacker = true
        case "--voice": o.voice = true
        case "--alarm": o.alarm = true
        case "--text-me": o.textTo = value(a)
        case "--decoy":
            let v = value(a).lowercased()
            guard ["update", "school", "black"].contains(v) else { fail("--decoy must be update, school or black.") }
            o.decoy = v
        case "--school-name": o.schoolName = value(a)
        case "--gestures": o.gestures = true
        case "--mute": o.mute = true
        case "--faceid": o.faceID = true
        case "--face-unlock": o.faceUnlock = true
        case "--unlock-time": o.softLockSeconds = number(a)
        case "--lock-after": o.lockAfter = number(a)
        case "--min-quality": o.minQuality = number(a)
        case "--strict": o.strict = true
        case "--no-photos": o.photos = false
        case "--no-hotkeys": o.hotkeys = false
        case "--all":
            o.hacker = true; o.voice = true
            o.alarm = true; o.gestures = true; o.mute = true; o.faceID = true; o.faceUnlock = true
        case "--app": o.mode = .app
        case "--guard": o.guardMode = true
        case "--watch": o.startWatching = true
        case "--no-status-item": o.noStatusItem = true
        case "--ask-first": o.askFirst = true
        case "--ask-timeout": o.askTimeout = number(a)
        case "--text-via-bridge": o.textViaBridge = true
        case "--home": o.home = true
        case "--home-only": o.mode = .homeOnly; o.home = true
        case "--panic-button": o.panicButton = true
        case "--set-password": o.mode = .setPassword
        case "--set-password-stdin": o.mode = .setPasswordStdin   // (Bbokari passes the password on standard input)
        case "--theme":
            let v = value(a).lowercased()
            guard HomeConfig.themes.contains(v) else { fail("--theme must be one of: \(HomeConfig.themes.joined(separator: ", ")).") }
            o.theme = v
            if v == "hacker" { o.hacker = true }
        case "--hacker-mac":
            let v = value(a).lowercased()
            guard v == "on" || v == "off" else { fail("Use --hacker-mac on or --hacker-mac off.") }
            o.mode = .hackerMac(v == "on")
        case "--verbose", "-v": o.verbose = true
        case "-h", "--help": print(usage); exit(0)
        default: fail("Unknown option \(a). Run with --help.")
        }
    }
    return o
}

func shortHost(_ url: String) -> String {
    URL(string: url)?.host ?? url
}

/// The URL without its ?query or #fragment, so the tab still matches after small navigations.
func baseURL(_ url: String) -> String {
    guard var parts = URLComponents(string: url), parts.host != nil else { return url }
    parts.query = nil
    parts.fragment = nil
    return parts.string ?? url
}

func pickTab(_ b: Browser) -> BrowserTab {
    let tabs = snapshot(b, using: compileScript(b.snapshotScript)).flatMap(\.tabs)
    if tabs.isEmpty {
        fail("\(b.appName) has no open tabs (or isn't running). Open the tab you want, or use --url or --decoy.")
    }
    print("Open tabs in \(b.appName):\n")
    for (n, t) in tabs.enumerated() {
        let title = t.title.count > 60 ? String(t.title.prefix(57)) + "..." : t.title
        print(String(format: "  %2ld. ", n + 1) + "\(title)  —  \(shortHost(t.url))")
    }
    while true {
        print("\nWhich tab should FaceAway switch to? Enter a number: ", terminator: "")
        fflush(stdout)
        guard let line = readLine() else { exit(0) }
        if let n = Int(line.trimmingCharacters(in: .whitespaces)), (1...tabs.count).contains(n) {
            return tabs[n - 1]
        }
        print("Please enter a number from 1 to \(tabs.count).")
    }
}

// MARK: - Adding a person

final class Enroller {
    let name: String
    let options: Options
    private var watcher: FaceWatcher!
    private let glance = GlanceEnrollment()

    init(name: String, options: Options) {
        self.name = name
        self.options = options
    }

    /// Glance's face setup: the black pill panel with the camera inside the ring, and the blue sweep across the
    /// screen pointing where to turn your head (straight, then the eight directions). The ring fills as each
    /// direction is captured, then the checkmark draws.
    func start() {
        print("Adding \"\(name)\". Look at the camera, then turn your head where the blue light sweeps.")
        watcher = FaceWatcher(checksPerSecond: 15, minSize: 0.01) { [weak self] pixels, _ in
            self?.glance.frame(pixels)
        }
        watcher.start()
        glance.done = { [weak self] samples in
            guard let self else { return }
            guard let samples else {
                self.watcher.stop()
                print("Cancelled.")
                exit(1)
            }
            do {
                let total = try FaceStore.add(samples, to: self.name)
                print("Saved \"\(self.name)\" (\(total) samples).")
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { self.watcher.stop() }
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.2) {
                    self.glance.ui.close()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { exit(0) }
                }
            } catch {
                fail("Couldn't save: \(error.localizedDescription)")
            }
        }
        glance.begin(session: watcher.session)
    }
}

// MARK: - Live recognition test

final class Checker {
    let people: [Person]
    let options: Options
    private var watcher: FaceWatcher!
    private var lastCheck = Date.distantPast

    init(people: [Person], options: Options) {
        self.people = people
        self.options = options
    }

    func start() {
        print("""

        Showing who FaceAway sees, twice a second. "distance" is how different the face
        looks from that person's samples; it counts as them when it's at or under the limit.
        Have someone else try too: they should come up as STRANGER. Ctrl+C to stop.

        """)
        watcher = FaceWatcher(checksPerSecond: 15, minSize: options.minSize) { [weak self] pixels, faces in
            self?.frame(pixels, faces)
        }
        watcher.start()
    }

    private func frame(_ pixels: CVPixelBuffer, _ faces: [CGRect]) {
        let now = Date()
        guard now.timeIntervalSince(lastCheck) >= 0.5 else { return }
        lastCheck = now
        if faces.isEmpty { say("no face"); return }
        let top = Array(faces.prefix(3))
        let quality = faceQualities(pixels, top)
        let parts = top.indices.map { i -> String in
            let box = top[i]
            let q = String(format: "quality %.2f", quality[i])
            guard quality[i] >= Float(options.minQuality) else { return "unsure (\(q), face the camera)" }
            guard fullyInFrame(box) else { return "unsure (face cut off by the edge of the camera)" }
            guard let fp = featurePrint(of: pixels, box: box),
                  let m = identify(fp, among: people, tolerance: Float(options.tolerance)) else { return "?" }
            let numbers = String(format: "distance %.2f, limit %.2f, ", m.distance, m.threshold) + q
            return m.name.map { "\($0) (\(numbers))" } ?? "STRANGER (closest: \(m.bestName), \(numbers))"
        }
        say(parts.joined(separator: "  |  "))
    }
}

// MARK: - Controller

final class Controller {
    let options: Options
    let browser: Browser
    let needle: String
    let openURL: String?
    let people: [Person]
    var lockEnabled: Bool { options.lock && !people.isEmpty }
    var tabEnabled: Bool { !needle.isEmpty }

    private var watcher: FaceWatcher!
    private let snapshotScript: NSAppleScript?

    // Pre-compiled switch, kept pointing at wherever the target tab currently is.
    private var armedScript: NSAppleScript?
    private var armedFor: (window: Int, index: Int)?
    private var windows: [BrowserWindow] = []

    // Detection state (main thread)
    private var lastAlone = Date()   // last frame where it was just you
    private var othersStreak = 0
    private var aloneStreak = 0
    private var lastCount: Int?
    private var hidden = false
    private var holding = false      // hidden by a panic key or palm: stays hidden until undone
    private var hiddenSince: Date?

    // Recognition state (main thread)
    private var trustedCount: Int?            // face count when everyone in view was trusted
    private var trustedAt = Date.distantPast
    private var unknownStreak = 0
    private var lastMatches: [Match?] = []
    private var lastTrustedName: String?
    private var lastNames = ""
    private var screenLocked = false
    private var graceUntil = Date.distantPast
    private var pendingPhoto: Data?
    private var intruderPhotos: [URL] = []

    // Gesture state (main thread)
    private var coveredStreak = 0
    private var palmStreak = 0
    private var lastPalmToggle = Date.distantPast

    // Camera queue only
    private let staticFaces = StaticFaceFilter()
    private var lastBodyCheck = Date.distantPast
    private var bodyCache = false
    private var lastRecognition = Date.distantPast
    private var lastGesture = Date.distantPast
    private let ciContext = CIContext()
    private let handRequest: VNDetectHumanHandPoseRequest = {
        let r = VNDetectHumanHandPoseRequest()
        r.maximumHandCount = 1
        return r
    }()

    // Extras
    private let media = Media()
    private let faceIDOverlay = FaceIDOverlay()
    private let softLock = SoftLock()
    private var softLocked = false
    private var softStrangerStreak = 0
    private var softLockReadyAt = Date.distantPast
    private var softTrust = 0
    private var strangerSince: Date?           // a stranger has been trying to unlock since
    private var presentSinceTrusted = false   // you were recognized and haven't left since
    /// Watching = the camera hides your screen when you look away and catches strangers.
    /// When it's off, the camera only turns on for the Face ID lock (e.g. after closing the lid).
    private(set) var watching = true
    private(set) var cameraOn = false
    var onStateChange: () -> Void = {}
    private var lastBody = false              // latest frame: no face, but someone still sitting there
    private var lastFrameAt = Date()
    private var decoy: Decoy?
    private var hud: HUD?
    private var lastStatus = Date.distantPast

    // For --back
    private var previousAppBundleID: String?
    private var previousTab: (window: Int, index: Int)?

    init(options: Options, browser: Browser, needle: String, openURL: String?, people: [Person], watching: Bool = true) {
        self.watching = watching
        self.options = options
        self.browser = browser
        self.needle = needle
        self.openURL = openURL
        self.people = people
        self.snapshotScript = needle.isEmpty ? nil : compileScript(browser.snapshotScript)
    }

    func start() {
        if tabEnabled {
            refresh()
            _ = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
                guard let self = self, !self.hidden, !self.screenLocked else { return }
                self.refresh()
            }
        }
        // Backup check in case the camera stops sending frames.
        _ = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            self?.checkAbsence()
        }
        let center = DistributedNotificationCenter.default()
        center.addObserver(forName: NSNotification.Name("com.apple.screenIsLocked"),
                           object: nil, queue: .main) { [weak self] _ in self?.screenLocked = true }
        center.addObserver(forName: NSNotification.Name("com.apple.screenIsUnlocked"),
                           object: nil, queue: .main) { [weak self] _ in self?.unlocked() }
        // Closing the lid / sleeping arms the Face ID lock; opening it turns the camera on to check.
        let ws = NSWorkspace.shared.notificationCenter
        _ = ws.addObserver(forName: NSWorkspace.willSleepNotification, object: nil, queue: .main) { [weak self] _ in self?.macWillSleep() }
        _ = ws.addObserver(forName: NSWorkspace.screensDidSleepNotification, object: nil, queue: .main) { [weak self] _ in self?.macWillSleep() }
        _ = ws.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in self?.macDidWake() }
        _ = ws.addObserver(forName: NSWorkspace.screensDidWakeNotification, object: nil, queue: .main) { [weak self] _ in self?.macDidWake() }

        if let style = options.decoy { decoy = Decoy(style: style, schoolName: options.schoolName) }
        softLock.onUsePassword = { [weak self] in self?.usePassword() }
        startRemoteLock()

        watcher = FaceWatcher(checksPerSecond: options.checksPerSecond, minSize: options.minSize) {
            [weak self] pixels, faces in self?.frame(pixels, faces)
        }
        updateCamera()
        if options.hud { hud = HUD(session: watcher.session) }

        if options.hotkeys {
            registerHotKeys([
                (keyCode: kVK_ANSI_H, action: { [weak self] in self?.togglePanic(source: "Panic key") }),
                (keyCode: kVK_ANSI_L, action: { [weak self] in self?.lockNow() }),
                (keyCode: kVK_ANSI_D, action: { [weak self] in self?.toggleDecoyPanic() }),
                (keyCode: kVK_ANSI_W, action: { [weak self] in self?.toggleWatching() }),
            ])
        }
    }

    // MARK: On/off and lid

    /// The camera runs only while watching, or while the Face ID lock is waiting for a face.
    func updateCamera() {
        let want = watching || softLocked
        guard want != cameraOn, let w = watcher else { return }
        cameraOn = want
        if want {
            lastCount = nil          // don't treat camera warm-up as "you left"
            lastAlone = Date()
            lastFrameAt = Date()
            w.start()
        } else {
            w.stop()
        }
        onStateChange()
    }

    func setWatching(_ on: Bool) {
        guard on != watching else { return }
        watching = on
        if !on && hidden && !softLocked { unhide(fromKey: true) }
        say(on ? "Watching ON: the camera hides your screen when you look away." : "Watching OFF: camera off.", on ? .good : .info)
        EventLog.add(on ? "Watching on" : "Watching off")
        Bridge.emit(["type": "watching", "on": on])
        updateCamera()
        onStateChange()
    }

    func toggleWatching() { setWatching(!watching) }
    /// Changes the decoy screen (school, update or black) while running (Bbokari's menu can do this).
    func setDecoy(_ style: String) {
        guard ["update", "school", "black"].contains(style) else { return }
        decoy = Decoy(style: style, schoolName: options.schoolName)
        say("Decoy screen: \(style).", .good)
        Bridge.emit(["type": "decoy", "name": style])
    }
    var softLockedNow: Bool { softLocked }
    func lockNowFromMenu() { lockNow() }

    /// Lid closed or Mac asleep: put up the Face ID lock so it's there when the lid opens.
    func macWillSleep() {
        guard options.faceUnlock, lockEnabled, !softLocked, !screenLocked else { return }
        enterSoftLock(reason: "Mac closed", stranger: false)
    }

    /// Lid opened: make sure the camera is running to check your face.
    func macDidWake() {
        guard softLocked else { return }
        if cameraOn { watcher?.stop(); cameraOn = false }   // restart the camera after sleep
        updateCamera()
        softLock.setMessage(SoftLock.prompt)
    }

    // MARK: Camera queue

    /// Fast face count every frame; recognition 5×/s; gestures 10×/s.
    private func frame(_ pixels: CVPixelBuffer, _ allFaces: [CGRect]) {
        let size = CGSize(width: CVPixelBufferGetWidth(pixels), height: CVPixelBufferGetHeight(pixels))
        let now = Date()
        let faces = staticFaces.filter(allFaces, now: now)   // drop pictures on the wall
        let watchingNow = watching   // read once per frame
        // No face: check whether you're still sitting there (looking down or away).
        if faces.isEmpty && !options.strict {
            if now.timeIntervalSince(lastBodyCheck) >= 0.1 {
                lastBodyCheck = now
                bodyCache = bodyPresent(pixels)
            }
        } else {
            bodyCache = false
        }
        let body = bodyCache
        if watchingNow { DispatchQueue.main.async { self.handle(faces: faces, imageSize: size, body: body) } }

        if watchingNow && options.gestures && now.timeIntervalSince(lastGesture) >= 0.1 {
            lastGesture = now
            let covered = averageBrightness(pixels) < 12
            let palm = !covered && palmShown(pixels, request: handRequest)
            DispatchQueue.main.async { self.handle(covered: covered, palm: palm) }
        }

        guard lockEnabled, !faces.isEmpty, now.timeIntervalSince(lastRecognition) >= 0.2 else { return }
        lastRecognition = now
        let top = Array(faces.prefix(3))
        let quality = faceQualities(pixels, top)
        let seen: [Seen] = top.indices.map { i in
            // Too blurry, tilted or lowered to judge fairly: skip it rather than call it a stranger.
            // On the lock screen a slightly less clear look is enough: only your saved faces can open it anyway.
            guard quality[i] >= Float(softLocked ? min(options.minQuality, 0.18) : options.minQuality), fullyInFrame(top[i]),
                  let print = featurePrint(of: pixels, box: top[i]),
                  let match = identify(print, among: people, tolerance: Float(options.tolerance) * (softLocked ? 1.12 : 1))
            else { return Seen(match: nil, sure: false) }
            return Seen(match: match, sure: true)
        }
        let strangerInFront = seen.first?.isStranger ?? false
        let photo = strangerInFront && options.photos ? jpeg(pixels) : nil
        DispatchQueue.main.async { self.handle(seen: seen, count: faces.count, photo: photo) }
    }

    private func jpeg(_ pixels: CVPixelBuffer) -> Data? {
        let image = CIImage(cvPixelBuffer: pixels).oriented(.upMirrored)   // selfie view
        guard let srgb = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
        return ciContext.jpegRepresentation(of: image, colorSpace: srgb, options: [:])
    }

    // MARK: Main thread

    /// Finds where the target tab is right now and pre-compiles the script that shows it.
    private func refresh() {
        guard tabEnabled else { return }
        windows = snapshot(browser, using: snapshotScript)
        if let tab = findTab(needle, in: windows) {
            if armedFor?.window != tab.windowID || armedFor?.index != tab.index {
                armedScript = compileScript(browser.showScript(windowID: tab.windowID, index: tab.index))
                armedFor = (tab.windowID, tab.index)
            }
        } else if armedFor != nil || armedScript == nil {
            armedFor = nil
            armedScript = openURL.flatMap { compileScript(browser.openScript(url: $0)) }
        }
    }

    /// True when recognition recently saw exactly these faces and trusts all of them.
    private func everyoneTrusted(_ count: Int) -> Bool {
        lockEnabled && trustedCount == count && Date().timeIntervalSince(trustedAt) < 1.0
    }

    private func handle(faces: [CGRect], imageSize: CGSize, body: Bool = false) {
        let count = faces.count
        if options.verbose, count != lastCount, !lockEnabled {
            say(count == 0 ? (body ? "No face (still there)" : "No face") : count == 1 ? "1 face" : "\(count) faces")
        }
        lastCount = count
        lastBody = body
        lastFrameAt = Date()
        updateDisplays(faces: faces, imageSize: imageSize)
        if count == 0 && !body {
            presentSinceTrusted = false   // you really left
            if softLocked && strangerSince != nil {   // whoever was trying has gone
                strangerSince = nil
                softLock.setMessage(SoftLock.prompt)
            }
        }
        if screenLocked { lastAlone = Date(); return }
        // Face out of view but your head and shoulders are still here: you're just looking away.
        if count == 0 && body { lastAlone = Date(); aloneStreak = 0; othersStreak = 0; return }

        if count >= 2 && options.watchOthers && !everyoneTrusted(count) {
            aloneStreak = 0
            othersStreak += 1
            // 6 frames in a row (~0.2 s) so a flicker or a face-like pattern doesn't trigger it.
            if othersStreak >= 6 { hide(reason: "Someone else is looking") }
            return
        }
        othersStreak = 0
        if count == 0 { aloneStreak = 0; checkAbsence(); return }

        lastAlone = Date()
        // With people added, "all clear" means recognition confirmed who's there.
        let clear = lockEnabled ? everyoneTrusted(count) : true
        aloneStreak = clear ? aloneStreak + 1 : 0
        if hidden && !holding && aloneStreak >= 5 { unhide() }
    }

    private func handle(seen: [Seen], count: Int, photo: Data?) {
        lastMatches = seen.map { $0.sure ? $0.match : nil }
        if options.verbose {
            let text = seen.map { !$0.sure ? "unsure" : ($0.match?.name ?? "stranger") }.joined(separator: ", ")
            if text != lastNames { say("In view: \(text)") }
            lastNames = text
        }
        if seen.count == count && seen.allSatisfy(\.isTrusted) {
            trustedCount = count
            trustedAt = Date()
            lastTrustedName = seen.first?.match?.name
        } else if seen.contains(where: \.isStranger) {
            trustedCount = nil   // a stranger is in view: forget any earlier "all trusted"
        }
        if let photo = photo { pendingPhoto = photo }

        // Only the person closest to the screen (largest face) counts, and only a clear view.
        // An unclear view (head lowered or turned) changes nothing.
        guard let primary = seen.first, primary.sure else { return }

        if softLocked {
            // A moment to settle after locking (otherwise it opens again the instant you press the lock key).
            if Date() < softLockReadyAt { return }
            if primary.isTrusted {
                strangerSince = nil
                softStrangerStreak = 0
                softTrust += 1
                // Two clear matches (~0.4 s), like Face ID: look, and it opens. A miss in between doesn't reset it.
                if softTrust >= 2, let name = primary.match?.name { softUnlock(name) }
            } else {
                // One bad look is probably you at an angle or in bad light: only ~2 s of clearly "not you" counts.
                softStrangerStreak += 1
                guard softStrangerStreak >= 10 else { return }
                softTrust = 0
                if strangerSince == nil {
                    strangerSince = Date()
                    strangerAtLock(photo: photo)
                    softLock.setMessage("Not recognized", alert: true)
                    if options.faceID { faceIDOverlay.failure("Not recognized") }   // Glance's red shake, then waits again
                }
                if options.softLockSeconds > 0, let since = strangerSince,
                   Date().timeIntervalSince(since) >= options.softLockSeconds {
                    escalateToMacLock()
                }
            }
            return
        }
        if primary.isTrusted {
            unknownStreak = 0
            presentSinceTrusted = true
            if !askIsTest { cancelAsk() }
            return
        }
        unknownStreak += 1
        // A stranger sitting down: 3 clear checks (~0.6 s). But if you were recognized and
        // never left, it takes 12 clear checks (~2.5 s): it's far more likely just you at an angle.
        let needed = presentSinceTrusted ? 12 : 3
        if lockEnabled && unknownStreak >= needed && !screenLocked && Date() >= graceUntil
            && !asking && Date() >= strangerOKUntil {
            unknownStreak = 0
            presentSinceTrusted = false
            catchIntruder()
        }
    }

    private func handle(covered: Bool, palm: Bool) {
        coveredStreak = covered ? coveredStreak + 1 : 0
        if coveredStreak == 2 { hide(reason: "Camera covered") }   // uncover and look to come back

        palmStreak = palm ? palmStreak + 1 : 0
        if palmStreak == 2 && Date().timeIntervalSince(lastPalmToggle) > 2 {
            lastPalmToggle = Date()
            togglePanic(source: "Palm")
        }
    }

    private func catchIntruder() {
        let ask = options.askFirst && options.textTo != nil && options.faceUnlock
        hide(reason: "Intruder detected")
        say(ask ? "Someone else is at the Mac — asking you by text." : "INTRUDER DETECTED — locking the Mac.", .alert)
        EventLog.add(ask ? "Someone else at the Mac" : "INTRUDER at the Mac — locked")

        var photoURL: URL?
        if options.photos, let data = pendingPhoto, let url = Intruders.save(data) {
            photoURL = url
            intruderPhotos.append(url)
            say("Photo saved: \(url.lastPathComponent)", .alert)
            EventLog.add("Photo: \(url.path)")
        }
        pendingPhoto = nil

        // Ask you first: "Lock computer?" by text, and do what you answer.
        if ask {
            askToLock(photo: photoURL)
            return
        }

        if options.voice || options.alarm { media.unmute() }   // they need to hear it
        if options.alarm { playAlarm() }
        if options.voice { speak("Access denied.") }

        if options.faceUnlock {
            enterSoftLock(reason: "Intruder detected", stranger: true)
        } else {
            screenLocked = true
            if options.faceID {
                faceIDOverlay.failure("Not recognized")
                // Let the red cross play (the screen is already hidden), then lock.
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { lockScreen() }
            } else {
                lockScreen()
            }
        }

        if let to = options.textTo {
            let msg = "🚨 FaceAway: someone who isn't trusted sat down at your Mac at "
                + "\(clock.string(from: Date())). It's locked."
            DispatchQueue.main.async { textMe(to, message: msg, photo: photoURL) }
        }
    }

    /// Puts up FaceAway's Face ID lock screen; it opens when a trusted face looks at it.
    private func enterSoftLock(reason: String, stranger: Bool) {
        guard !softLocked else { return }
        // With Glance installed, the real Mac lock is used and Glance's Face ID (notch animation, ArcFace
        // recognition, liveness check) unlocks it. A stranger can't get past it.
        if glanceInstalled {
            hide(reason: reason)
            say(stranger ? "Stranger! Locking the Mac (Glance unlocks it for you)." : "Locking the Mac. Look at it to unlock with Glance.", stranger ? .alert : .info)
            EventLog.add("Locked for Glance: \(reason)")
            Bridge.emit(["type": stranger ? "stranger" : "locked"])
            screenLocked = true
            if reason != "Mac closed" { lockScreen() }   // closing the lid already locks it
            return
        }
        hide(reason: reason)
        softLocked = true
        holding = true
        softTrust = 0
        softStrangerStreak = 0
        softLockReadyAt = Date().addingTimeInterval(reason == "Lock key" || reason == "You texted lock" ? 3 : 1)
        textedThisLock = stranger && options.textTo != nil   // catchIntruder has just texted
        Bridge.emit(["type": stranger ? "stranger" : "locked"])
        strangerSince = stranger ? Date() : nil
        softLock.show()
        if options.faceID { faceIDOverlay.scanning() }   // Glance's pill opens and waits for your face
        updateCamera()
        onStateChange()
        if stranger {
            softLock.setMessage("Not recognized", alert: true)
            if options.faceID { faceIDOverlay.failure("Not recognized") }
        }
        say("\(reason) — locked. Look at the camera to unlock.", stranger ? .alert : .info)
        EventLog.add("Face-locked: \(reason)")
    }

    // "Lock computer?" by text
    private var asking = false
    private var askIsTest = false
    private var askTimer: Timer?
    private var askRow = -1
    private var askStarted = Date()
    private var strangerOKUntil = Date.distantPast   // you answered NO: don't ask again until then

    private func askToLock(photo: URL?) {
        guard let to = options.textTo, !asking else { return }
        asking = true
        askStarted = Date()
        askRow = textViaBridge ? 0 : (Replies.lastRow() ?? -1)
        var msg = "🚨 FaceAway: someone who isn't you is at your Mac (\(clock.string(from: Date()))). Lock computer? Reply Y or N."
        if options.askTimeout > 0 { msg += " If you don't answer in \(formatDuration(Int(options.askTimeout))), I'll lock it." }
        textMe(to, message: msg, photo: photo)
        say("Asked you by text whether to lock.", .alert)
        EventLog.add("Asked by text: lock computer?")
        Bridge.emit(["type": "asking"])
        if askRow < 0 {
            say("Can't read your replies: give FaceAway Full Disk Access (System Settings → Privacy & Security).", .alert)
            Bridge.emit(["type": "needFullDisk"])
        }
        askTimer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in self?.pollAnswer() }
    }

    private func pollAnswer() {
        guard asking, let to = options.textTo else { return }
        if textViaBridge {
            // Bbokari reads your reply and sends it back as an "answer" command
        } else if askRow >= 0 {
            let (answer, last) = Replies.answer(from: to, after: askRow)
            askRow = last
            if let lock = answer { finishAsk(lock: lock, timedOut: false); return }
        } else if let row = Replies.lastRow() {
            askRow = row   // access was just given: replies from now on count
        }
        if options.askTimeout > 0 && Date().timeIntervalSince(askStarted) >= options.askTimeout {
            finishAsk(lock: true, timedOut: true)
        }
    }

    private func finishAsk(lock: Bool, timedOut: Bool) {
        askTimer?.invalidate()
        askTimer = nil
        asking = false
        askIsTest = false
        guard let to = options.textTo else { return }
        if lock {
            EventLog.add(timedOut ? "No answer — locked" : "You answered YES — locked")
            enterSoftLock(reason: timedOut ? "No answer, locked" : "You said lock", stranger: true)
            textMe(to, message: timedOut ? "🔒 No answer, so I locked your Mac. Only your face opens it." : "🔒 Locked! Only your face opens it.", photo: nil)
        } else {
            strangerOKUntil = Date().addingTimeInterval(30 * 60)
            EventLog.add("You answered NO — left unlocked")
            Bridge.emit(["type": "allowed"])
            textMe(to, message: "👍 OK, I'll leave it unlocked and won't ask again for 30 minutes.", photo: nil)
        }
    }

    /// Text "lock" from your phone any time: the Face ID lock comes up.
    private var remoteRow = -1
    private var remoteTimer: Timer?
    func startRemoteLock() {
        guard let to = options.textTo, options.faceUnlock, !textViaBridge else { return }
        remoteRow = Replies.lastRow() ?? -1
        remoteTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            guard let self = self, !self.asking else { return }
            if self.remoteRow < 0 { self.remoteRow = Replies.lastRow() ?? -1; return }
            let (words, last) = Replies.words(from: to, after: self.remoteRow)
            self.remoteRow = last
            if words.contains(where: { ["lock", "bloquear", "bloquea"].contains($0) }) && !self.softLocked {
                EventLog.add("You texted LOCK")
                self.enterSoftLock(reason: "You texted lock", stranger: false)
                textMe(to, message: "🔒 Locked. Only your face opens it.", photo: nil)
            }
        }
    }

    /// Your Y / N, read by Bbokari.
    func answerFromBridge(lock: Bool) {
        guard asking else { return }
        finishAsk(lock: lock, timedOut: false)
    }

    /// Bbokari's "Try it" button: ask by text as if a stranger had sat down.
    func testAsk() {
        guard options.textTo != nil else { say("Set a number to text first (--text-me).", .alert); return }
        askToLock(photo: nil)
        askIsTest = asking
    }

    /// You came back while we were asking: never mind.
    private func cancelAsk() {
        guard asking else { return }
        askTimer?.invalidate()
        askTimer = nil
        asking = false
        EventLog.add("You're back — stopped asking")
        if let to = options.textTo { textMe(to, message: "👋 Never mind, it's you again.", photo: nil) }
    }

    /// You picked "Use Mac password" on the Face ID lock screen.
    private func usePassword() {
        guard softLocked, !screenLocked else { return }
        faceIDOverlay.dismissNow()
        EventLog.add("Switched to the Mac password")
        screenLocked = true
        lockScreen()
    }

    /// A stranger is at the Face ID lock screen: a photo and a text, once per lock.
    private var textedThisLock = false
    private func strangerAtLock(photo: Data?) {
        guard !textedThisLock else { return }
        textedThisLock = true
        var photoURL: URL?
        if options.photos, let data = photo ?? pendingPhoto, let url = Intruders.save(data) {
            photoURL = url
            intruderPhotos.append(url)
            EventLog.add("Photo: \(url.path)")
        }
        pendingPhoto = nil
        EventLog.add("Stranger tried to unlock with Face ID")
        Bridge.emit(["type": "stranger"])
        if let to = options.textTo {
            let msg = "🚨 FaceAway: someone who isn't you tried to unlock your Mac at \(clock.string(from: Date())). It stayed locked."
            textMe(to, message: msg, photo: photoURL)
        }
    }

    /// A stranger kept trying: hand over to the real macOS lock (password).
    private func escalateToMacLock() {
        guard softLocked, !screenLocked else { return }
        say("A stranger kept trying — switching to the Mac lock.", .alert)
        faceIDOverlay.dismissNow()
        EventLog.add("Stranger kept trying — Mac locked")
        screenLocked = true
        lockScreen()
    }

    private func softUnlock(_ name: String) {
        strangerSince = nil
        softLock.dismiss()
        softLocked = false
        softTrust = 0
        holding = false
        presentSinceTrusted = true
        graceUntil = Date().addingTimeInterval(options.grace)
        say("Unlocked by face: \(name).", .good)
        EventLog.add("Unlocked by face: \(name)")
        if options.faceID { faceIDOverlay.success("Unlocked") }
        unhide(fromKey: true)
        reportIntruders()
        updateCamera()
        onStateChange()
    }

    private func lockNow() {
        if glanceInstalled { enterSoftLock(reason: "Lock key", stranger: false); return }
        if options.faceUnlock && lockEnabled {
            enterSoftLock(reason: "Lock key", stranger: false)
            return
        }
        hide(reason: "Lock key")
        say("Locking the Mac.", .alert)
        EventLog.add("Locked with the panic key")
        screenLocked = true
        lockScreen()
    }

    /// The decoy the decoy key shows: your --decoy style, or the school portal if you didn't pick one.
    private lazy var panicDecoy: Decoy = decoy ?? Decoy(style: "school", schoolName: options.schoolName)

    /// Ctrl+Option+Cmd+D: cover the screen with the decoy right now; press again to come back.
    private func toggleDecoyPanic() {
        guard !softLocked else { return }   // only your face (or the Mac password) unlocks
        if holding {
            say("Decoy key: coming back.", .good)
            unhide(fromKey: true)
        } else {
            panicDecoy.show()
            hide(reason: "Decoy key")
            holding = true
        }
    }

    private func togglePanic(source: String) {
        guard !softLocked else { return }   // only your face (or the Mac password) unlocks
        if holding {
            say("\(source): coming back.", .good)
            unhide(fromKey: true)
        } else {
            hide(reason: source)
            holding = true
        }
    }

    private func unlocked() {
        Bridge.emit(["type": "unlocked"])
        screenLocked = false
        unknownStreak = 0
        lastAlone = Date()
        EventLog.add("Unlocked")
        if lockEnabled {
            graceUntil = Date().addingTimeInterval(options.grace)
            say("Unlocked. Not locking again for \(Int(options.grace)) s.", .good)
        }
        if softLocked {
            strangerSince = nil
            faceIDOverlay.dismissNow()
            softLock.dismiss()
            softLocked = false
            softTrust = 0
            holding = false
            unhide(fromKey: true)
            updateCamera()
            onStateChange()
        }
        reportIntruders()
    }

    private func reportIntruders() {
        if !intruderPhotos.isEmpty {
            let n = intruderPhotos.count
            say("⚠ \(n) intruder\(n == 1 ? "" : "s") while you were away. Showing the photos.", .alert)
            NSWorkspace.shared.activateFileViewerSelecting(intruderPhotos)
            if options.voice { speak("Warning. \(n) intruder\(n == 1 ? "" : "s") detected while you were away.") }
            intruderPhotos = []
        }
    }

    private func checkAbsence() {
        // lastCount is nil until the camera's first frame, so it doesn't trigger during warm-up.
        guard watching, !screenLocked, lastCount != nil else { return }
        let now = Date()
        // Gone means the latest frame showed nobody at all, or the camera stopped sending frames.
        let nobodyInFrame = lastCount == 0 && !lastBody
        let cameraStopped = now.timeIntervalSince(lastFrameAt) >= max(1.0, options.delay)
        let away = now.timeIntervalSince(lastAlone)
        // Like an iPhone: after you've been away a while, lock with the Face ID lock screen.
        if options.faceUnlock && lockEnabled && options.lockAfter > 0 && !softLocked
            && (nobodyInFrame || cameraStopped) && away >= options.lockAfter {
            enterSoftLock(reason: "You were away", stranger: false)
            return
        }
        guard !hidden, away >= options.delay else { return }
        if nobodyInFrame || cameraStopped { hide(reason: "No face") }
    }

    private func hide(reason: String) {
        guard !hidden else { return }
        hidden = true
        hiddenSince = Date()
        let started = Date()
        if options.goBack { rememberCurrent() }

        var done: [String] = []
        if let decoy = decoy {
            decoy.show()   // a local window: instant
            done.append("decoy up")
        }
        if tabEnabled {
            var ok = false
            if let script = armedScript { ok = execute(script, quiet: true) != nil }
            if !ok {
                // The tab moved or closed since the last refresh; look again and retry once.
                armedFor = nil
                armedScript = nil
                refresh()
                if let script = armedScript { ok = execute(script) != nil }
            }
            done.append(ok ? "switched" : "no tab matching \"\(needle)\"")
        }

        let ms = Int(Date().timeIntervalSince(started) * 1000)
        let what = done.isEmpty ? "hidden" : done.joined(separator: ", ")
        say("\(reason) — \(what)" + (options.verbose ? " in \(ms) ms." : "."), .alert)
        EventLog.add("\(reason) → \(what)")

        if options.mute { media.quiet() }   // after the switch, so it doesn't slow it down
    }

    private func unhide(fromKey: Bool = false) {
        let since = hiddenSince
        hidden = false
        holding = false
        hiddenSince = nil
        decoy?.dismiss()
        panicDecoy.dismiss()
        if options.mute { media.restore() }

        let away = since.map { Int(Date().timeIntervalSince($0)) } ?? 0
        let msg = "All clear." + (away >= 5 ? " You were away \(formatDuration(away))." : "")
        say(msg, .good)
        EventLog.add(msg)
        if options.voice && away >= 5 {
            let name = lastTrustedName.flatMap { ["me", "myself", "i"].contains($0.lowercased()) ? nil : $0 }
            speak(name.map { "Welcome back, \($0)." } ?? "Welcome back.")
        }
        if options.goBack { restorePrevious() }
        refresh()
    }

    // MARK: Displays

    private func statusText() -> String {
        let spin = ["◐", "◓", "◑", "◒"][Int(Date().timeIntervalSince1970 * 4) % 4]
        let count = lastCount ?? 0
        let threat: String
        if screenLocked { threat = "LOCKED" }
        else if unknownStreak > 0 { threat = "HIGH" }
        else if count >= 2 && !everyoneTrusted(count) { threat = "MEDIUM" }
        else if count == 0 { threat = "AWAY" }
        else { threat = "LOW" }

        var who = ""
        if lockEnabled, let first = lastMatches.first, let m = first {
            who = "  ID: " + (m.name.map { "\($0.uppercased()) \(m.percent)%" } ?? "UNKNOWN")
        }
        return "\(spin) SCANNING  FACES: \(count)\(who)  THREAT: \(threat)" + (hidden ? "  [HIDDEN]" : "")
    }

    private func updateDisplays(faces: [CGRect], imageSize: CGSize) {
        if let hud = hud {
            let labels: [(String, NSColor)] = faces.indices.map { i in
                guard lockEnabled else { return ("TARGET", .systemTeal) }
                guard i < lastMatches.count, let m = lastMatches[i] else { return ("SCANNING…", .systemYellow) }
                if let name = m.name { return ("\(name.uppercased()) ✓ \(m.percent)%", .systemGreen) }
                return ("UNKNOWN ✗", .systemRed)
            }
            hud.update(faces: faces, labels: labels, imageSize: imageSize, status: statusText())
        }
        if options.hacker && Date().timeIntervalSince(lastStatus) >= 0.25 {
            lastStatus = Date()
            setStatus(statusText())
        }
    }

    // MARK: --back

    /// Uses the last background snapshot, so remembering costs nothing at switch time.
    private func rememberCurrent() {
        previousAppBundleID = NSWorkspace.shared.frontmostApplication?.bundleIdentifier
        previousTab = nil
        if let front = windows.first,
           !(armedFor?.window == front.id && armedFor?.index == front.activeIndex) {
            previousTab = (front.id, front.activeIndex)
        }
    }

    private func restorePrevious() {
        if let tab = previousTab {
            runAppleScript("""
            tell application \(asQuoted(browser.appName))
                try
                    set w to window id \(tab.window)
                    \(browser.selectTab(window: "w", index: tab.index))
                    set index of w to 1
                end try
            end tell
            """)
        }
        if let id = previousAppBundleID {
            runAppleScript("tell application id \(asQuoted(id)) to activate")
        }
    }
}

// MARK: - Main

/// Asks for camera access if needed, then calls `start` on the main thread.
func withCamera(_ start: @escaping () -> Void) {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
        start()
    case .notDetermined:
        AVCaptureDevice.requestAccess(for: .video) { granted in
            DispatchQueue.main.async {
                if granted { start() }
                else { fail("Camera access was denied. Allow it in System Settings → Privacy & Security → Camera.") }
            }
        }
    default:
        fail("No camera access. Allow your terminal app in System Settings → Privacy & Security → Camera, then try again.")
    }
}

let options = parseOptions()
hackerMode = options.hacker
let app = NSApplication.shared
app.setActivationPolicy(.accessory) // no Dock icon, but allowed to show windows

// Kept alive for the life of the program.
var enroller: Enroller?
var checker: Checker?
var controller: Controller?
var homeScreen: HomeScreen?
/// Glance (face unlock for the Mac, MIT, © Jonathan Zhou: github.com/jonnyoo/glance) does the Face ID unlocking
/// when it's installed: FaceAway locks the real Mac and Glance's recognition and notch animation let you back in.
var glanceInstalled: Bool { false }   // FaceAway has Glance's recognition built in now (GlanceFace.swift)

/// The bridge to Bbokari (the desktop pet): FaceAway appends events to a shared folder and runs the commands
/// Bbokari appends there. Events: watching, stranger, locked, unlocked, panic, panicEnd, theme.
enum Bridge {
    static let folder = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Application Support/FaceAway/bridge", isDirectory: true)
    static let events = folder.appendingPathComponent("events.jsonl")
    static let commands = folder.appendingPathComponent("commands.jsonl")
    static var commandOffset: UInt64 = 0
    static var timer: Timer?

    static func emit(_ event: [String: Any]) {
        var e = event
        e["at"] = Int(Date().timeIntervalSince1970 * 1000)
        guard JSONSerialization.isValidJSONObject(e), var data = try? JSONSerialization.data(withJSONObject: e) else { return }
        data.append(0x0A)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        if let handle = try? FileHandle(forWritingTo: events) {
            handle.seekToEndOfFile()
            handle.write(data)
            handle.closeFile()
        } else {
            try? data.write(to: events)
        }
    }

    /// Reads Bbokari's new commands twice a second and hands each one to `run`.
    static func listen(_ run: @escaping ([String: Any]) -> Void) {
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let size = (try? FileManager.default.attributesOfItem(atPath: commands.path)[.size] as? NSNumber)?.uint64Value ?? 0
        commandOffset = size   // only commands from now on
        timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { _ in
            guard let handle = try? FileHandle(forReadingFrom: commands) else { return }
            defer { handle.closeFile() }
            let end = handle.seekToEndOfFile()
            if end < commandOffset { commandOffset = 0 }
            guard end > commandOffset else { return }
            handle.seek(toFileOffset: commandOffset)
            let data = handle.readDataToEndOfFile()
            guard let text = String(data: data, encoding: .utf8), let lastNewline = text.lastIndex(of: "\n") else { return }
            let complete = String(text[..<lastNewline])
            commandOffset += UInt64(complete.utf8.count + 1)
            for line in complete.split(separator: "\n") {
                if let d = line.data(using: .utf8), let obj = try? JSONSerialization.jsonObject(with: d) as? [String: Any] { run(obj) }
            }
        }
    }
}

var panicScreen: PanicScreen?
var statusMenu: StatusMenu?
let panicButton = PanicButton()

/// Starts the home screen, the floating panic button and the panic key, if asked for.
func startHomeAndPanic() {
    guard options.home || options.panicButton else { return }
    guard PasswordStore.isSet else {
        fail("Choose a password for the panic screen first: ./faceaway --set-password")
    }
    let screen = PanicScreen(hacker: (options.theme ?? HomeConfig.load(apps: []).theme) == "hacker")
    panicScreen = screen
    let panic = {
        guard let s = panicScreen, !s.isShowing else { return }
        say("Panic! Screen locked until your password is entered.", .alert)
        EventLog.add("Panic screen shown")
        s.show()
    }
    if options.home {
        let home = HomeScreen(theme: options.theme)
        home.onPanic = panic
        home.show()
        homeScreen = home
        screen.hacker = home.config.theme == "hacker"
        say("Home screen on (theme: \(home.config.theme)). Click ⚙️ on it to customize.", .good)
    }
    if options.panicButton {
        panicButton.show(hacker: screen.hacker, onClick: panic)
        say("Panic button on: bottom right of the screen. Drag it anywhere.", .good)
    }
    if options.hotkeys {
        registerHotKeys([(keyCode: kVK_ANSI_P, action: panic)])
        say("Ctrl+Option+Cmd+P also shows the panic screen.")
    }
}

switch options.mode {
case .people:
    let people = FaceStore.loadAll()
    if people.isEmpty { print("No one added yet. Add yourself with: ./faceaway --add \"Me\"") }
    for p in people { print("\(p.name)  (\(p.prints.count) samples)") }
    exit(0)

case .remove(let name):
    if FaceStore.remove(name) { print("Removed \"\(name)\".") }
    else { fail("No one called \"\(name)\". See ./faceaway --people") }
    exit(0)

case .list:
    let b = options.browser ?? Browser.autodetect()
    let tabs = snapshot(b, using: compileScript(b.snapshotScript)).flatMap(\.tabs)
    if tabs.isEmpty { print("No open tabs found in \(b.appName).") }
    for t in tabs { print("\(t.title)\t\(t.url)") }
    exit(0)

case .log:
    let lines = EventLog.tail(50)
    print(lines.isEmpty ? "No events yet." : lines.joined(separator: "\n"))
    exit(0)

case .intruders:
    try? FileManager.default.createDirectory(at: Intruders.folder, withIntermediateDirectories: true)
    NSWorkspace.shared.open(Intruders.folder)
    exit(0)

case .setPassword:
    print("Choose a password for FaceAway's panic screen (not your Mac password).")
    guard let first = getpass("New password: ").map({ String(cString: $0) }), first.count >= 4 else {
        fail("Use at least 4 characters.")
    }
    guard let second = getpass("Type it again: ").map({ String(cString: $0) }), second == first else {
        fail("The two passwords didn't match. Try again.")
    }
    do { try PasswordStore.set(first) } catch { fail("Couldn't save it: \(error.localizedDescription)") }
    print("Saved. Try it: ./faceaway --home-only --panic-button")
    exit(0)

case .setPasswordStdin:
    guard let pw = readLine(strippingNewline: true), pw.count >= 4 else { fail("Use at least 4 characters.") }
    do { try PasswordStore.set(pw) } catch { fail("Couldn't save it: \(error.localizedDescription)") }
    print("Saved.")
    exit(0)

case .hackerMac(let on):
    if on { HackerMac.apply() } else { HackerMac.restore() }
    exit(0)

case .app:
    let browser = options.browser ?? Browser.autodetect()
    var appOptions = options
    let people = FaceStore.loadAll()
    // Sensible defaults for the menu bar app: Face ID lock on lid close, decoy unless a tab was given.
    if !people.isEmpty { appOptions.faceUnlock = true; appOptions.faceID = true }
    let needle = options.needle ?? options.openURL ?? ""
    if !options.guardMode {   // the old menu bar app: hide with the school decoy, no away-lock
        appOptions.lockAfter = 0
        if needle.isEmpty && appOptions.decoy == nil { appOptions.decoy = "school" }
    }
    textViaBridge = options.textViaBridge   // before start(): Bbokari does the texting
    controller = Controller(options: appOptions, browser: browser, needle: needle, openURL: options.openURL,
                            people: people, watching: options.startWatching)
    withCamera {
        guard let c = controller else { return }
        c.start()
        startHomeAndPanic()
        statusItemHidden = options.noStatusItem
        let menu = StatusMenu(controller: c)
        if let s = panicScreen {
            menu.panic = { if !s.isShowing { s.show() } }
        }
        do {
            menu.homeToggle = {
                if homeScreen == nil { homeScreen = HomeScreen(theme: options.theme) }
                guard let h = homeScreen else { return }
                if h.isShowing { h.hide() } else {
                    h.onPanic = { if let s = panicScreen, !s.isShowing { s.show() } }
                    h.show()
                }
                statusMenu?.rebuild()
            }
            menu.homeShowing = { homeScreen?.isShowing ?? false }
            menu.setTheme = { theme in
                if homeScreen == nil { homeScreen = HomeScreen(theme: nil) }
                guard let h = homeScreen else { return }
                h.onPanic = { if let s = panicScreen, !s.isShowing { s.show() } }
                h.setTheme(theme)
                if !h.isShowing { h.show() }
                hackerMode = theme == "hacker"
                panicScreen?.hacker = theme == "hacker"
                say("Theme: \(theme).", .good)
                statusMenu?.rebuild()
            }
            menu.currentTheme = { homeScreen?.config.theme ?? HomeConfig.load(apps: []).theme }
        }
        c.onStateChange = { statusMenu?.rebuild() }
        statusMenu = menu
        menu.rebuild()
        // Bbokari (the desktop pet) can drive FaceAway from its own menu
        Bridge.listen { cmd in
            switch cmd["type"] as? String ?? "" {
            case "panic": menu.panic?()
            case "home": menu.homeToggle?()
            case "theme": if let name = cmd["name"] as? String { menu.setTheme?(name) }
            case "watch": c.setWatching(cmd["on"] as? Bool ?? !c.watching)
            case "lock": c.lockNowFromMenu()
            case "decoy": if let name = cmd["name"] as? String { c.setDecoy(name) }
            case "testAsk": c.testAsk()
            case "answer": c.answerFromBridge(lock: cmd["lock"] as? Bool ?? true)
            default: break
            }
        }
        Bridge.emit(["type": "theme", "name": menu.currentTheme()])
        Bridge.emit(["type": "watching", "on": c.watching])
        say("FaceAway is in your menu bar (the eye icon). Everything is off until you turn it on.", .good)
        if !people.isEmpty {
            say("Face ID lock: closing the lid locks the screen; opening it unlocks when it sees you.", .good)
        } else {
            say("Tip: add your face (./faceaway --add \"Me\") to get the Face ID lock when you close the lid.")
        }
    }

case .homeOnly:
    if options.hacker { bootSequence(profiles: 0) }
    startHomeAndPanic()
    say("Running. Press Ctrl+C to stop.", .good)

case .enroll(let name):
    enroller = Enroller(name: name, options: options)
    withCamera { enroller?.start() }

case .check:
    let people = FaceStore.loadAll()
    if people.isEmpty { fail("No one added yet. Add yourself first with: ./faceaway --add \"Me\"") }
    checker = Checker(people: people, options: options)
    withCamera { checker?.start() }

case .run:
    let browser = options.browser ?? Browser.autodetect()
    var needle = options.needle ?? options.openURL ?? ""
    var openURL = options.openURL
    if needle.isEmpty && options.decoy == nil {
        let tab = pickTab(browser)
        needle = baseURL(tab.url)
        openURL = tab.url // reopen it if you close it later
        print("\nTarget: \(tab.title)")
    }
    let people = FaceStore.loadAll()
    let lockOn = options.lock && !people.isEmpty

    if options.hacker { bootSequence(profiles: lockOn ? people.count : 0) }
    if !needle.isEmpty { say("Using \(browser.appName). Target: \"\(needle)\"") }
    if let style = options.decoy { say("Decoy screen: \(style).") }
    say("Hides after \(options.delay) s without your face"
        + (options.watchOthers ? ", or as soon as someone else appears." : "."))
    if lockOn {
        say("Trusted people: \(people.map(\.name).joined(separator: ", ")). Anyone else at the Mac locks it.")
        if options.photos { say("Intruder photos go to ~/Pictures/FaceAway Intruders.") }
        if let to = options.textTo { say("Will text \(to) when someone's caught.") }
    } else if options.lock {
        say("Tip: add yourself with --add \"Me\" to lock the Mac when a stranger sits down.")
    }
    if options.faceUnlock && lockOn {
        say("Face unlock on: locks after \(Int(options.lockAfter)) s away, opens when it sees you. No password.", .good)
    } else if options.faceUnlock {
        say("Face unlock needs your face first: run ./faceaway --add \"Me\"", .alert)
    }
    if options.hotkeys { say("Panic keys: Ctrl+Option+Cmd+H hides, +L locks, +D shows the decoy.") }
    if options.gestures { say("Gestures: show your palm to hide (again to undo), or cover the camera.") }
    if options.goBack { say("Will return to where you were when you're back.") }

    controller = Controller(options: options, browser: browser, needle: needle,
                            openURL: openURL, people: people)
    withCamera {
        controller?.start()
        startHomeAndPanic()
        say("Running. Press Ctrl+C to stop.", .good)
        EventLog.add("FaceAway started")
    }
}

app.run()
