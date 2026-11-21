//
//  GlanceUI.swift — FaceAway's Face ID look and face setup, taken from Glance
//  (MIT License, © 2026 Jonathan Zhou — github.com/jonnyoo/glance, see LICENSE-glance.txt).
//
//  Ported from Glance: GlanceTheme, AnimatedCheckmark, EnrollmentRingView, EnrollmentDirectionSweep,
//  EnrollmentSweepWindowController, ScanAnimationView, NotchShape's pill, NotchGeometry's pill sizes, and the
//  nine-pose enrollment logic from OnboardingController.
//  Changes for FaceAway: the panel always wears Glance's "pill" style (for Macs without a notch — it floats at the
//  top centre of the screen like a Dynamic Island), it runs on FaceAway's camera, and the videos are loaded from
//  next to the program instead of an app bundle.
//

import AppKit
import AVFoundation
import SwiftUI
import Vision

// MARK: - Theme (Glance: GlanceTheme.swift)

enum GlanceTheme {
    private static let accentRGB = (r: 0x34 / 255.0, g: 0x99 / 255.0, b: 0xFF / 255.0)
    static let accent = Color(red: accentRGB.r, green: accentRGB.g, blue: accentRGB.b)

    /// White at 0, `accent` at 1.
    static func whiteToAccent(_ t: Double) -> Color {
        let t = min(max(t, 0), 1)
        return Color(
            red: 1 + (accentRGB.r - 1) * t,
            green: 1 + (accentRGB.g - 1) * t,
            blue: 1 + (accentRGB.b - 1) * t
        )
    }
    static let accentPale   = Color(red: 0xCF / 255, green: 0xE7 / 255, blue: 0xFF / 255)
    static let accentBright = Color(red: 0x7F / 255, green: 0xC2 / 255, blue: 0xFF / 255)
    static let accentDeep   = Color(red: 0x1F / 255, green: 0x6B / 255, blue: 0xD1 / 255)
    static let panel = Color.black
    static let statusGranted = Color(red: 0x30 / 255, green: 0xD1 / 255, blue: 0x58 / 255)
    static let statusDenied = Color(red: 0xFF / 255, green: 0x45 / 255, blue: 0x3A / 255)
    static let instructionFont = Font.system(size: 15, weight: .medium)
}

// MARK: - Sizes and timings (Glance: OnboardingMetrics.swift, NotchGeometry.swift — pill values)

enum GlanceMetrics {
    static let stepAnimation = Animation.spring(response: 0.42, dampingFraction: 0.8)

    static let enrollPanelWidth: CGFloat = 320
    static let pillEnrollHeight: CGFloat = 350
    static let enrollPanelCornerRadius: CGFloat = 40

    static let cameraCircleDiameter: CGFloat = 185
    static let tickRingOuterDiameter: CGFloat = 200
    static let tickCount = 80
    static let ticksPerSector = 10
    static let turnIndicatorTickSpan = 6
    static let turnIndicatorLengthBoost: CGFloat = 5
    static let tickLengthUnlit: CGFloat = 12
    static let tickLengthLit: CGFloat = 20
    static let tickWidth: CGFloat = 2.4
    static let completionRingWidth: CGFloat = 14
    static let completionRingRadiusInset: CGFloat = 8
    static var tickWidthComplete: CGFloat { 2 * .pi * (tickRingOuterDiameter / 2) / CGFloat(tickCount) * 1.2 }
    static let tickStagger: Double = 0.008
    static var enrollCameraClusterDiameter: CGFloat { tickRingOuterDiameter + tickLengthLit * 2 }

    static let guideOverlayFadeOut: Double = 0.35
    static let previewFadeOut: Double = 0.4
    static let checkmarkDelay: Double = 0.2
    static let checkmarkDrawDuration: Double = 0.28

    static let enrollInstructionBottomPadding: CGFloat = 30
    static let enrollInstructionHorizontalPadding: CGFloat = 20
    static let enrollCameraTopPaddingPill: CGFloat = 30
    static let enrollCloseButtonSize: CGFloat = 28
    static let enrollCloseButtonEdgePadding: CGFloat = 18
    static let enrollTooFarChevronSize: CGFloat = 32
    static let enrollInstructionFadeIn: Double = 0.3
    static let enrollInstructionFadeOut: Double = 0.35

    static let sweepMasterOpacity: Double = 0.6
    static let sweepFadeIn: Double = 0.5
    static let sweepFadeOut: Double = 0.35
    static let sweepDirectionCrossfade: Double = 0.25
    static let sweepPoseDelay: Double = 0.36

    // The pill (no notch): closed and open sizes, gap from the top of the screen.
    static let pillClosedSize = CGSize(width: 80, height: 24)
    static let pillOpenSize = CGSize(width: 180, height: 180)
    static let pillTopGap: CGFloat = 3
    static let pillOpenCornerRadius: CGFloat = 48
    static let pillContentPadding: CGFloat = 32
    static let pillShadowPadding: CGFloat = 24
}

/// Finds Glance's videos and pictures: next to the program, or in ~/FaceAway.
enum GlanceResources {
    static func url(_ name: String, _ ext: String) -> URL? {
        var places: [URL] = []
        if let exe = Bundle.main.executableURL?.resolvingSymlinksInPath() { places.append(exe.deletingLastPathComponent()) }
        places.append(FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("FaceAway"))
        places.append(URL(fileURLWithPath: FileManager.default.currentDirectoryPath))
        for dir in places {
            let u = dir.appendingPathComponent("\(name).\(ext)")
            if FileManager.default.fileExists(atPath: u.path) { return u }
        }
        return Bundle.main.url(forResource: name, withExtension: ext)
    }

    /// The screen the pill floats on: the one with the menu bar.
    static func screen() -> NSScreen? { NSScreen.screens.first ?? NSScreen.main }
}

// MARK: - Animated checkmark (Glance: AnimatedCheckmark.swift)

private struct CheckmarkShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let w = rect.width
        let h = rect.height
        path.move(to: CGPoint(x: w * 0.16, y: h * 0.52))
        path.addLine(to: CGPoint(x: w * 0.40, y: h * 0.78))
        path.addLine(to: CGPoint(x: w * 0.86, y: h * 0.22))
        return path
    }
}

struct AnimatedCheckmark: View {
    var color: Color = GlanceTheme.accent
    var lineWidth: CGFloat = 6

