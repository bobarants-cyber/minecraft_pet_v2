import AVFoundation
import AVKit
import SwiftUI

/// Floating Bbokari: a looping video of Bbokari shown picture-in-picture, so it stays on top of every app.
/// It also pops out by itself when you leave the app (swipe home), like Bbokari on the Mac that is always there.
final class FloatController: NSObject, ObservableObject, AVPictureInPictureControllerDelegate {
    let layer = AVPlayerLayer()
    @Published private(set) var floating = false
    /// Something Bbokari should say on the page (e.g. when the floating window can't open).
    @Published var message: String?

    private let player = AVQueuePlayer()
    private var looper: AVPlayerLooper?
    private var pip: AVPictureInPictureController?

    override init() {
        super.init()
        guard let url = Bundle.main.url(forResource: "float", withExtension: "mp4") else { return }
        looper = AVPlayerLooper(player: player, templateItem: AVPlayerItem(url: url))
        player.isMuted = true
        player.preventsDisplaySleepDuringVideoPlayback = false
        layer.player = player
        layer.videoGravity = .resizeAspect
        // .mixWithOthers: your music keeps playing while Bbokari floats.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        if AVPictureInPictureController.isPictureInPictureSupported() {
            let pip: AVPictureInPictureController? = AVPictureInPictureController(playerLayer: layer)
            pip?.delegate = self
            pip?.canStartPictureInPictureAutomaticallyFromInline = true
            pip?.requiresLinearPlayback = true
            self.pip = pip
        }
        player.play()
    }

    func toggle() {
        guard let pip else {
            message = "This iPhone can't show floating windows 😢 (Settings → General → Picture in Picture)"
            return
        }
        if pip.isPictureInPictureActive { stop() } else {
            player.play()
            if pip.isPictureInPicturePossible {
                pip.startPictureInPicture()
            } else {
                // The player may still be warming up; try once more in a moment.
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
                    guard let self, let pip = self.pip else { return }
                    if pip.isPictureInPicturePossible { pip.startPictureInPicture() }
                    else { self.message = "I couldn't pop out yet 😅 Try again in a second." }
                }
            }
        }
    }

    func stop() { pip?.stopPictureInPicture() }

    func pictureInPictureControllerDidStartPictureInPicture(_ controller: AVPictureInPictureController) {
        floating = true
        message = "Floating! Swipe home and I'll follow you everywhere 🐥"
    }

    func pictureInPictureControllerDidStopPictureInPicture(_ controller: AVPictureInPictureController) {
        floating = false
        player.play()
    }

    func pictureInPictureController(_ controller: AVPictureInPictureController,
                                    failedToStartPictureInPictureWithError error: Error) {
        message = "I couldn't float 😢 (\(error.localizedDescription))"
    }
}

/// Hosts the player layer in SwiftUI.
struct PlayerView: UIViewRepresentable {
    let layer: AVPlayerLayer

    func makeUIView(context: Context) -> UIView {
        let view = LayerHost()
        view.playerLayer = layer
        view.layer.addSublayer(layer)
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {}

    final class LayerHost: UIView {
        var playerLayer: AVPlayerLayer?
        override func layoutSubviews() {
            super.layoutSubviews()
            playerLayer?.frame = bounds
        }
    }
}
