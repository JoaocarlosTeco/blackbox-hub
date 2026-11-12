// Músicas e setlists: cada música tem andamento, ritmo e seções que trocam o preset sozinhas.

import { h, icon, pad2, stepper, confirmAsk, promptAsk, formatDuration } from '../ui.js';
import { patternSelect, presetSelect, presetLabel } from './common.js';
import { uid } from '../store.js';

export function songDuration(app, song) {
  let seconds = 0;
  for (const sec of song.sections) {
    const p = app.pattern(sec.patternId || song.patternId);
    seconds += (sec.bars * p.beatsPerBar * 60) / song.bpm;
  }
  return seconds;
}

function newSong(name = 'Nova música') {
  return {
    id: uid(), name, bpm: 100, patternId: 'rock-8', countIn: 1,
    sections: [
      { id: uid(), name: 'Verso', bars: 8, preset: null, patternId: '', fill: true },
      { id: uid(), name: 'Refrão', bars: 8, preset: null, patternId: '', fill: false },
    ],
  };
}

export function render(app) {
  const s = app.store.get();
  const setlist = s.setlists.find((x) => x.id === s.activeSetlistId) || null;
  const listed = setlist ? setlist.songIds.map((id) => s.songs.find((x) => x.id === id)).filter(Boolean) : s.songs;
  const selectedId = s.songs.some((x) => x.id === s.ui.songId) ? s.ui.songId : listed[0]?.id || s.songs[0]?.id;
  const song = s.songs.find((x) => x.id === selectedId) || null;
  const offs = [];

  const select = (id) => app.store.update((st) => { st.ui.songId = id; });

  // ---- Setlist ----
  const others = setlist ? s.songs.filter((x) => !setlist.songIds.includes(x.id)) : [];
  const side = h('aside', { class: 'setlist', 'aria-label': 'Setlist' },
    h('div', { class: 'setlist-head' },
      h('select', {
        class: 'input', 'aria-label': 'Setlist ativo', value: setlist ? setlist.id : 'all',
        onchange: (e) => app.store.update((st) => { st.activeSetlistId = e.target.value; }),
      }, s.setlists.map((x) => h('option', { value: x.id }, x.name)), h('option', { value: 'all' }, 'Todas as músicas')),
      h('button', {
        class: 'icon-btn', type: 'button', 'aria-label': 'Novo setlist', title: 'Novo setlist',
        onclick: async () => {
          const name = await promptAsk('Novo setlist', { label: 'Nome do setlist', confirm: 'Criar setlist' });
          if (!name) return;
          app.store.update((st) => { const id = uid(); st.setlists.push({ id, name, songIds: [] }); st.activeSetlistId = id; });
        },
      }, icon('plus')),
      setlist ? h('button', {
        class: 'icon-btn', type: 'button', 'aria-label': 'Renomear setlist', title: 'Renomear setlist',
        onclick: async () => {
          const name = await promptAsk('Renomear setlist', { label: 'Nome do setlist', value: setlist.name });
          if (name) app.store.update(() => { setlist.name = name; });
        },
      }, icon('edit')) : null,
      setlist ? h('button', {
        class: 'icon-btn', type: 'button', 'aria-label': 'Excluir setlist', title: 'Excluir setlist',
        onclick: async () => {
          if (!(await confirmAsk(`Excluir o setlist "${setlist.name}"? As músicas continuam salvas.`, { title: 'Excluir setlist', confirm: 'Excluir', danger: true }))) return;
          app.store.update((st) => { st.setlists = st.setlists.filter((x) => x.id !== setlist.id); st.activeSetlistId = st.setlists[0]?.id || 'all'; });
        },
      }, icon('trash')) : null),
    listed.length
      ? h('ol', { class: 'song-list' }, listed.map((x, i) => {
        const playingThis = app.rt.mode === 'song' && app.rt.songId === x.id;
        return h('li', { class: `song-item ${x.id === selectedId ? 'on' : ''} ${playingThis ? 'playing' : ''}` },
          h('button', { class: 'song-pick', type: 'button', onclick: () => select(x.id), 'aria-current': x.id === selectedId ? 'true' : null },
            h('span', { class: 'song-idx' }, String(i + 1)),
            h('span', { class: 'song-name' }, x.name),
            h('span', { class: 'song-meta' }, `${x.bpm} BPM, ${formatDuration(songDuration(app, x))}`)),
          h('div', { class: 'song-tools' },
            h('button', {
              class: 'icon-btn', type: 'button', 'aria-label': playingThis ? `Parar ${x.name}` : `Tocar ${x.name}`,
              onclick: () => (playingThis ? app.stop() : app.playSong(x.id)),
            }, icon(playingThis ? 'stop' : 'play')),
            setlist ? [
              h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Subir na ordem', disabled: i === 0, onclick: () => app.store.update(() => { const a = setlist.songIds; [a[i - 1], a[i]] = [a[i], a[i - 1]]; }) }, icon('up')),
              h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Descer na ordem', disabled: i === listed.length - 1, onclick: () => app.store.update(() => { const a = setlist.songIds; [a[i + 1], a[i]] = [a[i], a[i + 1]]; }) }, icon('down')),
            ] : null));
      }))
      : h('p', { class: 'muted' }, setlist ? 'Este setlist ainda não tem músicas.' : 'Nenhuma música criada ainda.'),
    h('div', { class: 'setlist-foot' },
      h('button', {
        class: 'btn primary', type: 'button',
        onclick: () => {
          const so = newSong();
          app.store.update((st) => {
            st.songs.push(so);
            const sl = st.setlists.find((x) => x.id === st.activeSetlistId);
            if (sl) sl.songIds.push(so.id);
            st.ui.songId = so.id;
          });
        },
      }, icon('plus'), 'Nova música'),
      setlist && others.length
        ? h('select', {
          class: 'input', 'aria-label': 'Adicionar música existente ao setlist', value: '',
          onchange: (e) => { const id = e.target.value; if (id) app.store.update(() => { setlist.songIds.push(id); }); },
        }, h('option', { value: '' }, 'Adicionar música existente'), others.map((o) => h('option', { value: o.id }, o.name)))
        : null));

  const main = song ? renderEditor(app, s, song, setlist, offs) : h('section', { class: 'block' }, h('p', { class: 'muted' }, 'Crie uma música para montar a sequência de presets e bateria.'));
  const el = h('div', { class: 'view songs' }, side, main);
  return { el, destroy: () => offs.forEach((off) => off()) };
}

