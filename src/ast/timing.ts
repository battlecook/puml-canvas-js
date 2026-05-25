export type TimingTrackKind = 'robust' | 'concise' | 'binary' | 'clock';

export interface TimingTrack {
  id: string;
  name: string;
  kind: TimingTrackKind;
  period?: number;
}

export interface TimingEvent {
  time: number;
  trackId: string;
  state: string;
}

export interface TimingAst {
  kind: 'timing';
  title: string;
  tracks: TimingTrack[];
  events: TimingEvent[];
  parseError: string;
}
