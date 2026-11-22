// The home screen's widgets. Each one: { label, icon, size: [w, h], min: [w, h], mount(el, ctx) → { refresh?, stop? } }.
// ctx = { host, opts, setOpts(patch), edit(), petName }. Data comes from Bbokari (classes, to-dos, weather, music, apps).

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pad = (n) => String(n).padStart(2, '0');
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function every(ms, fn) {
  fn();
  const id = setInterval(fn, ms);
  return () => clearInterval(id);
}

const QUOTES = [
  ['The best way to get started is to quit talking and begin doing.', 'Walt Disney'],
  ['It always seems impossible until it’s done.', 'Nelson Mandela'],
  ['Small steps every day.', 'Unknown'],
  ['Do what you can, with what you have, where you are.', 'Theodore Roosevelt'],
  ['Stay curious.', 'Unknown'],
  ['You are braver than you believe, stronger than you seem, and smarter than you think.', 'A. A. Milne'],
  ['Done is better than perfect.', 'Sheryl Sandberg'],
  ['Be so good they can’t ignore you.', 'Steve Martin'],
  ['The expert in anything was once a beginner.', 'Helen Hayes'],
  ['Dream big. Start small. Act now.', 'Robin Sharma'],
  ['Make today so awesome yesterday gets jealous.', 'Unknown'],
  ['Every moment is a fresh beginning.', 'T. S. Eliot'],
  ['Creativity is intelligence having fun.', 'Unknown'],
  ['Happiness is not by chance, but by choice.', 'Jim Rohn'],
];