    @State private var progress: CGFloat = 0

    var body: some View {
        CheckmarkShape()
            .trim(from: 0, to: progress)
            .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round, lineJoin: .round))
            .onAppear {
                withAnimation(.timingCurve(0.65, 0.0, 0.35, 1.0, duration: GlanceMetrics.checkmarkDrawDuration)) {
                    progress = 1
                }
            }
    }
}

// MARK: - Enrollment poses (Glance: OnboardingController.swift)

/// A single guided head pose captured during enrollment — center plus the 8 compass directions, in order.
enum EnrollmentPose: Int, CaseIterable {
    case center, left, topLeft, top, topRight, right, bottomRight, bottom, bottomLeft

    enum YawBand { case left, none, right }
    enum PitchBand { case up, none, down }

    var yawBand: YawBand {
        switch self {
        case .left, .topLeft, .bottomLeft: return .left
        case .right, .topRight, .bottomRight: return .right
        case .center, .top, .bottom: return .none
        }
    }

    var pitchBand: PitchBand {
        switch self {
        case .top, .topLeft, .topRight: return .up
        case .bottom, .bottomLeft, .bottomRight: return .down
        case .center, .left, .right: return .none
        }
    }

    /// Compass angle (0 = up, clockwise) this pose's ring sector is centered on; nil for center.
    var compassAngle: Double? {
        switch self {
        case .center: return nil
        case .left: return 270
        case .topLeft: return 315
        case .top: return 0
        case .topRight: return 45
        case .right: return 90
        case .bottomRight: return 135
        case .bottom: return 180
        case .bottomLeft: return 225
        }
    }

    var instruction: String {
        switch self {
        case .center: return "Look straight at the camera"
        case .left: return "Turn your head slightly left"
        case .topLeft: return "Turn your head to the top left"
        case .top: return "Turn your head slightly up"
        case .topRight: return "Turn your head to the top right"
        case .right: return "Turn your head slightly right"
        case .bottomRight: return "Turn your head to the bottom right"
        case .bottom: return "Turn your head slightly down"
        case .bottomLeft: return "Turn your head to the bottom left"
        }
    }

    /// Relaxes this pose's yaw/pitch bands, so >1 is easier.
    var matchLeniency: Float {
        switch self {
        case .bottomLeft, .bottomRight: return 1.5
        case .bottom: return 1.2
        default: return 1
        }
    }
}

enum ExcessiveTurn: Equatable {
    case left, topLeft, up, topRight, right, bottomRight, down, bottomLeft

    var instruction: String {
        switch self {
        case .left: return "Too far left"
        case .topLeft: return "Too far toward the top left"
        case .up: return "Too far up"
        case .topRight: return "Too far toward the top right"
        case .right: return "Too far right"
        case .bottomRight: return "Too far toward the bottom right"
        case .down: return "Too far down"
        case .bottomLeft: return "Too far toward the bottom left"
        }
    }
}

/// Glance's pose-matching bands, in radians. Yaw: a left turn is positive. Pitch: looking up is negative.
enum GlancePoseBands {
    static let yawInnerThreshold: Float = 0.24
    static let yawCenterTolerance: Float = 0.18
    static let yawOuterCap: Float = 0.51
    static let pitchInnerThreshold: Float = 0.17
    static let pitchCenterTolerance: Float = 0.15
    static let pitchOuterCap: Float = 0.37
    static let stallWidenFactor: Float = 1.25

    static func matches(yaw: Float, pitch: Float, pose: EnrollmentPose, widened: Bool) -> Bool {
        let factor = (widened ? stallWidenFactor : 1.0) * pose.matchLeniency
        let yawOK: Bool
        switch pose.yawBand {
        case .none: yawOK = abs(yaw) < yawCenterTolerance * factor
        case .left: yawOK = yaw > yawInnerThreshold / factor && yaw < yawOuterCap
        case .right: yawOK = yaw < -yawInnerThreshold / factor && yaw > -yawOuterCap
        }
        let pitchOK: Bool
        switch pose.pitchBand {
        case .none: pitchOK = abs(pitch) < pitchCenterTolerance * factor
        case .up: pitchOK = pitch < -pitchInnerThreshold / factor && pitch > -pitchOuterCap
        case .down: pitchOK = pitch > pitchInnerThreshold / factor && pitch < pitchOuterCap
        }
        return yawOK && pitchOK
    }

    static func excessive(yaw: Float, pitch: Float) -> ExcessiveTurn? {
        let yawOvershoot = abs(yaw) / yawOuterCap
        let pitchOvershoot = abs(pitch) / pitchOuterCap
        guard max(yawOvershoot, pitchOvershoot) >= 1 else { return nil }
        if yawOvershoot >= 1, pitchOvershoot >= 1 {
            switch (yaw > 0, pitch < 0) {
            case (true, true): return .topLeft
            case (false, true): return .topRight
            case (false, false): return .bottomRight
            case (true, false): return .bottomLeft
            }
        }
        if yawOvershoot >= pitchOvershoot { return yaw > 0 ? .left : .right }
        return pitch < 0 ? .up : .down
    }
}

// MARK: - What the setup screen shows (the parts of Glance's OnboardingController its views read)

final class GlanceEnrollModel: ObservableObject {
    @Published var poseIndex = 0
    @Published var capturedPoses: Set<EnrollmentPose> = []
    @Published var centerPulseTick = 0
    @Published var enrollmentComplete = false
    @Published var guideVisible = true
    @Published var cameraPreviewVisible = true
    @Published var showCheckmark = false
    @Published var faceDetected = false
    @Published var isTooFar = false
    @Published var excessiveTurn: ExcessiveTurn?
    @Published var currentYaw: Float?
    @Published var currentPitch: Float?
    @Published var shown = false
    var onClose: () -> Void = {}

    var currentPose: EnrollmentPose? { EnrollmentPose(rawValue: poseIndex) }

    var enrollmentInstruction: String {
        if enrollmentComplete { return "Face captured" }
        if let excessiveTurn { return excessiveTurn.instruction }
        if isTooFar { return "Bring your face closer" }
        if !faceDetected { return "Look at the camera" }
        return currentPose?.instruction ?? ""
    }

    struct HeadTurn: Equatable {
        let angle: Double
        let progress: Double
    }

