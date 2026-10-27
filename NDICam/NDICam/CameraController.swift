import AVFoundation
import SwiftUI

enum Resolution: String, CaseIterable, Identifiable {
    case hd1080 = "1080p"
    case uhd4k = "4K"
    var id: String { rawValue }
    var width: Int32 { self == .hd1080 ? 1920 : 3840 }
    var height: Int32 { self == .hd1080 ? 1080 : 2160 }
}

final class CameraController: NSObject, ObservableObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    let session = AVCaptureSession()
    let sender = NDISender()

    private let output = AVCaptureVideoDataOutput()
    private let queue = DispatchQueue(label: "camera.video", qos: .userInteractive)
    private var device: AVCaptureDevice?
    private var configured = false

    // Parametrai
    @Published var resolution: Resolution = .hd1080 { didSet { applyFormat() } }
    @Published var fps: Int = 30 { didSet { applyFormat() } }
    @Published var autoExposure = true { didSet { applyExposure() } }
    @Published var iso: Float = 100 { didSet { applyExposure() } }
    @Published var shutterDenominator: Double = 60 { didSet { applyExposure() } }
    @Published var autoFocus = true { didSet { applyFocus() } }
    @Published var focus: Float = 0.5 { didSet { applyFocus() } }
    @Published var autoWB = true { didSet { applyWB() } }
    @Published var kelvin: Float = 5600 { didSet { applyWB() } }
    @Published var sending = false
    @Published var sourceName = "iPhone 15 Pro Max"
    @Published var isoRange: ClosedRange<Float> = 25...1600

    let fpsOptions = [24, 25, 30, 50, 60]

    // MARK: Paleidimas

    func start() {
        AVCaptureDevice.requestAccess(for: .video) { ok in
            guard ok else { return }
            self.queue.async {
                if !self.configured { self.configure() }
                if !self.session.isRunning { self.session.startRunning() }
            }
        }
    }

    private func configure() {
        guard let dev = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let input = try? AVCaptureDeviceInput(device: dev) else { return }
        device = dev

        session.beginConfiguration()
        session.inputs.forEach { session.removeInput($0) }
        if session.canAddInput(input) { session.addInput(input) }

        output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
        output.alwaysDiscardsLateVideoFrames = true
        output.setSampleBufferDelegate(self, queue: queue)
        if session.canAddOutput(output) { session.addOutput(output) }
        session.sessionPreset = .inputPriority   // formatą parenkame patys
        session.commitConfiguration()

        configured = true
        applyFormat()
    }

    // MARK: Formatas (rezoliucija + FPS)

    private func applyFormat() {
        queue.async { [self] in
            guard let dev = device else { return }
            let w = resolution.width, h = resolution.height
            let target = Double(fps)

            // Ieškome formato su tinkama rezoliucija, palaikančio FPS; renkamės be HDR/binned prioritetą neturinčius
            let candidates = dev.formats.filter { f in
                let d = CMVideoFormatDescriptionGetDimensions(f.formatDescription)
                return d.width == w && d.height == h &&
                    f.videoSupportedFrameRateRanges.contains { $0.minFrameRate <= target && target <= $0.maxFrameRate }
            }
            // Pirmenybė 8 bitų 420f formatui (ne 10 bitų HDR), jį vis tiek konvertuojame į BGRA
            let sdr = candidates.first {
                CMFormatDescriptionGetMediaSubType($0.formatDescription) == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
            }
            guard let format = sdr ?? candidates.first else {
                print("Formatas \(w)x\(h)@\(fps) nepalaikomas")
                return
            }
            do {
                try dev.lockForConfiguration()
                dev.activeFormat = format
                let dur = CMTime(value: 1, timescale: CMTimeScale(fps))
                dev.activeVideoMinFrameDuration = dur
                dev.activeVideoMaxFrameDuration = dur
                dev.unlockForConfiguration()

                applyRotation()
                DispatchQueue.main.async {
                    self.isoRange = format.minISO...format.maxISO
                    self.iso = min(max(self.iso, format.minISO), format.maxISO)
                }
            } catch { print("Formato klaida: \(error)") }
            applyExposure(); applyFocus(); applyWB()
        }
    }

    // MARK: Pasukimas (0° = landscape, USB-C dešinėje; 180° = USB-C kairėje)

    private var rotationAngle: CGFloat = 0

    func setRotation(_ angle: CGFloat) {
        queue.async { [self] in
            guard angle != rotationAngle else { return }
            rotationAngle = angle
            applyRotation()
        }
    }

    private func applyRotation() {
        if let conn = output.connection(with: .video), conn.isVideoRotationAngleSupported(rotationAngle) {
            conn.videoRotationAngle = rotationAngle
        }
    }

    // MARK: Rankiniai valdymai

    private func applyExposure() {
        queue.async { [self] in
            guard let dev = device else { return }
            do {
                try dev.lockForConfiguration()
                if autoExposure {
                    if dev.isExposureModeSupported(.continuousAutoExposure) { dev.exposureMode = .continuousAutoExposure }
                } else {
                    let f = dev.activeFormat
                    var dur = CMTime(value: 1, timescale: CMTimeScale(shutterDenominator))
                    // Ne ilgiau nei vienas kadras, kitaip iOS sumažina FPS
                    let maxDur = CMTimeMinimum(f.maxExposureDuration, dev.activeVideoMaxFrameDuration)
                    dur = CMTimeClampToRange(dur, range: CMTimeRange(start: f.minExposureDuration, end: maxDur))
                    let clampedISO = min(max(iso, f.minISO), f.maxISO)
                    dev.setExposureModeCustom(duration: dur, iso: clampedISO, completionHandler: nil)
                }
                dev.unlockForConfiguration()
            } catch { print("Ekspozicijos klaida: \(error)") }
        }
    }

    private func applyFocus() {
        queue.async { [self] in
            guard let dev = device else { return }
            do {
                try dev.lockForConfiguration()
                if autoFocus {
                    if dev.isFocusModeSupported(.continuousAutoFocus) { dev.focusMode = .continuousAutoFocus }
                } else if dev.isLockingFocusWithCustomLensPositionSupported {
                    dev.setFocusModeLocked(lensPosition: focus, completionHandler: nil)
                }
                dev.unlockForConfiguration()
            } catch { print("Fokuso klaida: \(error)") }
        }
    }

    private func applyWB() {
        queue.async { [self] in
            guard let dev = device else { return }
            do {
                try dev.lockForConfiguration()
                if autoWB {
                    if dev.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) {
                        dev.whiteBalanceMode = .continuousAutoWhiteBalance
                    }
                } else if dev.isLockingWhiteBalanceWithCustomDeviceGainsSupported {
                    let tt = AVCaptureDevice.WhiteBalanceTemperatureAndTintValues(temperature: kelvin, tint: 0)
                    var g = dev.deviceWhiteBalanceGains(for: tt)
                    let m = dev.maxWhiteBalanceGain
                    g.redGain = min(max(g.redGain, 1), m)
                    g.greenGain = min(max(g.greenGain, 1), m)
                    g.blueGain = min(max(g.blueGain, 1), m)
                    dev.setWhiteBalanceModeLocked(with: g, completionHandler: nil)
                }
                dev.unlockForConfiguration()
            } catch { print("WB klaida: \(error)") }
        }
    }

    // MARK: NDI

    // Start/stop vykdome kameros eilėje, kad stop() nesunaikintų NDI instancijos kadro siuntimo metu.
    func toggleSending() {
        let shouldStart = !sending, name = sourceName
        queue.async { [self] in
            if shouldStart { sender.start(name: name) } else { sender.stop() }
            let running = sender.isRunning
            DispatchQueue.main.async { self.sending = running }
        }
    }

    // MARK: Kadrų gavimas

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard sender.isRunning, let pb = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        sender.send(pb, fps: fps)
    }
}
