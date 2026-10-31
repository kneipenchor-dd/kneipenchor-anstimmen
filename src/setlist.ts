// Setlist-Logik: Liste steckt in der URL, "gesungen" liegt nur lokal im localStorage.
import { Song } from './types';

export interface Setlist {
  name: string;
  ids: string[];
}

export function parseSetlistFromUrl(search: string = window.location.search): Setlist | null {
  const params = new URLSearchParams(search);
  const ids = (params.get('s') || '').split(',').map(id => id.trim()).filter(Boolean);
  if (ids.length === 0) return null;
  return { name: params.get('name')?.trim() || 'Setlist', ids };
}

export function buildSetlistUrl(setlist: Setlist): string {
  const params = new URLSearchParams();
  if (setlist.name.trim()) params.set('name', setlist.name.trim());
  params.set('s', setlist.ids.join(','));
  const query = params.toString().replace(/%2C/g, ',');
  return `${window.location.origin}${window.location.pathname}?${query}`;
}

function doneKey(setlist: Setlist): string {
  return `setlistDone:${setlist.name}|${setlist.ids.join(',')}`;
}

export function loadDone(setlist: Setlist): Set<string> {
  try {
    const raw = localStorage.getItem(doneKey(setlist));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function saveDone(setlist: Setlist, done: Set<string>): void {
  if (done.size === 0) {
    localStorage.removeItem(doneKey(setlist));
  } else {
    localStorage.setItem(doneKey(setlist), JSON.stringify([...done]));
  }
}

// Unbekannte IDs werden übersprungen und zurückgemeldet
export function resolveSetlistSongs(setlist: Setlist, allSongs: Song[]): { songs: Song[]; unknown: string[] } {
  const byId = new Map(allSongs.map(s => [s.id, s]));
  const songs: Song[] = [];
  const unknown: string[] = [];
  setlist.ids.forEach(id => {
    const song = byId.get(id);
    if (song) songs.push(song);
    else unknown.push(id);
  });
  return { songs, unknown };
}

// Editor: eigene Ansicht auf der Seite (kein Modal), damit Scrollen und Ziehen sich nicht stören
export function setupSetlistEditor(getSongs: () => Song[], initial: Setlist | null): void {
  const editor = document.getElementById('setlist-editor') as HTMLElement;
  const nameInput = document.getElementById('setlist-name-input') as HTMLInputElement;
  const itemsList = document.getElementById('setlist-items') as HTMLOListElement;
  const pickerSearch = document.getElementById('setlist-picker-search') as HTMLInputElement;
  const picker = document.getElementById('setlist-picker') as HTMLUListElement;
  const hint = document.getElementById('setlist-editor-hint') as HTMLElement;
  const cancelBtn = document.getElementById('setlist-cancel') as HTMLButtonElement;
  const openBtn = document.getElementById('setlist-open') as HTMLButtonElement;
  const copyBtn = document.getElementById('setlist-copy') as HTMLButtonElement;
  const triggers = [
    document.getElementById('setlist-editor-trigger'),
    document.getElementById('setlist-edit'),
  ];
  if (!editor) return;

  let ids: string[] = initial ? [...initial.ids] : [];
  const title = (id: string) => getSongs().find(s => s.id === id)?.title ?? id;

  // Ziehen nur am Griff (touch-action: none), dadurch gibt es keinen Konflikt mit dem Scrollen.
  // Listener hängen an window, weil das Umsortieren das Element im DOM verschiebt.
  const attachDrag = (li: HTMLElement, handle: HTMLElement, index: number) => {
    handle.addEventListener('pointerdown', e => {
      e.preventDefault();
      let from = index;
      let lastY = e.clientY;
      let scrollRaf = 0;
      let finished = false;
      const items = Array.from(itemsList.children) as HTMLElement[];
      li.classList.add('dragging');
      navigator.vibrate?.(15);

      const reorder = () => {
        let to = from;
        items.forEach((el, i) => {
          const r = el.getBoundingClientRect();
          if (lastY >= r.top && lastY <= r.bottom) to = i;
        });
        if (to === from) return;
        const [moved] = ids.splice(from, 1);
        ids.splice(to, 0, moved);
        const [movedEl] = items.splice(from, 1);
        items.splice(to, 0, movedEl);
        items.forEach(el => itemsList.appendChild(el));
        from = to;
      };

      // Am oberen/unteren Rand der Seite mitscrollen
      const autoScroll = () => {
        const edge = 70;
        if (lastY < edge) window.scrollBy(0, -12);
        else if (lastY > window.innerHeight - edge) window.scrollBy(0, 12);
        reorder();
        scrollRaf = requestAnimationFrame(autoScroll);
      };

      const onMove = (ev: PointerEvent) => { lastY = ev.clientY; reorder(); };
      const end = () => {
        if (finished) return;
        finished = true;
        cancelAnimationFrame(scrollRaf);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        window.removeEventListener('blur', end);
        render();
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
      window.addEventListener('blur', end);
      autoScroll();
    });
  };

  const smallButton = (label: string, aria: string, cls: string, onClick: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `setlist-icon-btn ${cls}`;
    b.textContent = label;
    b.setAttribute('aria-label', aria);
    b.addEventListener('click', onClick);
    return b;
  };

  function renderPicker(): void {
    const term = pickerSearch.value.trim().toLowerCase();
    picker.innerHTML = '';
    getSongs()
      .filter(s => s.id && !ids.includes(s.id) && (!term || s.title.toLowerCase().includes(term)))
      .forEach(s => {
        const li = document.createElement('li');
        const span = document.createElement('span');
        span.textContent = s.title;
        li.append(span, smallButton('+', `${s.title} hinzufügen`, 'add', () => { ids.push(s.id!); render(); }));
        picker.appendChild(li);
      });
  }

  function render(): void {
    itemsList.innerHTML = '';
    ids.forEach((id, i) => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = title(id);
      const handle = document.createElement('span');
      handle.className = 'drag-handle';
      handle.textContent = '⠿';
      handle.setAttribute('aria-label', 'Zum Sortieren ziehen');
      li.append(
        handle,
        span,
        smallButton('×', `${title(id)} entfernen`, 'remove', () => { ids.splice(i, 1); render(); }),
      );
      attachDrag(li, handle, i);
      itemsList.appendChild(li);
    });
    openBtn.disabled = copyBtn.disabled = ids.length === 0;
    renderPicker();
  }

  const current = (): Setlist => ({ name: nameInput.value, ids });

  const open = () => {
    nameInput.value = initial?.name ?? nameInput.value;
    hint.textContent = '';
    render();
    document.body.classList.add('editing-setlist');
    window.scrollTo(0, 0);
  };
  const close = () => document.body.classList.remove('editing-setlist');

  triggers.forEach(t => t?.addEventListener('click', open));
  cancelBtn.addEventListener('click', close);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.body.classList.contains('editing-setlist')) close();
  });
  pickerSearch.addEventListener('input', renderPicker);
  openBtn.addEventListener('click', () => { window.location.href = buildSetlistUrl(current()); });
  copyBtn.addEventListener('click', async () => {
    const url = buildSetlistUrl(current());
    try {
      await navigator.clipboard.writeText(url);
      hint.textContent = 'Link kopiert.';
    } catch {
      window.prompt('Link kopieren:', url);
    }
  });
}