    /// Live head direction for the ring's indicator, normalised against the current pose's thresholds.
    var headTurn: HeadTurn? {
        guard !enrollmentComplete, faceDetected, !isTooFar, excessiveTurn == nil,
              let pose = currentPose, pose != .center,
              let yaw = currentYaw, let pitch = currentPitch else { return nil }
        let x = Double(-yaw / (GlancePoseBands.yawInnerThreshold / pose.matchLeniency))
        let y = Double(-pitch / (GlancePoseBands.pitchInnerThreshold / pose.matchLeniency))
        let magnitude = (x * x + y * y).squareRoot()
        guard magnitude > 0.15 else { return nil }
        let degrees = atan2(x, y) * 180 / .pi
        return HeadTurn(angle: degrees < 0 ? degrees + 360 : degrees, progress: min(magnitude, 1))
    }
}

// MARK: - The ring (Glance: EnrollmentRingView.swift)

struct EnrollmentRingView: View {
    @ObservedObject var controller: GlanceEnrollModel

    @State private var pulseActive = false

    private var diameter: CGFloat { GlanceMetrics.tickRingOuterDiameter }
    private var radius: CGFloat { diameter / 2 }
    private var isComplete: Bool { controller.enrollmentComplete }

    var body: some View {
        let turn = controller.headTurn
        ZStack {
            ForEach(0..<GlanceMetrics.tickCount, id: \.self) { index in
                let intensity = turnIntensity(for: index, turn: turn)
                let length = length(for: index, intensity: intensity)
                Capsule()
                    .fill(color(for: index, intensity: intensity))
                    .frame(width: width(for: index), height: length)
                    .offset(y: -(radius + length / 2))
                    .rotationEffect(.degrees(angle(for: index)))
                    .opacity(isComplete ? 0 : 1)
                    .animation(
                        .easeOut(duration: 0.3).delay(Double(index % GlanceMetrics.ticksPerSector) * GlanceMetrics.tickStagger),
                        value: isLit(index)
                    )
                    .animation(.easeOut(duration: 0.22), value: pulseActive)
                    .animation(.easeOut(duration: 0.15), value: intensity)
                    .animation(.easeInOut(duration: 0.45).delay(Double(index) * 0.004), value: isComplete)
            }

            let ring = diameter + 2 * (GlanceMetrics.tickLengthLit - GlanceMetrics.completionRingRadiusInset) - GlanceMetrics.completionRingWidth
            Circle()
                .stroke(GlanceTheme.accent, lineWidth: GlanceMetrics.completionRingWidth)
                .frame(width: ring, height: ring)
                .opacity(isComplete ? 1 : 0)
                .scaleEffect(isComplete ? 1 : 0.92)
                .animation(.easeInOut(duration: 0.45), value: isComplete)
        }
        .frame(width: diameter, height: diameter)
        .onChange(of: controller.centerPulseTick) { _, _ in triggerPulse() }
    }

    private func angle(for index: Int) -> Double {
        Double(index) * (360.0 / Double(GlanceMetrics.tickCount))
    }

    private func sectorPose(for index: Int) -> EnrollmentPose? {
        let raw = Int((angle(for: index) / 45.0).rounded()) % 8
        let sectorAngle = Double(raw) * 45
        return EnrollmentPose.allCases.first { $0.compassAngle == sectorAngle }
    }

    private func isLit(_ index: Int) -> Bool {
        if isComplete { return true }
        guard let pose = sectorPose(for: index) else { return false }
        return controller.capturedPoses.contains(pose)
    }

    private func length(for index: Int, intensity: Double) -> CGFloat {
        if isLit(index) || pulseActive { return GlanceMetrics.tickLengthLit }
        return GlanceMetrics.tickLengthUnlit + GlanceMetrics.turnIndicatorLengthBoost * intensity
    }

    private func width(for index: Int) -> CGFloat {
        isComplete ? GlanceMetrics.tickWidthComplete : GlanceMetrics.tickWidth
    }

    private func color(for index: Int, intensity: Double) -> Color {
        if isLit(index) || isComplete { return GlanceTheme.accent }
        return GlanceTheme.whiteToAccent(intensity)
    }

    private func turnIntensity(for index: Int, turn: GlanceEnrollModel.HeadTurn?) -> Double {
        guard let turn, !isComplete, !isLit(index) else { return 0 }
        var delta = abs(angle(for: index) - turn.angle)
        if delta > 180 { delta = 360 - delta }
        let degreesPerTick = 360.0 / Double(GlanceMetrics.tickCount)
        let halfSpan = Double(GlanceMetrics.turnIndicatorTickSpan) / 2
        let falloff = max(0, 1 - (delta / degreesPerTick) / halfSpan)
        return turn.progress * falloff
    }

    private func triggerPulse() {
        Task { @MainActor in
            pulseActive = true
            try? await Task.sleep(nanoseconds: 220_000_000)
            pulseActive = false
        }
    }
}

// MARK: - The blue light sweep (Glance: EnrollmentDirectionSweep.swift)

enum EnrollmentSweepDirection: CaseIterable, Hashable {
    case left, right, up, down, topLeft, topRight, bottomLeft, bottomRight

    /// Unit travel vector in screen space (x right, y down).
    var travel: CGVector {
        let d = CGFloat(1 / sqrt(2.0))
        switch self {
        case .left:        return CGVector(dx: -1, dy:  0)
        case .right:       return CGVector(dx:  1, dy:  0)
        case .up:          return CGVector(dx:  0, dy: -1)
        case .down:        return CGVector(dx:  0, dy:  1)
        case .topLeft:     return CGVector(dx: -d, dy: -d)
        case .topRight:    return CGVector(dx:  d, dy: -d)
        case .bottomLeft:  return CGVector(dx: -d, dy:  d)
        case .bottomRight: return CGVector(dx:  d, dy:  d)
        }
    }

    init?(pose: EnrollmentPose) {
        switch pose {
        case .center:      return nil
        case .left:        self = .left
        case .right:       self = .right
        case .top:         self = .up
        case .bottom:      self = .down
        case .topLeft:     self = .topLeft
        case .topRight:    self = .topRight
        case .bottomLeft:  self = .bottomLeft
        case .bottomRight: self = .bottomRight
        }
    }
}

struct EnrollmentDirectionSweep: View {
    let direction: EnrollmentSweepDirection