export const WIDGETS = {
  clock: {
    label: 'Clock', icon: '🕰', size: [340, 170], min: [180, 110],
    mount(el, ctx) {
      el.innerHTML = '<div class="clock-time"></div><div class="clock-date"></div>';
      const [t, d] = el.children;
      const stop = every(1000, () => {
        const now = new Date();
        const h = ctx.opts.h24 ? now.getHours() : ((now.getHours() + 11) % 12) + 1;
        t.textContent = `${ctx.opts.h24 ? pad(h) : h}:${pad(now.getMinutes())}`;
        d.textContent = `${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}`;
        t.style.fontSize = Math.min(el.clientHeight * 0.55, el.clientWidth * 0.3) + 'px';
      });
      el.ondblclick = () => ctx.setOpts({ h24: !ctx.opts.h24 });
      return { stop };
    },
  },

  classes: {
    label: 'Upcoming classes', icon: '📚', size: [340, 230], min: [220, 120],
    mount(el, ctx) {
      el.innerHTML = '<div class="w-title">📚 Up next</div><div class="list"></div>';
      const list = el.querySelector('.list');
      const draw = async () => {
        const items = (await ctx.host.data('classes')) ?? [];
        if (!Array.isArray(items) || !items.length) {
          list.innerHTML = '<div class="muted">No classes coming up. Add them from 📅 Classes in Bbokari’s menu.</div>';
          return;
        }
        const now = Date.now();
        list.innerHTML = items.slice(0, 6).map((c, i) => {
          const at = new Date(c.startAt).getTime();
          const mins = Math.round((at - now) / 60000);
          const live = now >= at && now < new Date(c.endAt).getTime();
          const when = live ? '<b class="live">now</b>' : mins < 60 && mins >= 0 ? `in ${mins} min` : c.day ?? c.start;
          const join = c.link && (live || (mins >= 0 && mins <= 15)) ? `<button class="chip" data-i="${i}">Join</button>` : '';
          return `<div class="row"><span class="dot"></span><span class="grow">${esc(c.name)}<small>${esc(c.start)}${c.end ? '–' + esc(c.end) : ''}</small></span><span class="when">${when}</span>${join}</div>`;
        }).join('');
        list.querySelectorAll('button[data-i]').forEach((b) => (b.onclick = () => ctx.host.action('openLink', items[b.dataset.i].link)));
      };
      return { stop: every(60_000, draw), refresh: draw };
    },
  },

  apps: {
    label: 'Open apps', icon: '🧩', size: [380, 120], min: [140, 90],
    mount(el, ctx) {
      el.innerHTML = '<div class="apps"></div>';
      const box = el.firstChild;
      const draw = async () => {
        const apps = (await ctx.host.data('apps')) ?? [];
        if (!Array.isArray(apps) || !apps.length) { box.innerHTML = '<div class="muted">Open apps show up here.</div>'; return; }
        box.innerHTML = apps.map((a, i) => `<button class="app" data-i="${i}" title="${esc(a.name)}">${a.icon ? `<img src="${a.icon}">` : '🧩'}<span>${esc(a.name)}</span></button>`).join('');
        box.querySelectorAll('.app').forEach((b) => (b.onclick = () => !ctx.edit() && ctx.host.action('openApp', apps[b.dataset.i].name)));
      };
      return { stop: every(10_000, draw) };
    },
  },

  photo: {
    label: 'Photo frame', icon: '🖼', size: [260, 260], min: [120, 120],
    mount(el, ctx) {
      el.classList.add('photo-w');
      el.innerHTML = '<img class="ph a"><img class="ph b"><button class="chip pick">Choose photos</button>';
      const [a, b, pick] = el.children;
      let i = 0, front = a;
      pick.onclick = async () => {
        const photos = await ctx.host.pickPhotos({ multiple: true });
        if (photos.length) ctx.setOpts({ photos });
      };
      const show = () => {
        const photos = ctx.opts.photos ?? [];
        pick.style.display = photos.length && !ctx.edit() ? 'none' : '';
        if (!photos.length) { a.style.opacity = b.style.opacity = 0; return; }
        const back = front === a ? b : a;
        back.src = 'file://' + encodeURI(photos[i++ % photos.length]);
        back.onload = () => { back.style.opacity = 1; front.style.opacity = 0; front = back; };
      };
      return { stop: every(9000, show), refresh: show };
    },
  },

  todos: {
    label: 'To-dos', icon: '✅', size: [260, 230], min: [180, 120],
    mount(el, ctx) {
      el.innerHTML = '<div class="w-title">✅ To-do</div><div class="list"></div><input class="add" placeholder="+ Add a to-do">';
      const list = el.querySelector('.list');
      const input = el.querySelector('.add');
      const draw = async () => {
        const items = (await ctx.host.data('todos')) ?? [];
        list.innerHTML = items.length
          ? items.map((t, i) => `<label class="row todo"><input type="checkbox" data-i="${i}"><span class="grow">${esc(t.text)}</span></label>`).join('')
          : '<div class="muted">All done! 🎉</div>';
        list.querySelectorAll('input[type=checkbox]').forEach((c) => (c.onchange = async () => {
          c.closest('.row').classList.add('ticked');
          await ctx.host.action('todoDone', Number(c.dataset.i));
          setTimeout(draw, 500);
        }));
      };
      input.onkeydown = async (e) => {
        if (e.key !== 'Enter' || !input.value.trim()) return;
        await ctx.host.action('todoAdd', input.value.trim());
        input.value = '';
        draw();
      };
      return { stop: every(30_000, draw), refresh: draw };
    },
  },

  weather: {
    label: 'Weather', icon: '⛅', size: [200, 170], min: [150, 110],
    mount(el, ctx) {
      const draw = async () => {
        const w = await ctx.host.data('weather');
        if (!w || w.needCity || w.error) {
          el.innerHTML = '<div class="w-title">⛅ Weather</div><input class="add city" placeholder="Your city…">';
          const i = el.querySelector('.city');
          i.onkeydown = async (e) => { if (e.key === 'Enter' && i.value.trim()) { await ctx.host.action('setCity', i.value.trim()); draw(); } };
          return;
        }
        el.innerHTML = `<div class="wx-place">${esc(w.place)}</div><div class="wx-temp">${w.temp}°</div><div class="wx-icon">${w.icon}</div><div class="wx-words">${esc(w.words)}</div><div class="wx-hilo">H:${w.hi}° L:${w.lo}°</div>`;
      };
      return { stop: every(15 * 60_000, draw), refresh: draw };
    },
  },

  music: {
    label: 'Music', icon: '🎵', size: [340, 120], min: [220, 90],
    mount(el, ctx) {
      el.innerHTML = '<div class="music"><div class="art">🎵</div><div class="grow"><div class="song">Nothing playing</div><div class="artist muted">Spotify or Music</div></div><div class="ctrls"><button data-a="previous">⏮</button><button data-a="toggle" class="pp">▶︎</button><button data-a="next">⏭</button></div></div>';
      const song = el.querySelector('.song'), artist = el.querySelector('.artist'), pp = el.querySelector('.pp');
      let playing = false;
      const draw = async () => {
        const m = await ctx.host.data('music');
        playing = !!m?.playing;
        song.textContent = m?.song || 'Nothing playing';
        artist.textContent = m?.song ? m.artist : 'Spotify or Music';
        pp.textContent = playing ? '⏸' : '▶︎';
      };
      el.querySelectorAll('.ctrls button').forEach((b) => (b.onclick = async () => {
        const a = b.dataset.a === 'toggle' ? (playing ? 'pause' : 'play') : b.dataset.a;
        await ctx.host.action('music', a);
        setTimeout(draw, 600);
      }));
      return { stop: every(5000, draw) };
    },
  },

  calendar: {
    label: 'Calendar', icon: '📅', size: [260, 250], min: [200, 190],
    mount(el, ctx) {
      const draw = async () => {
        const now = new Date();
        const first = new Date(now.getFullYear(), now.getMonth(), 1);
        const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const classDays = new Set(((await ctx.host.data('classDays')) ?? []));
        let cells = '';
        for (let i = 0; i < first.getDay(); i++) cells += '<span></span>';
        for (let d = 1; d <= days; d++) {
          const dow = new Date(now.getFullYear(), now.getMonth(), d).getDay();
          cells += `<span class="${d === now.getDate() ? 'today' : ''}${classDays.has(dow) ? ' has' : ''}">${d}</span>`;
        }
        el.innerHTML = `<div class="w-title cal-title">${MONTHS[now.getMonth()]}</div><div class="cal">${'SMTWTFS'.split('').map((c) => `<b>${c}</b>`).join('')}${cells}</div>`;
      };
      return { stop: every(60 * 60_000, draw) };
    },
  },

  note: {
    label: 'Sticky note', icon: '🗒', size: [220, 200], min: [140, 100],
    mount(el, ctx) {
      el.innerHTML = '<textarea class="note" placeholder="Write anything…"></textarea>';
      const ta = el.firstChild;
      ta.value = ctx.opts.text ?? '';
      let t;
      ta.oninput = () => { clearTimeout(t); t = setTimeout(() => ctx.setOpts({ text: ta.value }), 500); };
      return {};
    },
  },

  focus: {
    label: 'Focus timer', icon: '🍅', size: [200, 170], min: [150, 130],
    mount(el, ctx) {
      el.innerHTML = '<div class="w-title">🍅 Focus</div><div class="focus-time">25:00</div><div class="row center"><button class="chip go">Start</button><button class="chip brk">Break</button></div>';
      const time = el.querySelector('.focus-time'), go = el.querySelector('.go'), brk = el.querySelector('.brk');
      let end = 0, left = 25 * 60, running = false;
      const tick = () => {
        if (running) left = Math.max(0, Math.round((end - Date.now()) / 1000));
        time.textContent = `${pad(Math.floor(left / 60))}:${pad(left % 60)}`;
        if (running && left === 0) { running = false; go.textContent = 'Start'; ctx.host.action('focusDone'); }
      };
      go.onclick = () => {
        running = !running;
        if (running) end = Date.now() + left * 1000;
        go.textContent = running ? 'Pause' : 'Start';
      };
      brk.onclick = () => { left = 5 * 60; running = false; go.textContent = 'Start'; tick(); };
      time.ondblclick = () => { left = 25 * 60; running = false; go.textContent = 'Start'; tick(); };
      return { stop: every(500, tick) };
    },
  },

  countdown: {
    label: 'Countdown', icon: '⏳', size: [220, 150], min: [160, 110],
    mount(el, ctx) {
      const draw = () => {
        const { name = 'Summer break', date } = ctx.opts;
        if (!date) {
          el.innerHTML = '<div class="w-title">⏳ Countdown</div><input class="add cd-name" placeholder="What? (e.g. My birthday)"><input class="add cd-date" type="date">';
          const [n, d] = el.querySelectorAll('input');
          d.onchange = () => d.value && ctx.setOpts({ name: n.value.trim() || 'The big day', date: d.value });
          return;
        }
        const days = Math.ceil((new Date(date + 'T00:00') - new Date()) / 86400000);
        el.innerHTML = `<div class="cd-num">${Math.max(0, days)}</div><div class="cd-label">${days === 1 ? 'day' : 'days'} until ${esc(name)}</div>`;
        el.ondblclick = () => ctx.setOpts({ date: null });
      };
      return { stop: every(60 * 60_000, draw), refresh: draw };
    },
  },

  quote: {
    label: 'Quote of the day', icon: '💬', size: [320, 140], min: [200, 100],
    mount(el) {
      const day = Math.floor(Date.now() / 86400000);
      const [q, who] = QUOTES[day % QUOTES.length];
      el.innerHTML = `<div class="quote">“${esc(q)}”</div><div class="muted quote-who">— ${esc(who)}</div>`;
      return {};
    },
  },

  battery: {
    label: 'Battery', icon: '🔋', size: [160, 140], min: [120, 100],
    mount(el) {
      el.innerHTML = '<div class="bat-ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" class="trk"/><circle cx="50" cy="50" r="42" class="lvl"/></svg><div class="bat-num">–</div></div>';
      const lvl = el.querySelector('.lvl'), num = el.querySelector('.bat-num');
      const draw = async () => {
        const b = await navigator.getBattery?.().catch(() => null);
        if (!b) return;
        const p = Math.round(b.level * 100);
        num.textContent = `${b.charging ? '⚡' : ''}${p}%`;
        lvl.style.strokeDasharray = `${2.64 * p} 264`;
        lvl.style.stroke = p <= 20 && !b.charging ? '#ff5a5f' : '#34c759';
      };
      return { stop: every(60_000, draw) };
    },
  },

  pet: {
    label: 'Pet', icon: '🐝', size: [200, 160], min: [150, 120],
    mount(el, ctx) {
      el.innerHTML = `<div class="pet-face">🐣</div><div class="pet-name">${esc(ctx.petName)}</div><div class="row center"><button class="chip" data-a="pet">Pet</button><button class="chip" data-a="feed">Feed</button><button class="chip" data-a="dance">Dance</button></div>`;
      const face = el.querySelector('.pet-face');
      el.querySelectorAll('button').forEach((b) => (b.onclick = () => {
        ctx.host.action('pet', b.dataset.a);
        face.textContent = { pet: '🥰', feed: '😋', dance: '💃' }[b.dataset.a];
        face.classList.remove('bop'); void face.offsetWidth; face.classList.add('bop');
        setTimeout(() => (face.textContent = '🐣'), 2000);
      }));
      return {};
    },
  },
};