function renderEditor(app, s, song, setlist, offs) {
  const upd = (fn, render = true) => app.store.update((st) => { const so = st.songs.find((x) => x.id === song.id); if (so) fn(so); }, { render });
  const playingThis = app.rt.mode === 'song' && app.rt.songId === song.id;
  const total = song.sections.reduce((a, x) => a + x.bars, 0) || 1;

  const segs = song.sections.map((sec, i) => h('div', {
    class: 'tl-seg', style: { flexGrow: sec.bars, '--pc': app.presetInfo(sec.preset).color || null },
  }, h('span', { class: 'tl-name' }, sec.name || `Seção ${i + 1}`), h('span', { class: 'tl-meta' }, sec.preset ? `P${pad2(sec.preset)}` : 'mantém')));
  const cursor = h('div', { class: 'tl-cursor', hidden: !playingThis });
  const timeline = h('div', { class: 'timeline' }, segs, cursor);

  const rows = song.sections.map((sec, i) => h('div', { class: 'sec-row', 'data-sec': i },
    h('span', { class: 'sec-idx', 'aria-hidden': 'true' }, String(i + 1)),
    h('input', {
      class: 'input', value: sec.name, maxlength: 30, 'aria-label': `Nome da seção ${i + 1}`,
      onchange: (e) => upd((so) => { so.sections[i].name = e.target.value.trim(); }),
    }),
    stepper({ value: sec.bars, min: 1, max: 128, label: `compassos da seção ${i + 1}`, size: 'sm', onChange: (v) => upd((so) => { so.sections[i].bars = v; }) }),
    presetSelect(app, sec.preset, (v) => upd((so) => { so.sections[i].preset = v; }), { label: `Preset da seção ${i + 1}` }),
    patternSelect(app, sec.patternId, (v) => upd((so) => { so.sections[i].patternId = v; }), { inherit: 'Ritmo da música', label: `Ritmo da seção ${i + 1}` }),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: !!sec.fill, onchange: (e) => upd((so) => { so.sections[i].fill = e.target.checked; }) }),
      'Virada no fim'),
    h('div', { class: 'row-tools' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mover seção para cima', disabled: i === 0, onclick: () => upd((so) => { const a = so.sections; [a[i - 1], a[i]] = [a[i], a[i - 1]]; }) }, icon('up')),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mover seção para baixo', disabled: i === song.sections.length - 1, onclick: () => upd((so) => { const a = so.sections; [a[i + 1], a[i]] = [a[i], a[i + 1]]; }) }, icon('down')),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Excluir seção', disabled: song.sections.length === 1, onclick: () => upd((so) => { so.sections.splice(i, 1); }) }, icon('trash')))));

  if (playingThis) {
    offs.push(app.onEngine('bar', (e) => {
      const bar = e.detail.bar;
      if (bar.sectionIndex == null) return;
      segs.forEach((sg, i) => sg.classList.toggle('now', i === bar.sectionIndex));
      rows.forEach((r, i) => r.classList.toggle('now', i === bar.sectionIndex));
      const before = song.sections.slice(0, bar.sectionIndex).reduce((a, x) => a + x.bars, 0);
      cursor.style.left = `${((before + bar.barInSection) / total) * 100}%`;
    }));
  }

  const firstPreset = song.sections.find((x) => x.preset)?.preset;

  return h('section', { class: 'song-editor' },
    h('div', { class: 'song-head' },
      h('input', {
        class: 'input title-input', value: song.name, maxlength: 50, 'aria-label': 'Nome da música',
        onchange: (e) => upd((so) => { so.name = e.target.value.trim() || 'Sem título'; }),
      }),
      h('button', {
        class: `btn ${playingThis ? '' : 'primary'} big`, type: 'button',
        onclick: () => (playingThis ? app.stop() : app.playSong(song.id)),
      }, icon(playingThis ? 'stop' : 'play'), playingThis ? 'Parar música' : 'Tocar música')),
    h('div', { class: 'song-fields' },
      h('div', { class: 'strip-field' }, h('span', { class: 'field-label' }, 'Andamento'),
        stepper({ value: song.bpm, min: 30, max: 300, label: 'andamento da música', onChange: (v) => upd((so) => { so.bpm = v; }) })),
      h('div', { class: 'strip-field grow' }, h('span', { class: 'field-label' }, 'Ritmo da música'),
        patternSelect(app, song.patternId, (v) => upd((so) => { so.patternId = v; }), { label: 'Ritmo da música' })),
      h('div', { class: 'strip-field' }, h('span', { class: 'field-label' }, 'Contagem antes'),
        h('select', { class: 'input', 'aria-label': 'Contagem antes de começar', value: String(song.countIn || 0), onchange: (e) => upd((so) => { so.countIn = Number(e.target.value); }) },
          h('option', { value: '0' }, 'Sem contagem'), h('option', { value: '1' }, '1 compasso'), h('option', { value: '2' }, '2 compassos'))),
      h('div', { class: 'strip-field' }, h('span', { class: 'field-label' }, 'Duração'), h('span', { class: 'big-num' }, formatDuration(songDuration(app, song))))),
    timeline,
    h('p', { class: 'muted small' }, firstPreset
      ? `Ao tocar, o pedal vai para ${presetLabel(app, firstPreset)} já na contagem e troca de preset no primeiro tempo de cada seção.`
      : 'Escolha um preset em cada seção para o hub trocar o som do pedal sozinho durante a música.'),
    h('div', { class: 'sec-table' },
      h('div', { class: 'sec-row sec-header', 'aria-hidden': 'true' },
        h('span', {}, ''), h('span', {}, 'Seção'), h('span', {}, 'Compassos'), h('span', {}, 'Preset'), h('span', {}, 'Ritmo'), h('span', {}, ''), h('span', {}, '')),
      rows),
    h('div', { class: 'song-actions' },
      h('button', {
        class: 'btn', type: 'button',
        onclick: () => upd((so) => { const last = so.sections[so.sections.length - 1]; so.sections.push({ id: uid(), name: 'Nova seção', bars: 8, preset: last ? last.preset : null, patternId: '', fill: false }); }),
      }, icon('plus'), 'Adicionar seção'),
      h('button', {
        class: 'btn', type: 'button',
        onclick: () => app.store.update((st) => {
          const copy = JSON.parse(JSON.stringify(song));
          copy.id = uid();
          copy.name = `${song.name} (cópia)`;
          copy.sections.forEach((x) => { x.id = uid(); });
          st.songs.push(copy);
          const sl = st.setlists.find((x) => x.id === st.activeSetlistId);
          if (sl) sl.songIds.push(copy.id);
          st.ui.songId = copy.id;
        }),
      }, icon('copy'), 'Duplicar'),
      setlist ? h('button', {
        class: 'btn ghost', type: 'button',
        onclick: () => app.store.update(() => { setlist.songIds = setlist.songIds.filter((id) => id !== song.id); }),
      }, 'Tirar do setlist') : null,
      h('button', {
        class: 'btn danger-ghost', type: 'button',
        onclick: async () => {
          if (!(await confirmAsk(`Excluir "${song.name}" de todos os setlists?`, { title: 'Excluir música', confirm: 'Excluir', danger: true }))) return;
          if (playingThis) app.stop();
          app.store.update((st) => {
            st.songs = st.songs.filter((x) => x.id !== song.id);
            for (const sl of st.setlists) sl.songIds = sl.songIds.filter((id) => id !== song.id);
            st.ui.songId = null;
          });
        },
      }, icon('trash'), 'Excluir música')));
}
