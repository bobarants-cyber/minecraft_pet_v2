// Bbokari's snow helper: tells the snow overlay where your windows are, so snow can pile up on them.
// It only reads each window's position and size (front to back), never what's in it, and needs no permission.
// Prints one JSON line per tick:  {"w":[[id,x,y,w,h],...],"f":frontAppPid,"d":[x,y,w,h] or null (the Dock)}
// Usage: snowHelper <pid to ignore (Bbokari)> <milliseconds between ticks>
import AppKit
import CoreGraphics

setvbuf(stdout, nil, _IOLBF, 0)
let args = CommandLine.arguments
let ignorePid = Int32(args.count > 1 ? args[1] : "0") ?? 0
let interval = max(0.008, (Double(args.count > 2 ? args[2] : "16") ?? 16) / 1000)
var lastLine = ""

func tick() {
    guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return }
    var parts: [String] = []
    var dock = "null"
    let dockLevel = Int(CGWindowLevelForKey(.dockWindow))
    let screenH = NSScreen.screens.first?.frame.height ?? 10000
    for w in list {
        // the Dock (only while it's showing): snow piles on it
        if let layer = w[kCGWindowLayer as String] as? Int, layer == dockLevel,
           (w[kCGWindowOwnerName as String] as? String) == "Dock",
           let bounds = w[kCGWindowBounds as String] as? NSDictionary,
           let r = CGRect(dictionaryRepresentation: bounds as CFDictionary),
           r.height < 300, r.width > 50, r.minY < screenH - 4, dock == "null" {
            dock = "[\(Int(r.origin.x)),\(Int(r.origin.y)),\(Int(r.width)),\(Int(r.height))]"
            continue
        }
        // normal windows, plus floating ones (Quick Look previews, panels, picture in picture)
        guard let layer = w[kCGWindowLayer as String] as? Int, layer >= 0, layer < dockLevel,
              let pid = w[kCGWindowOwnerPID as String] as? Int32, pid != ignorePid,
              let id = w[kCGWindowNumber as String] as? Int,
              let bounds = w[kCGWindowBounds as String] as? NSDictionary,
              let r = CGRect(dictionaryRepresentation: bounds as CFDictionary) else { continue }
        let alpha = (w[kCGWindowAlpha as String] as? NSNumber)?.doubleValue ?? 1
        if alpha < 0.1 || r.width < 80 || r.height < 40 { continue }
        parts.append("[\(id),\(Int(r.origin.x)),\(Int(r.origin.y)),\(Int(r.width)),\(Int(r.height))]")
        if parts.count >= 24 { break }
    }
    let front = NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0
    let line = "{\"w\":[\(parts.joined(separator: ","))],\"f\":\(front),\"d\":\(dock)}"
    if line != lastLine {   // only when something changed
        lastLine = line
        print(line)
    }
}

let timer = Timer(timeInterval: interval, repeats: true) { _ in tick() }
RunLoop.main.add(timer, forMode: .common)
// quit when Bbokari closes our input
FileHandle.standardInput.readabilityHandler = { h in if h.availableData.isEmpty { exit(0) } }
tick()
RunLoop.main.run()
