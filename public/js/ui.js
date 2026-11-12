// Pequenos utilitários de interface: criação de elementos, ícones, diálogos e avisos.

export const pad2 = (n) => String(n).padStart(2, '0');
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export const PRESET_COLORS = ['', '#EF6B73', '#F2B35B', '#E9D66B', '#7ED6A2', '#93D9CF', '#45C4DC', '#5B95F5', '#A98BF5', '#E58BD0'];
export const MODULES = ['FX', 'AMP', 'MOD', 'DLY', 'REV', 'CAB'];
export const moduleColor = (m) => (MODULES.includes(m) ? `var(--${m.toLowerCase()})` : 'var(--silk-dim)');

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  let value;
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') {
        if (typeof v === 'string') el.setAttribute('style', v);
        else for (const [sk, sv] of Object.entries(v)) {
          if (sv == null) continue;
          if (sk.startsWith('--')) el.style.setProperty(sk, sv);
          else el.style[sk] = sv;
        }
      } else if (k === 'value') value = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden' || k === 'multiple') el[k] = true;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  appendChildren(el, children);
  if (value !== undefined) el.value = value;
  return el;
}

function appendChildren(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

const PATHS = {
  stage: '<rect x="3" y="4" width="18" height="16" rx="3"/><rect x="7" y="7" width="10" height="5" rx="1"/><circle cx="8" cy="16" r="1.6"/><circle cx="16" cy="16" r="1.6"/>',
  presets: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  drums: '<ellipse cx="12" cy="10" rx="8" ry="3"/><path d="M4 10v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5"/><path d="M8 3l3 5M16 3l-3 5"/>',
  songs: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  controls: '<circle cx="12" cy="13" r="6.5"/><path d="M12 13l3.2-3.2"/><path d="M12 3v1.5M3.5 13H5M19 13h1.5M5.9 6.9l1 1M18.1 6.9l-1 1"/>',
  settings: '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.8" fill="currentColor" stroke="none"/>',
  star: '<path d="M12 3.6l2.6 5.2 5.8.9-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.9z"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  tap: '<path d="M9 11V5a2 2 0 0 1 4 0v6"/><path d="M13 9.5a2 2 0 0 1 4 0V14a6 6 0 0 1-6 6h-.6a5 5 0 0 1-4.6-3.1L4.6 14a1.6 1.6 0 0 1 2.8-1.5L9 15"/>',
  fill: '<path d="M5 19L16 8M19 19L8 8"/><circle cx="17" cy="7" r="1.8"/><circle cx="7" cy="7" r="1.8"/>',
  usb: '<path d="M12 3v14"/><path d="M9 6l3-3 3 3"/><path d="M12 13l-4-2V8M12 15l4-2v-2"/><circle cx="12" cy="19" r="2"/>',
  speaker: '<path d="M5 9h3l4-4v14l-4-4H5z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  foot: '<rect x="5" y="3" width="14" height="18" rx="3"/><circle cx="12" cy="15" r="2.6"/><path d="M9 7h6"/>',
};

export function icon(name, cls = '') {
  const s = document.createElement('span');
  s.className = `icon ${cls}`.trim();
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] || ''}</svg>`;
  return s;
}

let toastHost;
export function toast(message, kind = 'info') {
  if (!toastHost) {
    toastHost = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  const t = h('div', { class: `toast ${kind}` }, message);
  toastHost.append(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 300);
  }, 3600);
}

export function openDialog({ title, body, actions = [], onClose, wide = false }) {
  const dlg = h('dialog', { class: `dialog ${wide ? 'wide' : ''}` });
  const inner = h('div', { class: 'dialog-inner' },
    h('h2', { class: 'dialog-title' }, title),
    h('div', { class: 'dialog-body' }, body),
    h('div', { class: 'dialog-actions' },
      actions.map((a) => h('button', {
        class: `btn ${a.kind || ''}`,
        type: 'button',
        onclick: () => {
          const keepOpen = a.onClick ? a.onClick() === false : false;
          if (!keepOpen) dlg.close();
        },
      }, a.label))));
  dlg.append(inner);
  dlg.addEventListener('close', () => {
    dlg.remove();
    if (onClose) onClose();
  });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

export function confirmAsk(text, { title = 'Confirmar', confirm = 'Confirmar', danger = false } = {}) {
  return new Promise((resolve) => {
    let ok = false;
    openDialog({
      title,
      body: h('p', { class: 'dialog-text' }, text),
      actions: [
        { label: 'Cancelar' },
        { label: confirm, kind: danger ? 'danger' : 'primary', onClick: () => { ok = true; } },
      ],
      onClose: () => resolve(ok),
    });
  });
}

export function promptAsk(title, { label = 'Nome', value = '', confirm = 'Salvar' } = {}) {
  return new Promise((resolve) => {
    let result = null;
    const input = h('input', { class: 'input', value, 'aria-label': label, maxlength: 60 });
    const dlg = openDialog({
      title,
      body: field(label, input),
      actions: [
        { label: 'Cancelar' },
        { label: confirm, kind: 'primary', onClick: () => { result = input.value.trim(); } },
      ],
      onClose: () => resolve(result || null),
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        result = input.value.trim();
        dlg.close();
      }
    });
    setTimeout(() => input.select(), 30);
  });
}

export function field(label, control, hint) {
  return h('div', { class: 'field' },
    h('span', { class: 'field-label' }, label),
    control,
    hint ? h('span', { class: 'field-hint' }, hint) : null);
}

// Campo numérico com botões − e +. O elemento devolvido tem setValue() para atualizações externas.
export function stepper({ value, min, max, step = 1, label, onChange, size = 'md' }) {
  const input = h('input', {
    class: 'stepper-input', type: 'number', inputmode: 'numeric', min, max, step, value, 'aria-label': label,
  });
  const set = (v) => {
    const n = clamp(Math.round(Number(v) || 0), min, max);
    input.value = n;
    onChange(n);
  };
  input.addEventListener('change', () => set(input.value));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  const el = h('div', { class: `stepper ${size}` },
    h('button', { class: 'stepper-btn', type: 'button', 'aria-label': `Diminuir ${label}`, onclick: () => set(Number(input.value) - step) }, '−'),
    input,
    h('button', { class: 'stepper-btn', type: 'button', 'aria-label': `Aumentar ${label}`, onclick: () => set(Number(input.value) + step) }, '+'));
  el.setValue = (v) => { if (document.activeElement !== input) input.value = v; };
  return el;
}

export function downloadText(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function groupBy(list, keyFn) {
  const out = new Map();
  for (const item of list) {
    const k = keyFn(item);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(item);
  }
  return out;
}

export function formatDuration(seconds) {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}
