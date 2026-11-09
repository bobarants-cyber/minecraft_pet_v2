// Hides the real mouse pointer everywhere while Bbokari is your cursor (his tiny Bbokari pointer follows the mouse
// instead). Bbokari builds this once with Apple's Swift compiler (`xcrun swiftc`) and runs it only in cursor mode.
//
// macOS normally only lets the app in front hide the pointer. The "SetsCursorInBackground" connection property (a
// long-standing private CoreGraphics setting, also used by apps like Cursorcerer) lets this helper hide it while it's
// in the background. The pointer always comes back: when Bbokari closes our input (cursor mode off), when Bbokari
// quits or crashes (we notice our parent is gone), or when this helper is stopped in any way.
import CoreGraphics
import Foundation

typealias ConnectionFn = @convention(c) () -> UInt32
typealias SetPropertyFn = @convention(c) (UInt32, UInt32, CFString, CFTypeRef) -> Int32

let anywhere = UnsafeMutableRawPointer(bitPattern: -2) // RTLD_DEFAULT
guard
  let connSym = dlsym(anywhere, "_CGSDefaultConnection") ?? dlsym(anywhere, "CGSMainConnectionID"),
  let setSym = dlsym(anywhere, "CGSSetConnectionProperty")
else {
  print("unsupported")
  exit(2)
}
let conn = unsafeBitCast(connSym, to: ConnectionFn.self)()
_ = unsafeBitCast(setSym, to: SetPropertyFn.self)(conn, conn, "SetsCursorInBackground" as CFString, kCFBooleanTrue)

let display = CGMainDisplayID()
if CGDisplayHideCursor(display) != .success {
  print("failed")
  exit(3)
}
print("hidden")
fflush(stdout)

func showAndExit() -> Never {
  CGDisplayShowCursor(display)
  exit(0)
}

// Stopped (Bbokari kills us, or the Mac logs out): show the pointer first.
for sig in [SIGTERM, SIGINT, SIGHUP] {
  signal(sig) { _ in
    CGDisplayShowCursor(CGMainDisplayID())
    exit(0)
  }
}

// Bbokari closes our input when cursor mode ends.
Thread.detachNewThread {
  _ = FileHandle.standardInput.readDataToEndOfFile()
  showAndExit()
}

// Bbokari quit or crashed: our parent is gone.
let parent = getppid()
Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
  if getppid() != parent { showAndExit() }
}
RunLoop.main.run()
