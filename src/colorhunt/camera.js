// Wraps getUserMedia, the live center-color sampling and full-frame capture.
// Sampling averages a small central crop of the video for a stable reading.

export class CameraManager {
  constructor(videoEl) {
    this.video = videoEl;
    this.stream = null;

    // Tiny offscreen canvas used to average the central region.
    this.sampleCanvas = document.createElement('canvas');
    this.sampleCanvas.width = 32;
    this.sampleCanvas.height = 32;
    this.sampleCtx = this.sampleCanvas.getContext('2d', { willReadFrequently: true });

    // Fraction of the smaller video dimension used as the sample square.
    this.sampleFraction = 0.28;
  }

  async start() {
    // Prefer the rear camera on phones; fall back to any camera.
    const tries = [
      { video: { facingMode: { ideal: 'environment' } }, audio: false },
      { video: true, audio: false },
    ];
    let lastErr;
    for (const constraints of tries) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!this.stream) throw lastErr || new Error('Caméra indisponible');

    this.video.srcObject = this.stream;
    this.video.setAttribute('playsinline', '');
    this.video.muted = true;
    await this.video.play();
    return true;
  }

  _centerRect() {
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    const side = Math.min(vw, vh) * this.sampleFraction;
    return { sx: (vw - side) / 2, sy: (vh - side) / 2, side, vw, vh };
  }

  // Returns the averaged [r,g,b] of the central region, or null if not ready.
  sampleCenter() {
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (!vw || !vh) return null;

    const { sx, sy, side } = this._centerRect();
    this.sampleCtx.drawImage(this.video, sx, sy, side, side, 0, 0, 32, 32);
    const data = this.sampleCtx.getImageData(0, 0, 32, 32).data;

    let r = 0, g = 0, b = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  }

  // Draw the current frame into a display canvas (the "photo").
  capturePhoto(canvas) {
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(this.video, 0, 0, vw, vh);
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }
}
