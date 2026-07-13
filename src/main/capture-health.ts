export interface CaptureFrameHealth {
  blank: boolean;
  width: number;
  height: number;
}

export type CaptureHealthAssessment =
  | { valid: true; reason: null }
  | { valid: false; reason: string };

export class CaptureHealth {
  private blankFrames = 0;

  assess(frame: CaptureFrameHealth): CaptureHealthAssessment {
    if (frame.width <= 1 || frame.height <= 1) return { valid: false, reason: 'target emitted an invalid frame size' };
    this.blankFrames = frame.blank ? this.blankFrames + 1 : 0;
    if (this.blankFrames >= 3) return { valid: false, reason: 'target emitted repeated blank frames' };
    return { valid: true, reason: null };
  }

  reset(): void {
    this.blankFrames = 0;
  }
}
