import { h, icon, pad2, groupBy } from '../ui.js';

export function playButton(app, { size = 'lg' } = {}) {
  const playing = app.engine.playing;
  return h('button', {
    class: `play-key ${size} ${playing ? 'is-playing' : ''}`,
    type: 'button',
    'aria-label': playing ? 'Parar bateria' : 'Tocar bateria',
    title: playing ? 'Parar (barra de espaço)' : 'Tocar (barra de espaço)',
    onclick: () => app.togglePlay(),
  }, icon(playing ? 'stop' : 'play'));
}

export function patternSelect(app, value, onChange, { inherit, label = 'Ritmo' } = {}) {
  const groups = groupBy(app.patterns(), (p) => (p.builtin ? p.style : 'Meus ritmos'));
  return h('select', { class: 'input', 'aria-label': label, value: value || '', onchange: (e) => onChange(e.target.value) },
    inherit ? h('option', { value: '' }, inherit) : null,
    [...groups].map(([g, list]) => h('optgroup', { label: g }, list.map((p) => h('option', { value: p.id }, p.name)))));
}

export function presetLabel(app, n) {
  const name = app.presetInfo(n).name;
  return name ? `P${pad2(n)} ${name}` : `P${pad2(n)}`;
}

export function presetSelect(app, value, onChange, { keep = 'Manter o preset', label = 'Preset' } = {}) {
  const opts = [];
  for (let n = 1; n <= app.total; n++) opts.push(h('option', { value: String(n) }, presetLabel(app, n)));
  return h('select', { class: 'input', 'aria-label': label, value: value ? String(value) : '', onchange: (e) => onChange(Number(e.target.value) || null) },
    h('option', { value: '' }, keep),
    opts);
}

export function beatLeds(count) {
  const el = h('div', { class: 'beat-leds', 'aria-hidden': 'true' });
  const build = (n) => {
    el.replaceChildren(...Array.from({ length: n }, () => h('span', { class: 'led' })));
  };
  build(count);
  el.light = (beat, total, accent) => {
    if (el.children.length !== total) build(total);
    [...el.children].forEach((led, i) => {
      led.classList.toggle('on', i === beat);
      led.classList.toggle('accent', i === beat && accent);
    });
  };
  el.clear = () => [...el.children].forEach((led) => led.classList.remove('on', 'accent'));
  return el;
}

export function emptyState(text, action) {
  return h('div', { class: 'empty' }, h('p', {}, text), action || null);
}
