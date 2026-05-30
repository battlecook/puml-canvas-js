/**
 * Pre-pass that translates the small subset of the PlantUML Archimate "macro
 * library" (`<archimate/Archimate>`) we recognise into plain PlantUML the
 * existing container parser already accepts. The library itself is a set of
 * `!define` macros and bundled sprites; rather than implement the
 * preprocessor, we hard-code the common expansions and strip the directives /
 * sprite declarations that wrap them.
 *
 * Scope (intentionally narrow):
 *   - Drop preprocessor directives we cannot expand: `!define`, `!include`,
 *     `!pragma`, `!option`, `!undef`, `!if`, `!else`, `!endif`, `!while`,
 *     `!endwhile`, `!foreach`, `!endfor`, `!function`, `!endfunction`,
 *     `!procedure`, `!endprocedure`, `!log`, `!assert`. The top-level
 *     compile() banner still surfaces these as "Preprocessor not supported"
 *     so users know the input contained directives.
 *   - Drop `sprite $name <data>` declarations (single-line jar references).
 *     We do not render the sprite image; the reference itself in a
 *     `<<$name>>` stereotype is simplified by stripping the `$` so the
 *     parser sees a regular stereotype.
 *   - Drop the `listsprite` line — PlantUML emits a sprite-listing helper;
 *     we render nothing.
 *   - Drop `legend [left|right|center] ... endlegend` blocks entirely.
 *   - Drop `skinparam <key>(<<stereo>>)? { ... }` blocks (the body is a
 *     property map we don't honour). One-liner skinparams pass through
 *     unchanged for the existing parsers to ignore.
 *   - Expand Archimate macro calls (`Motivation_Stakeholder(id, "label")`,
 *     `Rel_Composition(a, b, "label")`, …) into the plain PlantUML the
 *     container parser already handles. Unknown macros that look like a
 *     macro call (`Foo_Bar(...)`) are dropped silently.
 *   - Inside any surviving stereotype `<<$name>>`, strip the leading `$` so
 *     downstream stereotype handlers see a regular identifier.
 *   - Merge adjacent `<<a>><<b>>` stereotype tags into `<<a, b>>` so the
 *     single-stereotype-slot decl regex in the container parser still
 *     matches.
 */

const SKIP_DIRECTIVE_RE =
  /^\s*!(?:define(?:long)?|include(?:url|sub|_many)?|pragma|option|undef|if|elseif|else|endif|while|endwhile|foreach|endfor|function|endfunction|procedure|endprocedure|log|assert|theme|import)\b/i;

