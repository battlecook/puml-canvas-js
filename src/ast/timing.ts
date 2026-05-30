export type TimingTrackKind =
  | 'robust'
  | 'concise'
  | 'binary'
  | 'clock'
  | 'rectangle'
  | 'analog';

export interface TimingTrack {
  id: string;
  name: string;
  kind: TimingTrackKind;
  period?: number;
  /** Explicit y-axis minimum for `analog` tracks (`between N and M`). */
  min?: number;
  /** Explicit y-axis maximum for `analog` tracks (`between N and M`). */
  max?: number;
}

export interface TimingEvent {
  time: number;
  trackId: string;
  /** State string, or a numeric sample for `analog` tracks. */
  state: string | number;
  /** Optional inline annotation: `is state : note`. */
  note?: string;
}

export interface TimingScale {
  units: number;
  pixels: number;
}

export interface TimingMeasurement {
  track1?: string;
  time1: number;
  track2?: string;
  time2: number;
  label?: string;
}

/** Domain of the time axis. 'number' (default) or a date/clock domain. */
export type TimingDomain = 'number' | 'date' | 'clock';

export interface TimingAst {
  kind: 'timing';
  title: string;
  tracks: TimingTrack[];
  events: TimingEvent[];
  /** Named time anchors resolved to numeric times. */
  anchors?: Record<string, number>;
  /** Optional scale directive: N time units = M pixels. */
  scale?: TimingScale;
  /** Domain hint for the axis ("date" → render via dateFormat). */
  domain?: TimingDomain;
  /** Format string for axis labels when domain is 'date'. */
  dateFormat?: string;
  /** Hide the time-axis row entirely. */
  hideTimeAxis?: boolean;
  /** Only render explicit timestamps on the axis (no inferred ticks). */
  manualTimeAxis?: boolean;
  /** Inter-track horizontal measurements (a la `WB@0 <-> @50 : {lbl}`). */
  measurements?: TimingMeasurement[];
  parseError: string;
}
