import type {
  TimingAst,
  TimingTrack,
  TimingTrackKind,
  TimingEvent,
  TimingDomain,
  TimingMeasurement,
} from '../../ast/timing.js';

const WRAPPER = /^@(start|end)\w+/i;
const LINE_COMMENT = /^\s*'/;
const TITLE = /^title\s+(.+)\s*$/i;

const TRACK_DECL = new RegExp(
  String.raw`^(robust|concise|binary|clock|rectangle)\s+` +
    String.raw`(?:"([^"]+)"|(\S+))` +
    String.raw`(?:\s+as\s+(\S+))?` +
    String.raw`(?:\s+(.+))?\s*$`,
  'i',
);

// `analog "Name" as Id` and `analog "Name" between MIN and MAX as Id`.
// The `between` form binds an explicit y-axis range; without it the renderer
// falls back to 0..max(values).
const ANALOG_DECL_BETWEEN = new RegExp(
  String.raw`^analog\s+` +
    String.raw`(?:"([^"]+)"|(\S+))\s+` +
    String.raw`between\s+(-?\d+(?:\.\d+)?)\s+and\s+(-?\d+(?:\.\d+)?)` +
    String.raw`\s+as\s+(\S+)\s*$`,
  'i',
);

const ANALOG_DECL_BASIC = new RegExp(
  String.raw`^analog\s+` +
    String.raw`(?:"([^"]+)"|(\S+))` +
    String.raw`(?:\s+as\s+(\S+))?\s*$`,
  'i',
);

const PERIOD_HINT = /\bperiod\s+(\d+)/i;

// "@time" lines: @0, @100, @+50, @"label"
const TIME_LINE = /^@(\+?-?\d+)\s*$/;

// Date-stamp: "@YYYY/MM/DD"
const TIME_DATE = /^@(\d{4})\/(\d{1,2})\/(\d{1,2})\s*$/;

// Clock-stamp: "@HH:MM:SS"
const TIME_CLOCK = /^@(\d{1,2}):(\d{2}):(\d{2})\s*$/;

// "@N as :name" — define a named anchor at numeric time N
const TIME_ANCHOR_DEF = /^@(-?\d+)\s+as\s+:(\S+)\s*$/;

// "@:name" — set cursor to a named anchor
const TIME_ANCHOR_REF = /^@:(\S+)\s*$/;

// "@:name+N" / "@:name-N" — cursor at named anchor ± offset
const TIME_ANCHOR_OFFSET = /^@:(\S+)([+-])(\d+)\s*$/;

// "@:name+N as :newname" — define new anchor relative to an existing one
const TIME_ANCHOR_OFFSET_DEF =
  /^@:(\S+)([+-])(\d+)\s+as\s+:(\S+)\s*$/;

// "@TrackId" — open a track-scope block. Disambiguated from numeric/anchor
// forms at call time by checking declared track ids.
const TRACK_SCOPE = /^@(\S+)\s*$/;

// Track-scoped absolute time event: "N is State" or "N is "Long State""
const SCOPED_ABS_LINE = new RegExp(
  String.raw`^(\d+)\s+is\s+(?:"([^"]+)"|(.+?))\s*$`,
  'i',
);

// Track-scoped relative time event: "+N is State"
const SCOPED_REL_LINE = new RegExp(
  String.raw`^\+(\d+)\s+is\s+(?:"([^"]+)"|(.+?))\s*$`,
  'i',
);

// "scale N as M pixels" / "scale N as M pixel"
const SCALE_LINE = /^scale\s+(\d+)\s+as\s+(\d+)\s+pixels?\s*$/i;

// `use date format "FMT"` — set axis label format
const USE_DATE_FORMAT = /^use\s+date\s+format\s+"([^"]+)"\s*$/i;

// `hide time-axis`
const HIDE_TIME_AXIS = /^hide\s+time[-_ ]?axis\s*$/i;

// `manual time-axis`
const MANUAL_TIME_AXIS = /^manual\s+time[-_ ]?axis\s*$/i;

// Inter-track measurement: `[Track]@time <-> [Track]@time : {label}`
// Times accept absolute (\d+) or relative-on-right (`+N`). Label is in braces
// and is optional. The `:` is optional too.
const MEASURE_LINE = new RegExp(
  String.raw`^(\S+)?@(\+?\d+)\s*<->\s*(\S+)?@(\+?\d+)` +
    String.raw`(?:\s*:\s*\{([^}]*)\})?\s*$`,
);

// "ID is State" or "ID is "Long State"" with optional " : note"
// State portion either quoted ("..."), the bare `{hidden}` marker, or an
// unquoted run terminated by an optional " : note" tail.
const IS_LINE = new RegExp(
  String.raw`^(\S+)\s+is\s+` +
    String.raw`(?:"([^"]+)"|(\{hidden\})|(.+?))` +
    String.raw`(?:\s+:\s+(.+?))?\s*$`,
  'i',
);

