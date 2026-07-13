class CaptureHealth {
  constructor() {
    this.blankFrames = 0;
  }

  /** @param {{ blank: boolean, width: number, height: number }} frame */
  assess(frame) {
    if (frame.width <= 1 || frame.height <= 1) return { valid: false, reason: 'target emitted an invalid frame size' };
    this.blankFrames = frame.blank ? this.blankFrames + 1 : 0;
    if (this.blankFrames >= 3) return { valid: false, reason: 'target emitted repeated blank frames' };
    return { valid: true, reason: null };
  }

  reset() {
    this.blankFrames = 0;
  }
}

module.exports = { CaptureHealth };
