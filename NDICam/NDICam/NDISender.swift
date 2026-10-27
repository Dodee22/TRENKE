import Foundation
import CoreVideo

/// Plonas NDI SDK apvalkalas: siunčia CVPixelBuffer (BGRA) kaip NDI šaltinį.
final class NDISender {
    private var instance: NDIlib_send_instance_t?
    private(set) var isRunning = false

    func start(name: String) {
        guard !isRunning else { return }
        guard NDIlib_initialize() else {
            print("NDI: nepavyko inicializuoti (ar įtraukta libndi?)")
            return
        }
        name.withCString { cName in
            var desc = NDIlib_send_create_t()
            desc.p_ndi_name = cName
            desc.p_groups = nil
            desc.clock_video = false   // laiką diktuoja kamera, ne NDI
            desc.clock_audio = false
            instance = NDIlib_send_create(&desc)
        }
        isRunning = instance != nil
    }

    func stop() {
        guard isRunning, let inst = instance else { return }
        NDIlib_send_destroy(inst)
        instance = nil
        isRunning = false
    }

    func send(_ pixelBuffer: CVPixelBuffer, fps: Int) {
        guard isRunning, let inst = instance else { return }

        CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(pixelBuffer) else { return }

        let w = CVPixelBufferGetWidth(pixelBuffer)
        let h = CVPixelBufferGetHeight(pixelBuffer)

        var frame = NDIlib_video_frame_v2_t()
        frame.xres = Int32(w)
        frame.yres = Int32(h)
        frame.FourCC = NDIlib_FourCC_video_type_BGRA
        frame.frame_rate_N = Int32(fps * 1000)
        frame.frame_rate_D = 1000
        frame.picture_aspect_ratio = Float(w) / Float(h)
        frame.frame_format_type = NDIlib_frame_format_type_progressive
        frame.timecode = Int64.max // = NDIlib_send_timecode_synthesize (makro neimportuojamas į Swift)
        frame.p_data = base.assumingMemoryBound(to: UInt8.self)
        frame.line_stride_in_bytes = Int32(CVPixelBufferGetBytesPerRow(pixelBuffer))

        // Sinchroninis siuntimas: grįžta kai kadras suspaustas ir paimtas.
        NDIlib_send_send_video_v2(inst, &frame)
    }

    func connectionCount() -> Int {
        guard let inst = instance else { return 0 }
        return Int(NDIlib_send_get_no_connections(inst, 0))
    }
}
