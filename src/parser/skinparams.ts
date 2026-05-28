/**
 * Shared `skinparam` pre-pass used by sequence- and use-case-diagram parsers.
 *
 * Strips `skinparam` directives from the line list and collects them into a
 * flat key→value map keyed by lower-cased property name. Both one-liner
 * (`skinparam backgroundColor #EEEBDC`) and block forms
 * (`skinparam sequence { ... }`) are supported. The group name in the block
 * form is informational — keys are flattened into the same map.
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
        continue;
      }
      if (!text || text.startsWith("'")) continue;
      // Stereotype-scoped key form: `PropertyName<< Stereo >> value` (or with
      // a space before `<<`). Keep the `<<stereo>>` glued to the property side
      // so the resulting flat key encodes both selector dimensions, e.g.
      // `backgroundcolor<<main>>`. Whitespace inside the guillemets is
      // collapsed and lower-cased so lookup is case-insensitive.
      const scoped = /^([A-Za-z][A-Za-z0-9_]*)\s*<<\s*([^<>]+?)\s*>>\s+(.+)$/.exec(text);
      if (scoped) {
        const prop = scoped[1]!.toLowerCase();
        const stereo = scoped[2]!.trim().toLowerCase();
        skin[`${prop}<<${stereo}>>`] = scoped[3]!.trim();
        continue;
      }
      const m = /^(\S+)\s+(.+)$/.exec(text);
      if (m) skin[m[1]!.toLowerCase()] = m[2]!.trim();
      continue;
    }

    // Block form: `skinparam <group> {` (possibly with body opening on next line).
    const blockOpen = /^skinparam\s+\S+\s*\{\s*$/i.exec(text);
    if (blockOpen) {
      inSkinBlock = true;
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