    var body: some View {
        GeometryReader { geo in
            ZStack {
                ForEach(Self.specs) { spec in
                    SweepStreak(spec: spec, direction: direction, canvasSize: geo.size)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .opacity(GlanceMetrics.sweepMasterOpacity)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

private struct StreakSpec: Identifiable {
    let id: Int
    let thickness: CGFloat
    let lengthFactor: CGFloat
    let blurScale: CGFloat
    let peakOpacity: Double
    let duration: Double
    let delay: Double
    let lateral: CGFloat
    let bow: CGFloat
    let fadeOutAt: Double
    let hasHighlight: Bool
    let isVivid: Bool
}

extension EnrollmentDirectionSweep {
    /// 42 ribbons fanned across a fixed perpendicular span.
    fileprivate static let specs: [StreakSpec] = makeSpecs()

    private static func makeSpecs() -> [StreakSpec] {
        let count = 42
        let laterals = (0..<count).map { index -> CGFloat in
            let t = CGFloat(index) / CGFloat(count - 1)
            return -0.86 + t * 1.72
        }
        let thick: [CGFloat] = [310, 190, 105, 155, 72, 230, 88]
        let lengths: [CGFloat] = [1.16, 0.94, 0.72, 0.86, 0.54, 1.04, 0.62]
        let blurs: [CGFloat] = [1.35, 1.16, 0.96, 1.22, 0.82, 1.32, 1.02]
        let peaks: [Double] = [0.58, 0.72, 0.80, 0.52, 0.66, 0.42, 0.48]
        let durations: [Double] = [1.22, 1.08, 0.98, 1.16, 0.94, 1.28, 1.04]
        let delays: [Double] = [0.00, 0.03, 0.06, 0.015, 0.08, 0.04, 0.065]
        let bows: [CGFloat] = [0.18, -0.14, 0.10, -0.22, 0.26, 0.08, -0.12]
        var out: [StreakSpec] = []
        for (index, lateral) in laterals.enumerated() {
            let lane = index % 7
            let edgeFade = 1 - abs(Double(lateral)) * 0.22
            let isVivid = index % 6 == 1 || index % 6 == 4
            let heavyBlur = index % 4 != 0
            let blurScale: CGFloat = blurs[lane] * (heavyBlur ? 2.6 : 1.1)
            out.append(StreakSpec(
                id: index,
                thickness: thick[lane],
                lengthFactor: lengths[lane],
                blurScale: blurScale,
                peakOpacity: peaks[lane] * edgeFade * (isVivid ? 1.4 : 1),
                duration: durations[lane],
                delay: delays[lane] + Double(index % 4) * 0.008,
                lateral: lateral,
                bow: bows[lane],
                fadeOutAt: 1,
                hasHighlight: isVivid || lane == 2 || lane == 4,
                isVivid: isVivid
            ))
        }
        return out
    }
}

private struct SweepGeometry {
    let start: CGPoint
    let end: CGPoint
    let control: CGPoint
    let canvasSize: CGSize
    let length: CGFloat
    let rotationDrift: Double

    init(spec: StreakSpec, direction: EnrollmentSweepDirection, canvasSize: CGSize) {
        self.canvasSize = canvasSize
        let travel = direction.travel
        let perp = CGVector(dx: -travel.dy, dy: travel.dx)
        let shortEdge = min(canvasSize.width, canvasSize.height)
        let diagonal = hypot(canvasSize.width, canvasSize.height)
        let startSpan = diagonal * 0.58
        let endSpan = diagonal * 0.50
        length = max(shortEdge * spec.lengthFactor * 0.55, 180)
        let cx = canvasSize.width / 2
        let cy = canvasSize.height / 2
        let perpExtent = abs(perp.dx) * canvasSize.width + abs(perp.dy) * canvasSize.height
        let lateral = spec.lateral * perpExtent * 0.46
        start = CGPoint(x: cx - travel.dx * startSpan + perp.dx * lateral, y: cy - travel.dy * startSpan + perp.dy * lateral)
        end = CGPoint(x: cx + travel.dx * endSpan + perp.dx * lateral, y: cy + travel.dy * endSpan + perp.dy * lateral)
        let mid = CGPoint(x: (start.x + end.x) / 2, y: (start.y + end.y) / 2)
        let bow = spec.bow * shortEdge * 0.20
        control = CGPoint(x: mid.x + perp.dx * bow, y: mid.y + perp.dy * bow)
        rotationDrift = spec.bow < 0 ? -0.05 : 0.05
    }

    func point(at t: Double) -> CGPoint {
        let u = 1 - t
        return CGPoint(
            x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
            y: u * u * start.y + 2 * u * t * control.y + t * t * end.y
        )
    }

    func heading(at t: Double) -> Double {
        let dx = 2 * (1 - t) * (control.x - start.x) + 2 * t * (end.x - control.x)
        let dy = 2 * (1 - t) * (control.y - start.y) + 2 * t * (end.y - control.y)
        return atan2(Double(dy), Double(dx))
    }

    func opacity(at t: Double, peak: Double, fadeOutAt: Double) -> Double {
        let fadeInEnd = 0.07
        let fadeOutStart = 0.7
        if t <= 0 || t >= fadeOutAt { return 0 }
        if t < fadeInEnd {
            let u = t / fadeInEnd
            return peak * (u * u * (3 - 2 * u))
        }
        if t > fadeOutStart {
            let span = max(fadeOutAt - fadeOutStart, 0.001)
            let u = (t - fadeOutStart) / span
            return peak * (1 - u * u * (3 - 2 * u))
        }
        return peak
    }
}

/// A View (not a ViewModifier) so SwiftUI interpolates `animatableData` and follows the curve each frame.
private struct SweepMovingContainer<Content: View>: View, Animatable {
    var progress: Double
    let geometry: SweepGeometry
    let peakOpacity: Double
    let fadeOutAt: Double
    let content: Content

    var animatableData: Double {
        get { progress }
        set { progress = newValue }
    }

    var body: some View {
        let t = min(max(progress, 0), 1)
        let point = geometry.point(at: t)
        let cx = geometry.canvasSize.width / 2
        let cy = geometry.canvasSize.height / 2
        content
            .rotationEffect(.radians(geometry.heading(at: t) + geometry.rotationDrift * t))
            .offset(x: point.x - cx, y: point.y - cy)
            .opacity(geometry.opacity(at: t, peak: peakOpacity, fadeOutAt: fadeOutAt))
    }
}

private struct SweepStreak: View {
    let spec: StreakSpec
    let direction: EnrollmentSweepDirection
    let canvasSize: CGSize

    @State private var progress: Double = 0

    var body: some View {
        let geometry = SweepGeometry(spec: spec, direction: direction, canvasSize: canvasSize)
        SweepMovingContainer(
            progress: progress,
            geometry: geometry,
            peakOpacity: spec.peakOpacity,
            fadeOutAt: spec.fadeOutAt,
            content: layers(length: geometry.length)
        )
        .onAppear { runSweep() }
    }

    private func layers(length: CGFloat) -> some View {
        ZStack {
            streakLayer(length: length, thickness: spec.thickness * 2.35, blur: 78 * spec.blurScale,
                        opacity: spec.isVivid ? 0.28 : 0.16, colors: [GlanceTheme.accent, GlanceTheme.accentBright])
            streakLayer(length: length, thickness: spec.thickness, blur: 34 * spec.blurScale,
                        opacity: spec.isVivid ? 0.48 : 0.30,
                        colors: spec.isVivid ? [GlanceTheme.accentBright, GlanceTheme.accentPale] : [GlanceTheme.accent, GlanceTheme.accentBright])
            streakLayer(length: length, thickness: spec.thickness * 0.42, blur: 14 * spec.blurScale,
                        opacity: spec.isVivid ? 0.62 : 0.38, colors: [GlanceTheme.accentBright, GlanceTheme.accentPale])
            if spec.hasHighlight {
                streakLayer(length: length * 0.72, thickness: spec.thickness * 0.12, blur: 6,
                            opacity: spec.isVivid ? 0.36 : 0.20, colors: [GlanceTheme.accentPale, Color.white])
            }
        }
        .compositingGroup()
    }

    private func streakLayer(length: CGFloat, thickness: CGFloat, blur: CGFloat, opacity: Double, colors: [Color]) -> some View {
        Capsule()
            .fill(
                LinearGradient(
                    stops: [
                        .init(color: colors[0].opacity(0), location: 0),
                        .init(color: colors[0].opacity(0.6), location: 0.18),
                        .init(color: colors[1], location: 0.55),
                        .init(color: colors[1].opacity(0.85), location: 0.82),
                        .init(color: colors[1].opacity(0), location: 1),
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .frame(width: length, height: thickness)
            .blur(radius: blur)
            .opacity(opacity)
    }

    private func runSweep() {
        var reset = Transaction()
        reset.disablesAnimations = true
        withTransaction(reset) { progress = 0 }
        Task { @MainActor in
            withAnimation(.timingCurve(0.68, 0.0, 0.32, 1.0, duration: spec.duration).delay(spec.delay)) {
                progress = 1
            }
        }
    }
}

// MARK: - Full-screen sweep overlay (Glance: EnrollmentSweepWindowController.swift)

private struct EnrollmentSweepOverlay: View {
    @ObservedObject var model: GlanceEnrollModel
    @State private var playingDirection: EnrollmentSweepDirection?
    @State private var playTask: Task<Void, Never>?

    var body: some View {
        let direction = model.currentPose.flatMap(EnrollmentSweepDirection.init(pose:))
        let canPlay = model.shown && model.guideVisible && !model.isTooFar && !model.showCheckmark
        let isVisible = canPlay && playingDirection != nil

        ZStack {
            Color.clear
            if isVisible, let playingDirection {
                EnrollmentDirectionSweep(direction: playingDirection)
                    .id(playingDirection)
                    .transition(.opacity)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onChange(of: direction, initial: true) { _, newDirection in
            scheduleSweep(newDirection, canPlay: canPlay)
        }
        .onChange(of: canPlay) { _, playable in
            if !playable {
                playTask?.cancel()
                playingDirection = nil
            } else {
                scheduleSweep(direction, canPlay: true)
            }
        }
        .animation(.easeInOut(duration: GlanceMetrics.sweepDirectionCrossfade), value: playingDirection)
        .animation(.easeInOut(duration: isVisible ? GlanceMetrics.sweepFadeIn : GlanceMetrics.sweepFadeOut), value: isVisible)
        .allowsHitTesting(false)
    }

    private func scheduleSweep(_ newDirection: EnrollmentSweepDirection?, canPlay: Bool) {
        playTask?.cancel()
        guard canPlay, let newDirection else {
            playingDirection = nil
            return
        }
        playingDirection = nil
        playTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(GlanceMetrics.sweepPoseDelay * 1_000_000_000))
            guard !Task.isCancelled else { return }
            playingDirection = newDirection
        }
    }
}

// MARK: - Camera preview in the circle

struct GlanceCameraPreview: NSViewRepresentable {
    let session: AVCaptureSession

    func makeNSView(context: Context) -> PreviewHost {
        let v = PreviewHost()
        v.preview.session = session
        return v
    }

    func updateNSView(_ nsView: PreviewHost, context: Context) {}

    final class PreviewHost: NSView {
        let preview = AVCaptureVideoPreviewLayer()

        override init(frame frameRect: NSRect) {
            super.init(frame: frameRect)
            wantsLayer = true
            layer = CALayer()
            layer?.backgroundColor = NSColor.black.cgColor
            preview.videoGravity = .resizeAspectFill
            layer?.addSublayer(preview)
        }

        required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

        override func layout() {
            super.layout()
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            preview.frame = bounds
            CATransaction.commit()
            // Mirrored, like looking in a mirror (and like Glance).
            if let c = preview.connection, c.isVideoMirroringSupported {
                c.automaticallyAdjustsVideoMirroring = false
                c.isVideoMirrored = true
            }
        }
    }
}

// MARK: - The setup panel (Glance: EnrollStepView in OnboardingStepViews.swift, pill style)

struct GlanceEnrollView: View {
    @ObservedObject var controller: GlanceEnrollModel
    let session: AVCaptureSession

    var body: some View {
        VStack(spacing: 0) {
            cameraCluster
                .padding(.top, GlanceMetrics.enrollCameraTopPaddingPill)
            Spacer(minLength: 8)
            instructionLabel
                .padding(.horizontal, GlanceMetrics.enrollInstructionHorizontalPadding)
                .padding(.bottom, GlanceMetrics.enrollInstructionBottomPadding)
        }
        .frame(width: GlanceMetrics.enrollPanelWidth, height: GlanceMetrics.pillEnrollHeight)
        .overlay(alignment: .topTrailing) {
            if !controller.enrollmentComplete && !controller.showCheckmark {
                EnrollmentCloseButton { controller.onClose() }
                    .padding(GlanceMetrics.enrollCloseButtonEdgePadding)
            }
        }
        .background(GlanceTheme.panel)
        .clipShape(RoundedRectangle(cornerRadius: GlanceMetrics.enrollPanelCornerRadius, style: .continuous))
        // Glance's pill entrance: drops in from the top edge and expands.
        .scaleEffect(controller.shown ? 1 : 0.3, anchor: .top)
        .opacity(controller.shown ? 1 : 0)
        .animation(GlanceMetrics.stepAnimation, value: controller.shown)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private var cameraCluster: some View {
        ZStack {
            EnrollmentRingView(controller: controller)

            GlanceCameraPreview(session: session)
                .frame(width: GlanceMetrics.cameraCircleDiameter, height: GlanceMetrics.cameraCircleDiameter)
                .clipShape(Circle())
                .opacity(controller.cameraPreviewVisible ? 1 : 0)
                .animation(.easeInOut(duration: GlanceMetrics.previewFadeOut), value: controller.cameraPreviewVisible)
                .overlay {
                    if controller.isTooFar && controller.cameraPreviewVisible && !controller.showCheckmark {
                        EnrollmentTooFarChevron().transition(.opacity)
                    }
                }
                .animation(.easeInOut(duration: 0.2), value: controller.isTooFar)

            if controller.showCheckmark {
                AnimatedCheckmark(color: GlanceTheme.accent, lineWidth: 8)
                    .frame(width: 70, height: 59)
                    .transition(.opacity)
                    .padding(.top, 4)
            }
        }
        .frame(width: GlanceMetrics.enrollCameraClusterDiameter, height: GlanceMetrics.enrollCameraClusterDiameter)
    }

    private var instructionLabel: some View {
        Text(controller.enrollmentInstruction)
            .font(GlanceTheme.instructionFont)
            .foregroundStyle(.white)
            .multilineTextAlignment(.center)
            .lineLimit(2)
            .minimumScaleFactor(0.8)
            .id(controller.enrollmentInstruction)
            .transition(.opacity)
            .animation(.easeInOut(duration: 0.2), value: controller.enrollmentInstruction)
            .opacity(controller.guideVisible ? 1 : 0)
            .animation(.easeInOut(duration: controller.guideVisible ? GlanceMetrics.enrollInstructionFadeIn : GlanceMetrics.enrollInstructionFadeOut),
                       value: controller.guideVisible)
    }
}

private struct EnrollmentCloseButton: View {
    let action: () -> Void
    @State private var isHovering = false

    var body: some View {
        Button(action: action) {
            Image(systemName: "xmark")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.white.opacity(isHovering ? 1 : 0.8))
                .frame(width: GlanceMetrics.enrollCloseButtonSize, height: GlanceMetrics.enrollCloseButtonSize)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { isHovering = $0 }
        .accessibilityLabel("Close")
    }
}

private struct EnrollmentTooFarChevron: View {
    var body: some View {
        Image(systemName: "chevron.up.2")
            .font(.system(size: GlanceMetrics.enrollTooFarChevronSize, weight: .semibold))
            .foregroundStyle(.white)
            .shadow(color: .black.opacity(0.45), radius: 6, y: 1)
            .symbolEffect(.bounce.up.byLayer, options: .repeating)
            .accessibilityHidden(true)
    }
}

/// A panel that clicks can reach (for the ✕) without taking focus from the app you're in.
private final class GlancePanel: NSPanel {
    override var canBecomeKey: Bool { true }
}

/// Shows Glance's setup: the black pill panel at the top centre with the camera in the ring, and the full-screen
/// blue sweep behind it pointing where to turn.
final class GlanceEnrollWindows {
    let model = GlanceEnrollModel()
    private var panel: NSPanel?
    private var sweep: NSPanel?

    func show(session: AVCaptureSession) {
        guard let screen = GlanceResources.screen() else { return }

        // The sweep, full screen and click-through, under the panel.
        let sweepView = NSHostingView(rootView: EnrollmentSweepOverlay(model: model))
        sweepView.sizingOptions = []
        sweepView.frame = NSRect(origin: .zero, size: screen.frame.size)
        let s = makePanel(frame: screen.frame, clickThrough: true)
        s.level = NSWindow.Level(rawValue: NSWindow.Level.mainMenu.rawValue + 2)
        s.contentView = sweepView
        s.orderFrontRegardless()
        sweep = s

        // The pill panel, floating just under the top edge (no notch to hang from).
        let pad = GlanceMetrics.pillShadowPadding
        let w = GlanceMetrics.enrollPanelWidth + pad * 2
        let h = GlanceMetrics.pillEnrollHeight + pad
        let frame = NSRect(x: screen.frame.midX - w / 2, y: screen.frame.maxY - GlanceMetrics.pillTopGap - h, width: w, height: h)
        let root = GlanceEnrollView(controller: model, session: session)
            .shadow(color: .black.opacity(0.35), radius: 14, y: 6)
            .padding(.horizontal, pad)
            .padding(.bottom, pad)
        let host = NSHostingView(rootView: root)
        host.sizingOptions = []
        host.frame = NSRect(origin: .zero, size: frame.size)
        let p = makePanel(frame: frame, clickThrough: false)
        p.level = NSWindow.Level(rawValue: NSWindow.Level.mainMenu.rawValue + 3)
        p.contentView = host
        p.orderFrontRegardless()
        panel = p

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { self.model.shown = true }
    }

    /// Fades the sweep out (Glance dismisses it as soon as the face is captured).
    func dismissSweep() {
        DispatchQueue.main.asyncAfter(deadline: .now() + GlanceMetrics.sweepFadeOut) {
            self.sweep?.orderOut(nil)
            self.sweep = nil
        }
    }

    func close() {
        model.shown = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            self.panel?.orderOut(nil)
            self.sweep?.orderOut(nil)
            self.panel = nil
            self.sweep = nil
        }
    }

    private func makePanel(frame: NSRect, clickThrough: Bool) -> NSPanel {
        let w = GlancePanel(contentRect: frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        w.isOpaque = false
        w.backgroundColor = .clear
        w.hasShadow = false
        w.isMovable = false
        w.isReleasedWhenClosed = false
        w.hidesOnDeactivate = false
        w.ignoresMouseEvents = clickThrough
        w.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary, .ignoresCycle]
        w.setFrame(frame, display: true)
        return w
    }
}

// MARK: - Glance's nine-pose setup, on FaceAway's camera (Glance: OnboardingController enrollment)

/// Learns a face the way Glance does: look straight, then turn toward each of the eight directions the sweep points
/// to; each pose is held briefly and captured twice (18 ArcFace samples). Calls `done` with the samples on the main
/// queue, or with nil if you close it.
final class GlanceEnrollment {
    let ui = GlanceEnrollWindows()
    private let samplesPerPose = 2
    private let requiredMatchStreak = 3
    private let poseHold: TimeInterval = 0.5
    private let qualityFloor: Float = 0.2
    private let initialCaptureDelay: TimeInterval = 1.5
    private let minimumFaceWidth: CGFloat = 0.2
    private let stallTimeout: TimeInterval = 12

    // Camera-queue state.
    private var poseIndex = 0
    private var capturedForPose = 0
    private var matchStreak = 0
    private var poseStartedAt = Date()
    private var poseHoldStartedAt: Date?
    private var captureReadyAt = Date()
    private var samples: [[Float]] = []
    private var finished = false
    private let request: VNDetectFaceRectanglesRequest = {
        let r = VNDetectFaceRectanglesRequest()
        r.revision = VNDetectFaceRectanglesRequestRevision3   // the revision that reports yaw and pitch
        return r
    }()

    var done: ([[Float]]?) -> Void = { _ in }

    func begin(session: AVCaptureSession) {
        captureReadyAt = Date().addingTimeInterval(initialCaptureDelay)
        poseStartedAt = Date()
        ui.model.onClose = { [weak self] in
            guard let self, !self.finished else { return }
            self.finished = true
            self.ui.close()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { self.done(nil) }
        }
        ui.show(session: session)
    }

    /// One camera frame (called on the camera queue).
    func frame(_ pixels: CVPixelBuffer) {
        guard !finished, let pose = EnrollmentPose(rawValue: poseIndex) else { return }
        let handler = VNImageRequestHandler(cvPixelBuffer: pixels, orientation: .up, options: [:])
        guard (try? handler.perform([request])) != nil else { return }
        let faces = (request.results ?? []).sorted { $0.boundingBox.width * $0.boundingBox.height > $1.boundingBox.width * $1.boundingBox.height }

        guard let face = faces.first else {
            publish(face: false, tooFar: false, yaw: nil, pitch: nil, excessive: nil)
            reset()
            return
        }
        if face.boundingBox.width < minimumFaceWidth {
            publish(face: true, tooFar: true, yaw: nil, pitch: nil, excessive: nil)
            reset()
            return
        }
        guard let yaw = face.yaw?.floatValue, let pitch = face.pitch?.floatValue else {
            publish(face: true, tooFar: false, yaw: nil, pitch: nil, excessive: nil)
            reset()
            return
        }
        let excessive = GlancePoseBands.excessive(yaw: yaw, pitch: pitch)
        publish(face: true, tooFar: false, yaw: yaw, pitch: pitch, excessive: excessive)
        guard excessive == nil, Date() >= captureReadyAt else { reset(); return }

        let widened = Date().timeIntervalSince(poseStartedAt) > stallTimeout
        guard GlancePoseBands.matches(yaw: yaw, pitch: pitch, pose: pose, widened: widened) else { reset(); return }
        if poseHoldStartedAt == nil { poseHoldStartedAt = Date() }
        guard Date().timeIntervalSince(poseHoldStartedAt!) >= poseHold else { return }
        matchStreak += 1
        guard matchStreak >= requiredMatchStreak else { return }

        // Only clear views, with Glance's 5-point alignment, count.
        guard (faceQualities(pixels, [face.boundingBox]).first ?? 1) >= qualityFloor,
              let embedding = featurePrint(of: pixels, box: face.boundingBox) else { return }
        matchStreak = 0
        samples.append(embedding)
        capturedForPose += 1
        guard capturedForPose >= samplesPerPose else { return }

        capturedForPose = 0
        poseIndex += 1
        poseStartedAt = Date()
        poseHoldStartedAt = nil
        let next = poseIndex
        DispatchQueue.main.async {
            if pose == .center { self.ui.model.centerPulseTick += 1 } else { self.ui.model.capturedPoses.insert(pose) }
            self.ui.model.poseIndex = next
        }
        if poseIndex >= EnrollmentPose.allCases.count { finish() }
    }

    private func reset() {
        matchStreak = 0
        poseHoldStartedAt = nil
    }

    private func publish(face: Bool, tooFar: Bool, yaw: Float?, pitch: Float?, excessive: ExcessiveTurn?) {
        DispatchQueue.main.async {
            let m = self.ui.model
            if m.faceDetected != face { m.faceDetected = face }
            if m.isTooFar != tooFar { m.isTooFar = tooFar }
            if m.excessiveTurn != excessive { m.excessiveTurn = excessive }
            m.currentYaw = yaw
            m.currentPitch = pitch
        }
    }

    /// Glance's camera-complete sequence: the guide fades, the ring closes, the preview fades, the checkmark draws.
    private func finish() {
        finished = true
        let collected = samples
        DispatchQueue.main.async {
            let m = self.ui.model
            m.enrollmentComplete = true
            m.guideVisible = false
            self.ui.dismissSweep()
            DispatchQueue.main.asyncAfter(deadline: .now() + GlanceMetrics.guideOverlayFadeOut) {
                m.cameraPreviewVisible = false
                DispatchQueue.main.asyncAfter(deadline: .now() + GlanceMetrics.previewFadeOut + GlanceMetrics.checkmarkDelay) {
                    m.showCheckmark = true
                    self.done(collected)
                }
            }
        }
    }
}

// MARK: - The scan pill for Face ID unlock (Glance: ScanAnimationView.swift + the pill-style notch panel)

/// Which media the pill shows. `.idle` is a still (the first frame of the success video).
enum ScanMedia: Equatable {
    case idle
    case success
    case failure

    var videoResourceName: String? {
        switch self {
        case .idle: return nil
        case .success: return "unlockanimation"
        case .failure: return "unsuccessfulunlockanimation"
        }
    }

    /// How long each video plays (they end on their final frame).
    var duration: Double {
        switch self {
        case .idle: return 0
        case .success: return 1.22
        case .failure: return 1.52
        }
    }
}

struct ScanAnimationView: NSViewRepresentable {
    let media: ScanMedia

    func makeNSView(context: Context) -> ScanAnimationHostView {
        let view = ScanAnimationHostView()
        view.apply(media: media)
        return view
    }

    func updateNSView(_ nsView: ScanAnimationHostView, context: Context) {
        nsView.apply(media: media)
    }
}

final class ScanAnimationHostView: NSView {
    private var player: AVPlayer?
    private let playerLayer = AVPlayerLayer()
    private let stillImageLayer = CALayer()
    private var currentMedia: ScanMedia?
    private var readyObservation: NSKeyValueObservation?
    private var fallbackRevealWorkItem: DispatchWorkItem?

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layer = CALayer()
        stillImageLayer.contentsGravity = .resizeAspect
        if let url = GlanceResources.url("unlockstatic", "png"), let still = NSImage(contentsOf: url) {
            stillImageLayer.contents = still
        }
        layer?.addSublayer(stillImageLayer)
        playerLayer.videoGravity = .resizeAspect
        playerLayer.isHidden = true
        layer?.addSublayer(playerLayer)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func layout() {
        super.layout()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        playerLayer.frame = bounds
        stillImageLayer.frame = bounds
        CATransaction.commit()
    }

    func apply(media: ScanMedia) {
        guard media != currentMedia else { return }
        currentMedia = media
        readyObservation = nil
        fallbackRevealWorkItem?.cancel()

        guard let resource = media.videoResourceName, let url = GlanceResources.url(resource, "mp4") else {
            teardownPlayer()
            playerLayer.isHidden = true
            stillImageLayer.isHidden = false
            return
        }

        teardownPlayer()
        let newPlayer = AVPlayer(url: url)
        newPlayer.isMuted = true                 // this can play at the lock screen — never make noise
        newPlayer.actionAtItemEnd = .none        // stay on the final frame
        playerLayer.player = newPlayer
        player = newPlayer

        let reveal: () -> Void = { [weak self] in
            guard let self else { return }
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            self.playerLayer.isHidden = false
            self.stillImageLayer.isHidden = true
            CATransaction.commit()
        }
        readyObservation = playerLayer.observe(\.isReadyForDisplay, options: [.new]) { [weak self] _, change in
            guard change.newValue == true else { return }
            DispatchQueue.main.async {
                self?.fallbackRevealWorkItem?.cancel()
                reveal()
                self?.readyObservation = nil
            }
        }
        let fallback = DispatchWorkItem { reveal() }
        fallbackRevealWorkItem = fallback
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6, execute: fallback)

        newPlayer.seek(to: .zero)
        newPlayer.play()
    }

    private func teardownPlayer() {
        readyObservation = nil
        fallbackRevealWorkItem?.cancel()
        player?.pause()
        player = nil
        playerLayer.player = nil
    }
}

final class GlancePillModel: ObservableObject {
    @Published var open = false
    @Published var media: ScanMedia = .idle
}

/// Glance's pill: a small black capsule at the top centre that expands into a rounded square holding the scan.
struct GlancePillView: View {
    @ObservedObject var model: GlancePillModel

    var body: some View {
        let size = model.open ? GlanceMetrics.pillOpenSize : GlanceMetrics.pillClosedSize
        let radius = model.open ? GlanceMetrics.pillOpenCornerRadius : GlanceMetrics.pillClosedSize.height / 2
        ZStack {
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .fill(Color.black)
            if model.open {
                ScanAnimationView(media: model.media)
                    .padding(GlanceMetrics.pillContentPadding)
                    .transition(.opacity)
            }
        }
        .frame(width: size.width, height: size.height)
        .shadow(color: .black.opacity(0.35), radius: 12, y: 4)
        .opacity(model.open ? 1 : 0)
        .animation(.spring(response: 0.38, dampingFraction: 0.78), value: model.open)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .padding(.top, GlanceMetrics.pillTopGap)
    }
}

/// The window that holds the pill; it sits above FaceAway's lock screen and never takes clicks.
final class GlancePill {
    private let model = GlancePillModel()
    private var window: NSPanel?
    private var generation = 0

    var isOpen: Bool { model.open }

    private func ensureWindow() {
        guard window == nil, let screen = GlanceResources.screen() else { return }
        let pad = GlanceMetrics.pillShadowPadding
        let w = GlanceMetrics.pillOpenSize.width + pad * 2
        let h = GlanceMetrics.pillOpenSize.height + GlanceMetrics.pillTopGap + pad
        let frame = NSRect(x: screen.frame.midX - w / 2, y: screen.frame.maxY - h, width: w, height: h)
        let host = NSHostingView(rootView: GlancePillView(model: model))
        host.sizingOptions = []
        host.frame = NSRect(origin: .zero, size: frame.size)
        let p = NSPanel(contentRect: frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        p.isOpaque = false
        p.backgroundColor = .clear
        p.hasShadow = false
        p.ignoresMouseEvents = true
        p.isReleasedWhenClosed = false
        p.hidesOnDeactivate = false
        p.level = NSWindow.Level(rawValue: NSWindow.Level.screenSaver.rawValue + 3)   // above the lock and panic screens
        p.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary, .ignoresCycle]
        p.contentView = host
        p.setFrame(frame, display: true)
        window = p
    }

    /// Opens the pill showing `media` (the still while waiting for a face).
    func show(_ media: ScanMedia) {
        generation += 1
        ensureWindow()
        window?.orderFrontRegardless()
        model.media = media
        if !model.open {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.03) { self.model.open = true }
        }
    }

    /// Plays a video; then closes, or goes back to the waiting still.
    func play(_ media: ScanMedia, thenClose: Bool) {
        show(media)
        let g = generation
        DispatchQueue.main.asyncAfter(deadline: .now() + media.duration + 0.5) {
            guard g == self.generation else { return }
            if thenClose { self.hide() } else { self.model.media = .idle }
        }
    }

    func hide() {
        generation += 1
        let g = generation
        model.open = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
            guard g == self.generation else { return }
            self.window?.orderOut(nil)
        }
    }
}
