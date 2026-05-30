/**
 * Shared `skinparam` pre-pass used by sequence- and use-case-diagram parsers.
 *
 * Strips `skinparam` directives from the line list and collects them into a
 * flat key→value map keyed by lower-cased property name. Both one-liner
 * (`skinparam backgroundColor #EEEBDC`) and block forms
 * (`skinparam sequence { ... }`) are supported.
 *
 * Top-level (one-liner) keys are stored unprefixed (e.g. `backgroundcolor`).
 * Keys nested inside a `skinparam <group> { ... }` block are stored with the
 * group name as a dotted prefix (e.g. `usecase.backgroundcolor`,
 * `sequence.actorbackgroundcolor`). This preserves the selector dimension so
 * downstream layout can distinguish "canvas background"
 * (`skinparam backgroundColor X`) from "usecase ellipse fill"
 * (`skinparam usecase { BackgroundColor X }`) — both would otherwise collapse
 * onto the same flat key. Layout readers typically prefer the prefixed form
 * for their own scope, falling back to the unprefixed top-level form.
 *
 * Returns the surviving lines and the populated skin map; downstream parsing
 * sees the surviving lines only.
 */
export function extractSkinparams(
  rawLines: string[],
): { lines: string[]; skin: Record<string, string> } {
  const out: string[] = [];
  const skin: Record<string, string> = {};
  let inBlockComment = false;
  let inSkinBlock = false;
  let blockGroup = '';

  for (const raw of rawLines) {
    const text = raw.trim();

    if (inBlockComment) {
      out.push(raw);
      if (text.includes("'/")) inBlockComment = false;
      continue;
    }
    if (text.startsWith("/'")) {
      out.push(raw);
      if (!text.includes("'/", 2)) inBlockComment = true;
      continue;
    }

    if (inSkinBlock) {
      if (text === '}' || /^\}\s*$/.test(text)) {
        inSkinBlock = false;
        blockGroup = '';
        continue;
      }
      if (!text || text.startsWith("'")) continue;
      // Stereotype-scoped key form: `PropertyName<< Stereo >> value` (or with
      // a space before `<<`). Keep the `<<stereo>>` glued to the property side
      // so the resulting flat key encodes both selector dimensions, e.g.
      // `usecase.backgroundcolor<<main>>`. Whitespace inside the guillemets
      // is collapsed and lower-cased so lookup is case-insensitive.
      const scoped = /^([A-Za-z][A-Za-z0-9_]*)\s*<<\s*([^<>]+?)\s*>>\s+(.+)$/.exec(text);
      if (scoped) {
        const prop = scoped[1]!.toLowerCase();
        const stereo = scoped[2]!.trim().toLowerCase();
        const prefix = blockGroup ? `${blockGroup}.` : '';
        skin[`${prefix}${prop}<<${stereo}>>`] = scoped[3]!.trim();
        continue;
      }
      const m = /^(\S+)\s+(.+)$/.exec(text);
      if (m) {
        const prop = m[1]!.toLowerCase();
        const prefix = blockGroup ? `${blockGroup}.` : '';
        skin[`${prefix}${prop}`] = m[2]!.trim();
      }
      continue;
    }

    // Block form: `skinparam <group> {` (possibly with body opening on next line).
    const blockOpen = /^skinparam\s+(\S+)\s*\{\s*$/i.exec(text);
    if (blockOpen) {
      inSkinBlock = true;
      blockGroup = blockOpen[1]!.toLowerCase();
      continue;
    }
    // One-liner: `skinparam <key> <value...>`.
    const oneLiner = /^skinparam\s+(\S+)\s+(.+)$/i.exec(text);
    if (oneLiner) {
      skin[oneLiner[1]!.toLowerCase()] = oneLiner[2]!.trim();
      continue;
    }

    out.push(raw);
  }

  return { lines: out, skin };
}
