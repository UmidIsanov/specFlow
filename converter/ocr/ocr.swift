import Foundation
import Vision
import AppKit
import CoreImage

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

func recognize(_ image: CGImage) -> [VNRecognizedTextObservation] {
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.recognitionLanguages = langs
    // автокоррекция «исправляет» артикулы и коды — отключаем
    req.usesLanguageCorrection = false
    do {
        try VNImageRequestHandler(cgImage: image, options: [:]).perform([req])
    } catch {
        FileHandle.standardError.write("vision: \(error)\n".data(using: .utf8)!)
        exit(1)
    }
    return req.results ?? []
}

let ciContext = CIContext(options: [.useSoftwareRenderer: false])

/// Повышение контраста. По умолчанию выключено: на 11 страницах реальных сканов оно
/// отняло 22 слова и 14 линий сетки, не добавив точности. Включать (OCR_CONTRAST=1.4)
/// стоит только для совсем бледных сканов.
func enhance(_ image: CGImage) -> CGImage {
    let ci = CIImage(cgImage: image)
    guard let controls = CIFilter(name: "CIColorControls") else { return image }
    controls.setValue(ci, forKey: kCIInputImageKey)
    let contrast = Double(ProcessInfo.processInfo.environment["OCR_CONTRAST"] ?? "") ?? 1.0
    controls.setValue(0.0, forKey: kCIInputSaturationKey)
    controls.setValue(contrast, forKey: kCIInputContrastKey)
    controls.setValue(0.0, forKey: kCIInputBrightnessKey)
    guard let out = controls.outputImage,
          let cg = ciContext.createCGImage(out, from: out.extent) else { return image }
    return cg
}

/// Наклон страницы по углу строк текста: Vision отдаёт углы ячеек, берём медиану.
func skewAngle(_ obs: [VNRecognizedTextObservation]) -> CGFloat {
    let angles = obs.compactMap { o -> CGFloat? in
        let dx = o.topRight.x - o.topLeft.x
        let dy = o.topRight.y - o.topLeft.y
        guard dx > 0.05 else { return nil }   // короткие куски угол не показывают
        return atan2(dy, dx)
    }.sorted()
    guard angles.count >= 8 else { return 0 }
    return angles[angles.count / 2]
}

func rotate(_ image: CGImage, by angle: CGFloat) -> CGImage {
    let ci = CIImage(cgImage: image).transformed(by: CGAffineTransform(rotationAngle: -angle))
    guard let cg = ciContext.createCGImage(ci, from: ci.extent) else { return image }
    return cg
}

var working = enhance(cg)
var results = recognize(working)
// выравниваем только заметный наклон: на ровном скане поворот только портит
let angle = skewAngle(results)
if abs(angle) > 0.004 {
    working = rotate(working, by: angle)
    let second = recognize(working)
    if second.count >= results.count { results = second }
    FileHandle.standardError.write("deskew: \(String(format: "%.2f", angle * 180 / .pi))°\n".data(using: .utf8)!)
}

var lines: [[String: Any]] = []
for obs in results {
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
let grid = gridLines(working)
let out: [String: Any] = ["width": working.width, "height": working.height, "lines": lines, "hlines": grid.h, "vlines": grid.v]
let data = try JSONSerialization.data(withJSONObject: out)
FileHandle.standardOutput.write(data)
