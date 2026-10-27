import SwiftUI
import AVFoundation

struct PreviewView: UIViewRepresentable {
    let session: AVCaptureSession
    let onRotation: (CGFloat) -> Void

    final class VideoView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
        var onRotation: ((CGFloat) -> Void)?

        // Peržiūrą ir NDI vaizdą sukame pagal ekrano orientaciją (landscapeRight = 0°, landscapeLeft = 180°)
        override func layoutSubviews() {
            super.layoutSubviews()
            let angle: CGFloat = window?.windowScene?.interfaceOrientation == .landscapeLeft ? 180 : 0
            if let c = previewLayer.connection, c.isVideoRotationAngleSupported(angle) { c.videoRotationAngle = angle }
            onRotation?(angle)
        }
    }

    func makeUIView(context: Context) -> VideoView {
        let v = VideoView()
        v.previewLayer.session = session
        v.previewLayer.videoGravity = .resizeAspect
        v.onRotation = onRotation
        // Peržiūros jungtis atsiranda tik paleidus sesiją, tad tada pakartojame pasukimą
        NotificationCenter.default.addObserver(forName: .AVCaptureSessionDidStartRunning,
                                               object: session, queue: .main) { [weak v] _ in
            v?.setNeedsLayout()
        }
        return v
    }
    func updateUIView(_ uiView: VideoView, context: Context) {}
}

struct ContentView: View {
    @StateObject private var cam = CameraController()
    @State private var showControls = true

    var body: some View {
        ZStack(alignment: .bottom) {
            PreviewView(session: cam.session, onRotation: cam.setRotation)
                .ignoresSafeArea()
                .onTapGesture { withAnimation { showControls.toggle() } }

            if showControls {
                ScrollView {
                    VStack(spacing: 12) {
                        // Formatas
                        HStack {
                            Picker("Rezoliucija", selection: $cam.resolution) {
                                ForEach(Resolution.allCases) { Text($0.rawValue).tag($0) }
                            }.pickerStyle(.segmented)
                            Picker("FPS", selection: $cam.fps) {
                                ForEach(cam.fpsOptions, id: \.self) { Text("\($0)").tag($0) }
                            }.pickerStyle(.segmented)
                        }

                        // Ekspozicija
                        Toggle("Auto ekspozicija", isOn: $cam.autoExposure)
                        if !cam.autoExposure {
                            labeled("ISO \(Int(cam.iso))") {
                                Slider(value: $cam.iso, in: cam.isoRange)
                            }
                            labeled("Užraktas 1/\(Int(cam.shutterDenominator))") {
                                Slider(value: $cam.shutterDenominator, in: 24...2000, step: 1)
                            }
                        }

                        // Fokusas
                        Toggle("Auto fokusas", isOn: $cam.autoFocus)
                        if !cam.autoFocus {
                            labeled("Fokusas") { Slider(value: $cam.focus, in: 0...1) }
                        }

                        // Baltas
                        Toggle("Auto WB", isOn: $cam.autoWB)
                        if !cam.autoWB {
                            labeled("WB \(Int(cam.kelvin)) K") {
                                Slider(value: $cam.kelvin, in: 2500...9000, step: 50)
                            }
                        }

                        // NDI
                        TextField("NDI pavadinimas", text: $cam.sourceName)
                            .textFieldStyle(.roundedBorder)
                            .disabled(cam.sending)
                        Button {
                            cam.toggleSending()
                        } label: {
                            Text(cam.sending ? "STOP NDI" : "START NDI")
                                .bold().frame(maxWidth: .infinity).padding()
                                .background(cam.sending ? Color.red : Color.green)
                                .foregroundColor(.white).cornerRadius(10)
                        }
                    }
                    .padding()
                }
                .frame(maxHeight: 420)
                .background(.ultraThinMaterial)
            }
        }
        .onAppear { cam.start() }
    }

    private func labeled<C: View>(_ title: String, @ViewBuilder content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.caption)
            content()
        }
    }
}
