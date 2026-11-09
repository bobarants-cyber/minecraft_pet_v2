// Bbokari's cursor helper (only runs while Bbokari is your cursor). Bbokari builds it once with Apple's Swift compiler
// (`xcrun swiftc`). It does two things:
//   1. Tells Bbokari which pointer macOS is showing right now (arrow, text I-beam, pointing hand, grab hand, resize…),
//      so his tiny Bbokari pointer changes shape to match. It prints "cursor:<name>" whenever it changes.
//   2. With --hide: hides the real pointer, so only Bbokari shows. macOS normally only lets the app in front do this;
//      the "SetsCursorInBackground" connection property (a long-standing private CoreGraphics setting, also used by
//      apps like Cursorcerer) lets this helper do it from the background. The pointer always comes back: when Bbokari
//      closes our input (cursor mode off), when Bbokari quits or crashes (our parent is gone), or on any signal.
import AppKit
import CoreGraphics
import Foundation

let wantHide = CommandLine.arguments.contains("--hide")
let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let display = CGMainDisplayID()
var hidden = false

if wantHide {
  typealias ConnectionFn = @convention(c) () -> UInt32
  typealias SetPropertyFn = @convention(c) (UInt32, UInt32, CFString, CFTypeRef) -> Int32
  let anywhere = UnsafeMutableRawPointer(bitPattern: -2) // RTLD_DEFAULT
  if let connSym = dlsym(anywhere, "_CGSDefaultConnection") ?? dlsym(anywhere, "CGSMainConnectionID"),
     let setSym = dlsym(anywhere, "CGSSetConnectionProperty") {
    let conn = unsafeBitCast(connSym, to: ConnectionFn.self)()
    _ = unsafeBitCast(setSym, to: SetPropertyFn.self)(conn, conn, "SetsCursorInBackground" as CFString, kCFBooleanTrue)
    hidden = CGDisplayHideCursor(display) == .success
  }
}
print("ready hidden=\(hidden)")
fflush(stdout)

func bye() -> Never {
  if hidden { CGDisplayShowCursor(display) }
  exit(0)
}
for sig in [SIGTERM, SIGINT, SIGHUP] {
  signal(sig) { _ in
    CGDisplayShowCursor(CGMainDisplayID())
    exit(0)
  }
}
Thread.detachNewThread {
  _ = FileHandle.standardInput.readDataToEndOfFile() // Bbokari closed our input: cursor mode is over
  DispatchQueue.main.async { bye() }
}
let parent = getppid()

// The standard pointers, to recognise the one on screen (same hot spot and size; if several match, same picture).
let known: [(String, NSCursor)] = [
  ("arrow", .arrow), ("ibeam", .iBeam), ("ibeam", .iBeamCursorForVerticalLayout), ("hand", .pointingHand),
  ("open", .openHand), ("grab", .closedHand), ("cross", .crosshair), ("resizeH", .resizeLeftRight),
  ("resizeH", .resizeLeft), ("resizeH", .resizeRight), ("resizeV", .resizeUpDown), ("resizeV", .resizeUp),
  ("resizeV", .resizeDown), ("no", .operationNotAllowed), ("copy", .dragCopy), ("link", .dragLink),
  ("menu", .contextualMenu),
]
var pictures: [Int: Data] = [:]
func picture(_ i: Int) -> Data? {
  if let d = pictures[i] { return d }
  let d = known[i].1.image.tiffRepresentation
  pictures[i] = d
  return d
}

var last = ""
var ticks = 0
Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { _ in
  ticks += 1
  if ticks % 20 == 0 && getppid() != parent { bye() }
  guard let cur = NSCursor.currentSystem else { return }
  let candidates = known.indices.filter { known[$0].1.hotSpot == cur.hotSpot && known[$0].1.image.size == cur.image.size }
  var name = "other"
  if candidates.count == 1 {
    name = known[candidates[0]].0
  } else if candidates.count > 1, let data = cur.image.tiffRepresentation {
    name = candidates.first(where: { picture($0) == data }).map { known[$0].0 } ?? known[candidates[0]].0
  }
  if name != last {
    last = name
    print("cursor:\(name)")
    fflush(stdout)
  }
}
app.run()
