import type { TimingAst, TimingTrack, TimingTrackKind, TimingEvent } from '../../ast/timing.js';

const WRAPPER = /^@(start|end)\w+/i;
const LINE_COMMENT = /^\s*'/;
const TITLE = /^title\s+(.+)\s*$/i;

const TRACK_DECL = new RegExp(
  String.raw`^(robust|concise|binary|clock)\s+` +
    String.raw`(?:"([^"]+)"|(\S+))` +
    String.raw`(?:\s+as\s+(\S+))?` +
    String.raw`(?:\s+(.+))?\s*$`,
  'i',
);

const PERIOD_HINT = /\bperiod\s+(\d+)/i;

// "@time" lines: @0, @100, @+50, @"label"
const TIME_LINE = /^@(\+?-?\d+)\s*$/;

// "ID is State" or "ID is "Long State""
const IS_LINE = new RegExp(
  String.raw`^(\S+)\s+is\s+(?:"([^"]+)"|(.+?))\s*$`,
  'i',
);

export function parseTiming(source: string): TimingAst {
  const tracks: TimingTrack[] = [];
  const events: TimingEvent[] = [];
  const trackById = new Map<string, TimingTrack>();
  let title = '';
  let parseError = '';
  let currentTime: number | null = null;

  const lines = source.split(/\r\n|\r|\n/);

  try {
    for (const raw of lines) {
      const text = raw.trim();
      if (!text) continue;
      if (LINE_COMMENT.test(text)) continue;
      if (WRAPPER.test(text)) continue;

      const tm = TITLE.exec(text);
      if (tm) {
        title = tm[1]!.trim();
        continue;
      }

      const decl = TRACK_DECL.exec(text);
      if (decl) {
        const kind = decl[1]!.toLowerCase() as TimingTrackKind;
        const name = (decl[2] ?? decl[3] ?? '').trim();
        const id = (decl[4] ?? name).trim();
        const trailing = decl[5] ?? '';
        const periodMatch = PERIOD_HINT.exec(trailing);
        const period = periodMatch ? Number(periodMatch[1]) : undefined;
        if (!trackById.has(id)) {
          const track: TimingTrack = { id, name, kind };
          if (period !== undefined && Number.isFinite(period) && period > 0) {
            track.period = period;
          }
          tracks.push(track);
          trackById.set(id, track);
        }
        continue;
      }

      const tl = TIME_LINE.exec(text);
      if (tl) {
        const raw = tl[1]!;
        if (raw.startsWith('+')) {
          const delta = Number(raw.slice(1));
          currentTime = (currentTime ?? 0) + delta;
        } else {
          currentTime = Number(raw);
        }
        continue;
      }

      const il = IS_LINE.exec(text);
      if (il && currentTime !== null) {
        const id = il[1]!.trim();
        const state = (il[2] ?? il[3] ?? '').trim();
        if (!trackById.has(id)) {
          // Implicit declaration as concise (sensible default for a referenced
          // track that lacks a declaration).
          const track: TimingTrack = { id, name: id, kind: 'concise' };
          tracks.push(track);
          trackById.set(id, track);
        }
        events.push({ time: currentTime, trackId: id, state });
        continue;
      }
    }
  } catch (e) {
    parseError = e instanceof Error ? e.message : String(e);
  }

  events.sort((a, b) => a.time - b.time);

  return { kind: 'timing', title, tracks, events, parseError };
}
