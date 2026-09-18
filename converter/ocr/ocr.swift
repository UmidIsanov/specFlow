import Foundation
import Vision
import AppKit

// Локальное распознавание скана движком macOS Vision — бесплатно и офлайн.
// Вход: PNG страницы. Выход: JSON со строками текста и их координатами (0..1, начало вверху слева).
// Из координат сервер восстанавливает таблицу — так же, как из текстового слоя PDF.

let args = CommandLine.arguments
guard args.count >= 2 else {
    FileHandle.standardError.write("usage: ocr <page.png> [lang,lang]\n".data(using: .utf8)!)
    exit(2)
}
let path = args[1]
let langs = args.count >= 3 ? args[2].split(separator: ",").map(String.init) : ["ru-RU", "en-US"]

guard let img = NSImage(contentsOfFile: path),
      let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    FileHandle.standardError.write("cannot read image \(path)\n".data(using: .utf8)!)
    exit(1)
}

let req = VNRecognizeTextRequest()
req.recognitionLevel = .accurate
req.recognitionLanguages = langs
// автокоррекция «исправляет» артикулы и коды — отключаем
req.usesLanguageCorrection = false

let handler = VNImageRequestHandler(cgImage: cg, options: [:])
do {
    try handler.perform([req])
} catch {
    FileHandle.standardError.write("vision: \(error)\n".data(using: .utf8)!)
    exit(1)
}

var lines: [[String: Any]] = []
for obs in req.results ?? [] {
    guard let c = obs.topCandidates(1).first else { continue }
    let b = obs.boundingBox
    lines.append([
        "text": c.string,
        "conf": Double(c.confidence),
        "x": b.minX,
        "y": 1 - b.maxY,
        "w": b.width,
        "h": b.height,
    ])
}
// Линии сетки таблицы: тёмные пиксели, вытянутые в строку или столбец.
// По ним восстанавливаются границы ячеек — точнее любых догадок по координатам слов.
func gridLines(_ cg: CGImage) -> (h: [Double], v: [Double]) {
    let w = cg.width, h = cg.height
    var gray = [UInt8](repeating: 255, count: w * h)
    let cs = CGColorSpaceCreateDeviceGray()
    guard let ctx = CGContext(data: &gray, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w, space: cs, bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return ([], []) }
    ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
    // линии на сканах серые и рваные: считаем долю тёмных пикселей, а не сплошной отрезок
    let dark: UInt8 = 185

    // линия — длинный непрерывный тёмный отрезок (допускаем разрывы до 3 px: сканы рваные);
    // строка текста такого отрезка не даёт
    func longestRun(_ get: (Int) -> UInt8, _ n: Int) -> Int {
        var run = 0, best = 0, gap = 0
        for i in 0..<n {
            if get(i) < dark { run += 1 + gap; gap = 0; if run > best { best = run } }
            else { gap += 1; if gap > 3 { run = 0; gap = 0 } }
        }
        return best
    }
    var hs: [Int] = []
    for y in 0..<h {
        let row = y * w
        if Double(longestRun({ gray[row + $0] }, w)) > Double(w) * 0.35 { hs.append(y) }
    }
    var vs: [Int] = []
    for x in 0..<w {
        if Double(longestRun({ gray[$0 * w + x] }, h)) > Double(h) * 0.15 { vs.append(x) }
    }
    // слипшиеся соседние пиксели одной линии — в одну координату
    func merge(_ xs: [Int], _ size: Int) -> [Double] {
        var out: [Double] = []; var group: [Int] = []
        for v in xs {
            if let last = group.last, v - last > 3 { out.append(Double(group.reduce(0, +)) / Double(group.count) / Double(size)); group = [] }
            group.append(v)
        }
        if !group.isEmpty { out.append(Double(group.reduce(0, +)) / Double(group.count) / Double(size)) }
        return out
    }
    // CGContext рисует снизу вверх: строка 0 буфера — низ страницы. Переводим в «начало сверху».
    return (merge(hs, h).map { 1 - $0 }.sorted(), merge(vs, w))
}
let grid = gridLines(cg)
let out: [String: Any] = ["width": cg.width, "height": cg.height, "lines": lines, "hlines": grid.h, "vlines": grid.v]
let data = try JSONSerialization.data(withJSONObject: out)
FileHandle.standardOutput.write(data)
