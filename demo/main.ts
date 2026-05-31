import { render } from '../src/index.js';
import { plantumlServerSvgUrl } from './plantuml-server.js';
import { SAMPLES_SEQUENCE_LIST } from './sequence-samples.js';
import { SAMPLES_USECASE_LIST } from './usecase-samples.js';
import { SAMPLES_CLASS_LIST } from './class-samples.js';
import { SAMPLES_ACTIVITY_LIST } from './activity-samples.js';
import { SAMPLES_COMPONENT_LIST } from './component-samples.js';
import { SAMPLES_STATE_LIST } from './state-samples.js';
import { SAMPLES_OBJECT_LIST } from './object-samples.js';
import { SAMPLES_DEPLOYMENT_LIST } from './deployment-samples.js';
import { SAMPLES_TIMING_LIST } from './timing-samples.js';
import { SAMPLES_REGEX_LIST } from './regex-samples.js';
import { SAMPLES_NETWORK_LIST } from './network-samples.js';
import { SAMPLES_WIREFRAME_LIST } from './wireframe-samples.js';
import { SAMPLES_ARCHIMATE_LIST } from './archimate-samples.js';
import { SAMPLES_GANTT_LIST } from './gantt-samples.js';
import { SAMPLES_MINDMAP_LIST } from './mindmap-samples.js';
import { SAMPLES_WBS_LIST } from './wbs-samples.js';
import { SAMPLES_EBNF_LIST } from './ebnf-samples.js';
import { SAMPLES_JSON_LIST } from './json-samples.js';
import { SAMPLES_YAML_LIST } from './yaml-samples.js';

interface Sample {
  readonly title: string;
  readonly source: string;
}

interface KindEntry {
  readonly kind: string;
  readonly label: string;
  readonly list: ReadonlyArray<Sample>;
}

const KIND_ORDER: ReadonlyArray<KindEntry> = [
  { kind: 'sequence',   label: 'Sequence',   list: SAMPLES_SEQUENCE_LIST },
  { kind: 'usecase',    label: 'Use Case',   list: SAMPLES_USECASE_LIST },
  { kind: 'class',      label: 'Class',      list: SAMPLES_CLASS_LIST },
  { kind: 'activity',   label: 'Activity',   list: SAMPLES_ACTIVITY_LIST },
  { kind: 'component',  label: 'Component',  list: SAMPLES_COMPONENT_LIST },
  { kind: 'state',      label: 'State',      list: SAMPLES_STATE_LIST },
  { kind: 'object',     label: 'Object',     list: SAMPLES_OBJECT_LIST },
  { kind: 'deployment', label: 'Deployment', list: SAMPLES_DEPLOYMENT_LIST },
  { kind: 'timing',     label: 'Timing',     list: SAMPLES_TIMING_LIST },
  { kind: 'regex',      label: 'Regex',      list: SAMPLES_REGEX_LIST },
  { kind: 'network',    label: 'Network',    list: SAMPLES_NETWORK_LIST },
  { kind: 'wireframe',  label: 'Wireframe',  list: SAMPLES_WIREFRAME_LIST },
  { kind: 'archimate',  label: 'Archimate',  list: SAMPLES_ARCHIMATE_LIST },
  { kind: 'gantt',      label: 'Gantt',      list: SAMPLES_GANTT_LIST },
  { kind: 'mindmap',    label: 'MindMap',    list: SAMPLES_MINDMAP_LIST },
  { kind: 'wbs',        label: 'WBS',        list: SAMPLES_WBS_LIST },
  { kind: 'ebnf',       label: 'EBNF',       list: SAMPLES_EBNF_LIST },
  { kind: 'json',       label: 'JSON',       list: SAMPLES_JSON_LIST },
  { kind: 'yaml',       label: 'YAML',       list: SAMPLES_YAML_LIST },
];

const sidebarEl = document.getElementById('kinds-sidebar') as HTMLElement;
const galleryEl = document.getElementById('gallery') as HTMLElement;

let activeKindBtn: HTMLButtonElement | null = null;

function renderInto(target: HTMLElement, source: string): void {
  target.replaceChildren();
  try {
    const svg = render(source);
    target.appendChild(svg);
  } catch (err) {
    const pre = document.createElement('pre');
    pre.textContent = err instanceof Error ? err.message : String(err);
    target.appendChild(pre);
  }
}

