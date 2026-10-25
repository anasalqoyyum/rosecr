import type { CaptureWorkerReport } from '../main/capture-coordinator';
import type { CaptureTarget, ControlState } from '../main/control-state';
import type { ControlCommand } from '../shared/contracts';
import type { CaptureStartOptions } from '../preload/capture-preload';
import type { RegionSelection, RegionSelectorInit } from '../main/region-selector';

declare global {
  interface Window {
    rosecr: {
      getState(): Promise<ControlState>;
      command(command: ControlCommand): Promise<ControlState>;
      listTargets(): Promise<CaptureTarget[]>;
      selectTarget(sourceId: string): Promise<ControlState>;
      selectRegion(): Promise<ControlState>;
      startCaptureProbe(): Promise<ControlState>;
      stopCaptureProbe(): Promise<ControlState>;
      onStateChanged(listener: (state: ControlState) => void): () => void;
    };
    captureProbe: {
      onStop(listener: () => void): void;
      report(report: CaptureWorkerReport): void;
    };
    regionSelector: {
      initial(): Promise<RegionSelectorInit | null>;
      finish(selection: RegionSelection): void;
    };
    captureProbeRuntime: {
      start(options: CaptureStartOptions): Promise<CaptureWorkerReport>;
      stop(): void;
    };
  }
}

export {};