/**
 * Coerce an event's raw state to a number when the track is `analog`. Any
 * other track kind keeps the original string. If an analog track somehow
 * receives a non-numeric label, fall back to NaN-rejecting behavior by
 * keeping the original string — the layout's numeric filter will skip it.
 */
function coerceState(
  track: TimingTrack | undefined,
  rawState: string,
): string | number {
  if (track && track.kind === 'analog') {
    const n = Number(rawState);
    if (Number.isFinite(n)) return n;
  }
  return rawState;
}

export function parseTiming(source: string): TimingAst {
  const tracks: TimingTrack[] = [];
  const events: TimingEvent[] = [];
  const measurements: TimingMeasurement[] = [];
  const trackById = new Map<string, TimingTrack>();
  let title = '';
  let parseError = '';
  let currentTime: number | null = null;
  let currentTrack: string | null = null;
  const lastTimeOnTrack = new Map<string, number>();
  const anchors = new Map<string, number>();
  let scale: { units: number; pixels: number } | undefined;
  let domain: TimingDomain | undefined;
  let dateFormat: string | undefined;
  let hideTimeAxis = false;
  let manualTimeAxis = false;

  const resolveAnchor = (name: string): number => anchors.get(name) ?? 0;

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

      const scaleMatch = SCALE_LINE.exec(text);
      if (scaleMatch) {
        const units = Number(scaleMatch[1]!);
        const pixels = Number(scaleMatch[2]!);
        if (units > 0 && pixels > 0) {
          scale = { units, pixels };
        }
        continue;
      }

      const udf = USE_DATE_FORMAT.exec(text);
      if (udf) {
        dateFormat = udf[1]!;
        if (!domain) domain = 'date';
        continue;
      }

      if (HIDE_TIME_AXIS.test(text)) {
        hideTimeAxis = true;
        continue;
      }

      if (MANUAL_TIME_AXIS.test(text)) {
        manualTimeAxis = true;
        continue;
      }

      // Analog tracks have their own declaration grammar (with an optional
      // explicit `between MIN and MAX` y-range). Match these BEFORE the
      // generic TRACK_DECL since "analog" is not part of that alternation.
      const analogBetween = ANALOG_DECL_BETWEEN.exec(text);
      if (analogBetween) {
        const name = (analogBetween[1] ?? analogBetween[2] ?? '').trim();
        const min = Number(analogBetween[3]!);
        const max = Number(analogBetween[4]!);
        const id = analogBetween[5]!.trim();
        if (!trackById.has(id)) {
          const track: TimingTrack = { id, name, kind: 'analog', min, max };
          tracks.push(track);
          trackById.set(id, track);
        }
        continue;
      }
      const analogBasic = ANALOG_DECL_BASIC.exec(text);
      if (analogBasic) {
        const name = (analogBasic[1] ?? analogBasic[2] ?? '').trim();
        const id = (analogBasic[3] ?? name).trim();
        if (!trackById.has(id)) {
          const track: TimingTrack = { id, name, kind: 'analog' };
          tracks.push(track);
          trackById.set(id, track);
        }
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

      // Inter-track measurement. Try before bare TIME_LINE so `@N <-> @M`
      // forms (which also start with `@N`) aren't consumed by TIME_LINE.
      const meas = MEASURE_LINE.exec(text);
      if (meas) {
        const t1Raw = meas[2]!;
        const t2Raw = meas[4]!;
        const t1 = Number(t1Raw.startsWith('+') ? t1Raw.slice(1) : t1Raw);
        let t2: number;
        if (t2Raw.startsWith('+')) {
          t2 = t1 + Number(t2Raw.slice(1));
        } else {
          t2 = Number(t2Raw);
        }
        const m: TimingMeasurement = { time1: t1, time2: t2 };
        if (meas[1]) m.track1 = meas[1];
        if (meas[3]) m.track2 = meas[3];
        if (meas[5] !== undefined) m.label = meas[5];
        measurements.push(m);
        continue;
      }

      // Order matters: anchor patterns are more specific than TIME_LINE.
      const tad = TIME_ANCHOR_OFFSET_DEF.exec(text);
      if (tad) {
        const base = resolveAnchor(tad[1]!);
        const sign = tad[2] === '-' ? -1 : 1;
        const off = Number(tad[3]!);
        const t = base + sign * off;
        anchors.set(tad[4]!, t);
        currentTime = t;
        currentTrack = null;
        continue;
      }

      const tdef = TIME_ANCHOR_DEF.exec(text);
      if (tdef) {
        const t = Number(tdef[1]!);
        anchors.set(tdef[2]!, t);
        currentTime = t;
        currentTrack = null;
        continue;
      }

      const tao = TIME_ANCHOR_OFFSET.exec(text);
      if (tao) {
        const base = resolveAnchor(tao[1]!);
        const sign = tao[2] === '-' ? -1 : 1;
        const off = Number(tao[3]!);
        currentTime = base + sign * off;
        currentTrack = null;
        continue;
      }

      const tar = TIME_ANCHOR_REF.exec(text);
      if (tar) {
        currentTime = resolveAnchor(tar[1]!);
        currentTrack = null;
        continue;
      }

      const tdate = TIME_DATE.exec(text);
      if (tdate) {
        const y = Number(tdate[1]!);
        const mo = Number(tdate[2]!);
        const d = Number(tdate[3]!);
        // Unix seconds at UTC midnight of that date.
        const t = Math.floor(Date.UTC(y, mo - 1, d) / 1000);
        currentTime = t;
        currentTrack = null;
        if (!domain) domain = 'date';
        continue;
      }

      const tclock = TIME_CLOCK.exec(text);
      if (tclock) {
        const hh = Number(tclock[1]!);
        const mm = Number(tclock[2]!);
        const ss = Number(tclock[3]!);
        currentTime = hh * 3600 + mm * 60 + ss;
        currentTrack = null;
        if (!domain) domain = 'clock';
        continue;
      }

      const tl = TIME_LINE.exec(text);
      if (tl) {
        const rawT = tl[1]!;
        if (rawT.startsWith('+')) {
          const delta = Number(rawT.slice(1));
          currentTime = (currentTime ?? 0) + delta;
        } else {
          currentTime = Number(rawT);
        }
        currentTrack = null;
        continue;
      }

      // "@TrackId" — track-scope opener. Match only if the token names a
      // declared track id (so it does not steal numeric or anchor forms,
      // which were already matched above).
      const tscope = TRACK_SCOPE.exec(text);
      if (tscope && trackById.has(tscope[1]!)) {
        currentTrack = tscope[1]!;
        continue;
      }

      // Track-scoped events take effect only inside an @TrackId block.
      if (currentTrack !== null) {
        const rel = SCOPED_REL_LINE.exec(text);
        if (rel) {
          const delta = Number(rel[1]!);
          const prev = lastTimeOnTrack.get(currentTrack);
          const t = (prev ?? 0) + delta;
          const rawState = (rel[2] ?? rel[3] ?? '').trim();
          const state = coerceState(trackById.get(currentTrack), rawState);
          events.push({ time: t, trackId: currentTrack, state });
          lastTimeOnTrack.set(currentTrack, t);
          continue;
        }
        const abs = SCOPED_ABS_LINE.exec(text);
        if (abs) {
          const t = Number(abs[1]!);
          const rawState = (abs[2] ?? abs[3] ?? '').trim();
          const state = coerceState(trackById.get(currentTrack), rawState);
          events.push({ time: t, trackId: currentTrack, state });
          lastTimeOnTrack.set(currentTrack, t);
          continue;
        }
      }

      const il = IS_LINE.exec(text);
      if (il && currentTime !== null) {
        const id = il[1]!.trim();
        const quoted = il[2];
        const hidden = il[3];
        const bare = il[4];
        const note = il[5];
        let rawState: string;
        if (quoted !== undefined) rawState = quoted;
        else if (hidden !== undefined) rawState = '{hidden}';
        else rawState = (bare ?? '').trim();
        if (!trackById.has(id)) {
          // Implicit declaration as concise (sensible default for a referenced
          // track that lacks a declaration).
          const track: TimingTrack = { id, name: id, kind: 'concise' };
          tracks.push(track);
          trackById.set(id, track);
        }
        const state = coerceState(trackById.get(id), rawState);
        const ev: TimingEvent = { time: currentTime, trackId: id, state };
        if (note !== undefined && note.trim()) ev.note = note.trim();
        events.push(ev);
        continue;
      }
    }
  } catch (e) {
    parseError = e instanceof Error ? e.message : String(e);
  }

  events.sort((a, b) => a.time - b.time);

  const ast: TimingAst = { kind: 'timing', title, tracks, events, parseError };
  if (anchors.size > 0) {
    ast.anchors = Object.fromEntries(anchors);
  }
  if (scale) {
    ast.scale = scale;
  }
  if (domain) {
    ast.domain = domain;
  }
  if (dateFormat) {
    ast.dateFormat = dateFormat;
  }
  if (hideTimeAxis) {
    ast.hideTimeAxis = true;
  }
  if (manualTimeAxis) {
    ast.manualTimeAxis = true;
  }
  if (measurements.length > 0) {
    ast.measurements = measurements;
  }
  return ast;
}