// Loads the reference rendering for `source` from the official PlantUML server into
// `target`. Each call is tagged with a token so a stale in-flight request (e.g. from
// fast typing) cannot overwrite a newer one.
const originalTokens = new WeakMap<HTMLElement, symbol>();
function renderOriginal(target: HTMLElement, source: string): void {
  const token = Symbol('original');
  originalTokens.set(target, token);

  target.replaceChildren();
  const placeholder = document.createElement('span');
  placeholder.className = 'placeholder';
  placeholder.textContent = 'Loading plantuml.com…';
  target.appendChild(placeholder);

  plantumlServerSvgUrl(source)
    .then((url) => {
      if (originalTokens.get(target) !== token) return;
      const img = document.createElement('img');
      img.alt = 'plantuml.com reference rendering';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', () => {
        if (originalTokens.get(target) !== token) return;
        target.replaceChildren();
        const pre = document.createElement('pre');
        pre.textContent = 'Failed to load plantuml.com rendering.';
        target.appendChild(pre);
      });
      target.replaceChildren(img);
      img.src = url;
    })
    .catch((err: unknown) => {
      if (originalTokens.get(target) !== token) return;
      target.replaceChildren();
      const pre = document.createElement('pre');
      pre.textContent = err instanceof Error ? err.message : String(err);
      target.appendChild(pre);
    });
}

// A labeled output column: a caption above a content `pane` that renderings fill.
function makePane(
  paneClass: string,
  label: string,
  placeholder: string,
): { column: HTMLElement; pane: HTMLElement } {
  const column = document.createElement('div');
  column.className = 'gallery-column';

  const caption = document.createElement('div');
  caption.className = 'gallery-column-label';
  caption.textContent = label;
  column.appendChild(caption);

  const pane = document.createElement('div');
  pane.className = paneClass;
  const ph = document.createElement('span');
  ph.className = 'placeholder';
  ph.textContent = placeholder;
  pane.appendChild(ph);
  column.appendChild(pane);

  return { column, pane };
}

function buildGalleryCard(sample: Sample): HTMLElement {
  const card = document.createElement('section');
  card.className = 'gallery-card';

  const title = document.createElement('div');
  title.className = 'gallery-card-title';
  title.textContent = sample.title;
  card.appendChild(title);

  const body = document.createElement('div');
  body.className = 'gallery-card-body';

  const ta = document.createElement('textarea');
  ta.className = 'gallery-source';
  ta.spellcheck = false;
  ta.value = sample.source;
  body.appendChild(ta);

  const preview = makePane('gallery-preview', 'puml-canvas-js', 'Rendering…');
  body.appendChild(preview.column);

  const original = makePane('gallery-original', 'plantuml.com (original)', 'Loading plantuml.com…');
  body.appendChild(original.column);

  card.appendChild(body);

  // Debounce re-renders on input so fast typing doesn't render on every keystroke.
  let debounceHandle: number | undefined;
  ta.addEventListener('input', () => {
    if (debounceHandle !== undefined) {
      window.clearTimeout(debounceHandle);
    }
    debounceHandle = window.setTimeout(() => {
      debounceHandle = undefined;
      renderInto(preview.pane, ta.value);
      renderOriginal(original.pane, ta.value);
    }, 200);
  });

  // Defer the actual render so the placeholder paints first.
  // Using requestAnimationFrame keeps the UI responsive when a kind has many samples.
  requestAnimationFrame(() => {
    renderInto(preview.pane, sample.source);
    renderOriginal(original.pane, sample.source);
  });

  return card;
}

function showKind(entry: KindEntry, btn: HTMLButtonElement): void {
  if (activeKindBtn) activeKindBtn.classList.remove('active');
  btn.classList.add('active');
  activeKindBtn = btn;

  galleryEl.replaceChildren();
  galleryEl.scrollTop = 0;

  if (entry.list.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No examples for this kind.';
    empty.style.color = '#666';
    galleryEl.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  for (const sample of entry.list) {
    frag.appendChild(buildGalleryCard(sample));
  }
  galleryEl.appendChild(frag);
}

function buildSidebar(): void {
  const frag = document.createDocumentFragment();
  KIND_ORDER.forEach((entry, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kind-btn';
    btn.innerHTML = `<span class="kind-btn-label">${entry.label}</span><span class="kind-btn-count">${entry.list.length}</span>`;
    btn.addEventListener('click', () => showKind(entry, btn));
    frag.appendChild(btn);
    if (idx === 0) {
      // Defer selection until the sidebar is mounted.
      queueMicrotask(() => showKind(entry, btn));
    }
  });
  sidebarEl.replaceChildren(frag);
}

buildSidebar();
