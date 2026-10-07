// Costruttore di pannelli a partire da uno schema dichiarativo.
// Ogni controllo legge/scrive una chiave delle impostazioni; `when(S)` decide se è visibile.

export const fmt = {
  pct: (v) => `${Math.round(v * 100)}%`,
  x: (v) => `${v.toFixed(2)}×`,
  ms: (v) => `${v > 0 ? '+' : ''}${Math.round(v)} ms`,
  sec: (v) => (v > 0 ? `${v.toFixed(1)} s` : 'no'),
  int: (v) => String(Math.round(v)),
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * schema: [{ tab, title, when?, controls: [...] }]
 * api: { get(key), set(key, value), custom: { id: (el) => void }, ctx: () => any }
 * Ritorna { sync() } da chiamare quando cambiano le impostazioni.
 */
export function buildPanel(root, schema, api) {
  const bindings = [];

  for (const section of schema) {
    const sec = document.createElement('section');
    sec.className = 'group';
    sec.dataset.tab = section.tab;
    if (section.title) sec.innerHTML = `<h2>${esc(section.title)}${section.badge ? ` <span class="badge" id="${section.badge}"></span>` : ''}</h2>`;
    root.appendChild(sec);
    if (section.when) bindings.push({ el: sec, when: section.when, sync() {} });
    for (const c of section.controls) {
      const b = buildControl(c, api);
      sec.appendChild(b.el);
      bindings.push(b);
    }
  }

  return {
    sync() {
      const S = api.ctx();
      for (const b of bindings) {
        if (b.when) b.el.hidden = !b.when(S, api);
        b.sync(S);
      }
    },
  };
}

function buildControl(c, api) {
  const wrap = (html, cls) => {
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = html;
    return el;
  };
  const num = (v) => (c.number ? Number(v) : v);

  switch (c.type) {
    case 'range': {
      const el = wrap(
        `<label class="slider"><span>${esc(c.label)}</span><output></output>` +
          `<input type="range" min="${c.min}" max="${c.max}" step="${c.step}" /></label>`,
        'ctl',
      );
      const input = el.querySelector('input');
      const out = el.querySelector('output');
      const f = c.fmt || fmt.x;
      input.addEventListener('input', () => {
        out.textContent = f(Number(input.value));
        api.set(c.key, Number(input.value));
      });
      input.addEventListener('dblclick', () => api.reset?.(c.key));
      if (c.hint) input.title = c.hint;
      return {
        el, when: c.when,
        sync(S) {
          if (document.activeElement !== input) input.value = S[c.key];
          out.textContent = f(S[c.key]);
        },
      };
    }
    case 'check': {
      const el = wrap(`<label class="check"><input type="checkbox" /> ${esc(c.label)}</label>`, 'ctl');
      const input = el.querySelector('input');
      input.addEventListener('change', () => api.set(c.key, input.checked));
      return { el, when: c.when, sync(S) { input.checked = !!S[c.key]; } };
    }
    case 'seg': {
      const el = wrap(
        (c.label ? `<div class="ctl-label">${esc(c.label)}</div>` : '') +
          `<div class="seg">${c.options
            .map(([v, l, h]) => `<button type="button" data-value="${esc(v)}">${esc(l)}${h ? `<small>${esc(h)}</small>` : ''}</button>`)
            .join('')}</div>`,
        'ctl',
      );
      el.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-value]');
        if (btn) api.set(c.key, num(btn.dataset.value));
      });
      return {
        el, when: c.when,
        sync(S) {
          for (const b of el.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.value === String(S[c.key])));
        },
      };
    }
    case 'select': {
      const el = wrap(`<label class="field">${esc(c.label)} <select></select></label>`, 'ctl');
      const sel = el.querySelector('select');
      let sig = '';
      sel.addEventListener('change', () => api.set(c.key, num(sel.value)));
      return {
        el, when: c.when,
        sync(S) {
          const opts = typeof c.options === 'function' ? c.options(S, api) : c.options;
          const nextSig = JSON.stringify(opts);
          if (nextSig !== sig) {
            sig = nextSig;
            sel.innerHTML = opts
              .map((o) => (o.group
                ? `<optgroup label="${esc(o.group)}">${o.items.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</optgroup>`
                : `<option value="${esc(o[0])}">${esc(o[1])}</option>`))
              .join('');
          }
          sel.value = String(S[c.key]);
        },
      };
    }
    case 'colors': {
      const el = wrap(
        c.items.map((it) => `<label data-key="${it.key}">${esc(it.label)} <input type="color" /></label>`).join(''),
        'colors',
      );
      const parts = c.items.map((it) => {
        const lab = el.querySelector(`[data-key="${it.key}"]`);
        const input = lab.querySelector('input');
        input.addEventListener('input', () => api.set(it.key, input.value));
        return { it, lab, input };
      });
      return {
        el, when: c.when,
        sync(S) {
          for (const p of parts) {
            p.lab.hidden = p.it.when ? !p.it.when(S, api) : false;
            if (document.activeElement !== p.input) p.input.value = S[p.it.key];
          }
        },
      };
    }
    case 'text': {
      const el = wrap(`<label class="field">${esc(c.label)} <input type="text" placeholder="${esc(c.placeholder || '')}" /></label>`, 'ctl');
      const input = el.querySelector('input');
      input.addEventListener('input', () => api.set(c.key, input.value));
      return { el, when: c.when, sync(S) { if (document.activeElement !== input) input.value = S[c.key] ?? ''; } };
    }
    case 'custom': {
      const el = document.createElement('div');
      el.className = 'ctl';
      const sync = api.custom[c.id](el) || (() => {});
      return { el, when: c.when, sync };
    }
    case 'note': {
      const el = wrap(esc(c.text), 'note');
      return { el, when: c.when, sync() {} };
    }
    default:
      throw new Error(`Controllo sconosciuto: ${c.type}`);
  }
}