const SPRITE_DECL_RE = /^\s*sprite\s+\$?\S+/i;
const LISTSPRITE_RE = /^\s*listsprite\s*$/i;
const LEGEND_OPEN_RE = /^\s*legend(?:\s+(?:left|right|center|top|bottom))?\s*$/i;
const LEGEND_CLOSE_RE = /^\s*end\s*legend\s*$/i;
// Stereotype-scoped `skinparam X<<stereo>> { ... }` block. The unscoped form
// (`skinparam sequence { ... }`) is left intact so the existing per-kind
// `extractSkinparams` pass can still pick up its body. We only swallow the
// scoped form because the body keys (`roundCorner 25` etc.) are not honoured
// by any current renderer and would otherwise leak through as garbage lines.
const SKINPARAM_BLOCK_OPEN_RE = /^\s*skinparam\b[^{]*<<[^>]+>>[^{]*\{\s*$/i;

// Archimate-element macro names we recognise. Maps the macro identifier to a
// pair of stereotype label and a `#Layer` colour hint accepted by
// `applyContainerStyleSuffix` / `resolveArchimateLayer`.
const ELEMENT_MACROS: Record<string, { stereotype: string; layer: string }> = {
  // Motivation layer
  Motivation_Stakeholder:   { stereotype: 'Stakeholder',     layer: 'Motivation' },
  Motivation_Driver:        { stereotype: 'Driver',          layer: 'Motivation' },
  Motivation_Assessment:    { stereotype: 'Assessment',      layer: 'Motivation' },
  Motivation_Goal:          { stereotype: 'Goal',            layer: 'Motivation' },
  Motivation_Principle:     { stereotype: 'Principle',       layer: 'Motivation' },
  Motivation_Requirement:   { stereotype: 'Requirement',     layer: 'Motivation' },
  Motivation_Constraint:    { stereotype: 'Constraint',      layer: 'Motivation' },
  // Business layer
  Business_Actor:           { stereotype: 'Business Actor',   layer: 'Business' },
  Business_Role:            { stereotype: 'Business Role',    layer: 'Business' },
  Business_Service:         { stereotype: 'Business Service', layer: 'Business' },
  Business_Process:         { stereotype: 'Business Process', layer: 'Business' },
  Business_Function:        { stereotype: 'Business Function', layer: 'Business' },
  Business_Object:          { stereotype: 'Business Object',  layer: 'Business' },
  Business_Event:           { stereotype: 'Business Event',   layer: 'Business' },
  // Application layer
  Application_Component:    { stereotype: 'Application Component', layer: 'Application' },
  Application_Service:      { stereotype: 'Application Service',   layer: 'Application' },
  Application_Function:     { stereotype: 'Application Function',  layer: 'Application' },
  Application_DataObject:   { stereotype: 'Data Object',            layer: 'Application' },
  Application_Interface:    { stereotype: 'Application Interface',  layer: 'Application' },
  // Technology layer
  Technology_Node:          { stereotype: 'Node',                  layer: 'Technology' },
  Technology_Device:        { stereotype: 'Device',                layer: 'Technology' },
  Technology_Service:       { stereotype: 'Technology Service',    layer: 'Technology' },
  Technology_Artifact:      { stereotype: 'Artifact',              layer: 'Technology' },
  Technology_System:        { stereotype: 'System Software',       layer: 'Technology' },
};

// Relationship macro names → arrow token used by the existing parser. The
// container parser feeds the line through the class-style `parseRelationship`
// which understands these arrow shapes.
const REL_MACROS: Record<string, string> = {
  Rel_Composition:   '*--',
  Rel_Aggregation:   'o--',
  Rel_Assignment:    '--',
  Rel_Realization:   '..|>',
  Rel_Used_By:       '-->',
  Rel_Serving:       '-->',
  Rel_Access:        '..>',
  Rel_Influence:     '..>',
  Rel_Triggering:    '-->',
  Rel_Flow:          '-->',
  Rel_Specialization: '--|>',
  Rel_Association:   '--',
  Rel:               '-->',
};

const MACRO_CALL_RE = /^\s*([A-Z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+|[A-Z][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*$/;

/**
 * Best-effort split of a macro argument list. Splits on commas at top level
 * (not inside quoted strings) and trims each argument. Returns the raw
 * arguments including any surrounding quotes; callers strip quotes when
 * extracting the label.
 */
function splitArgs(raw: string): string[] {
  const out: string[] = [];
  let buf = '';
  let inQuote = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!;
    if (c === '"') {
      inQuote = !inQuote;
      buf += c;
      continue;
    }
    if (c === ',' && !inQuote) {
      out.push(buf.trim());
      buf = '';
      continue;
    }
    buf += c;
  }
  if (buf.trim().length > 0) out.push(buf.trim());
  return out;
}

function unquote(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Expand a single recognised macro call. Returns the replacement PlantUML
 * line, or `null` when the call looks like a macro but the name is unknown
 * (caller drops the line silently).
 */
function expandMacro(name: string, args: string[]): string | null {
  const elem = ELEMENT_MACROS[name];
  if (elem) {
    const id = args[0] ?? name;
    const label = args[1] !== undefined ? unquote(args[1]) : id;
    return `rectangle "${label}" as ${id} <<${elem.stereotype}>> #${elem.layer}`;
  }
  const rel = REL_MACROS[name];
  if (rel) {
    const src = args[0];
    const tgt = args[1];
    if (!src || !tgt) return null;
    const label = args[2] !== undefined ? unquote(args[2]) : '';
    return label ? `${src} ${rel} ${tgt} : ${label}` : `${src} ${rel} ${tgt}`;
  }
  return null;
}

/**
 * Public entry point. Returns the rewritten source string ready for the
 * existing diagram detector + per-kind parser. Operates line-by-line so the
 * original line ordering (and therefore declaration order in the AST) is
 * preserved.
 */
export function preprocessArchimateSource(source: string): string {
  const lines = source.split(/\r\n|\r|\n/);
  const out: string[] = [];
  let inLegend = false;
  let inSkinBlock = 0; // depth in case of nested braces inside the block

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const text = raw.trim();

    if (inLegend) {
      if (LEGEND_CLOSE_RE.test(text)) inLegend = false;
      continue;
    }
    if (inSkinBlock > 0) {
      // Count braces so a body line containing `{` keeps us in the block.
      for (const c of text) {
        if (c === '{') inSkinBlock++;
        else if (c === '}') inSkinBlock--;
      }
      if (inSkinBlock <= 0) inSkinBlock = 0;
      continue;
    }

    if (LEGEND_OPEN_RE.test(text)) {
      inLegend = true;
      continue;
    }
    if (SKINPARAM_BLOCK_OPEN_RE.test(text)) {
      inSkinBlock = 1;
      // A `{ ... }` body on the same line as the opener still gets handled by
      // the brace-counting above because we already incremented to 1; subtract
      // any closers present on this line.
      for (let k = 0; k < text.length; k++) {
        if (text[k] === '}') inSkinBlock--;
      }
      if (inSkinBlock <= 0) inSkinBlock = 0;
      continue;
    }
    if (LISTSPRITE_RE.test(text)) continue;
    if (SPRITE_DECL_RE.test(text)) continue;
    if (SKIP_DIRECTIVE_RE.test(text)) continue;

    // Stereotype rewrites: `<<$name>>` → `<<name>>`; adjacent `<<a>><<b>>`
    // collapsed into a single `<<a, b>>` slot so the container decl regex
    // (which captures one `<<…>>`) keeps the combined stereotype text.
    let rewritten = raw.replace(/<<\$([^>]+)>>/g, '<<$1>>');
    rewritten = rewritten.replace(/<<([^<>]+)>>\s*<<([^<>]+)>>/g, '<<$1, $2>>');

    // Macro expansion: only attempt for lines that look like a function-call
    // form `Name(args)` at the top level. Element macros emit a single
    // rectangle line; relationship macros emit an arrow line. Unknown macros
    // are dropped silently — they would otherwise be flagged as unparseable
    // identifiers by the downstream parser.
    const mCall = MACRO_CALL_RE.exec(rewritten.trim());
    if (mCall) {
      const name = mCall[1]!;
      // Heuristic: only treat as macro when the name carries an underscore
      // (Archimate macros are all `Layer_Element` style) OR matches the
      // generic `Rel` short form. This avoids accidentally rewriting valid
      // PlantUML constructs that happen to look like `Func(arg)`.
      if (name.includes('_') || name === 'Rel') {
        const args = splitArgs(mCall[2] ?? '');
        const expanded = expandMacro(name, args);
        if (expanded !== null) out.push(expanded);
        // Unknown macro → drop silently (graceful degradation).
        continue;
      }
    }

    out.push(rewritten);
  }

  return out.join('\n');
}
