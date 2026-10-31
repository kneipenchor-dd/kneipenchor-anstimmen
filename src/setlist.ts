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

// Editor-Modal: Setlist zusammenstellen, sortieren und als Link teilen
export function setupSetlistEditor(getSongs: () => Song[], initial: Setlist | null): void {
  const modal = document.getElementById('setlist-modal') as HTMLElement;
  const nameInput = document.getElementById('setlist-name-input') as HTMLInputElement;
  const itemsList = document.getElementById('setlist-items') as HTMLOListElement;
  const pickerSearch = document.getElementById('setlist-picker-search') as HTMLInputElement;
  const picker = document.getElementById('setlist-picker') as HTMLUListElement;
  const hint = document.getElementById('setlist-editor-hint') as HTMLElement;
  const closeBtn = document.getElementById('setlist-modal-close') as HTMLButtonElement;
  const openBtn = document.getElementById('setlist-open') as HTMLButtonElement;
  const copyBtn = document.getElementById('setlist-copy') as HTMLButtonElement;
  const triggers = [
    document.getElementById('setlist-editor-trigger'),
    document.getElementById('setlist-edit'),
  ];
  if (!modal) return;

  let ids: string[] = initial ? [...initial.ids] : [];
  const title = (id: string) => getSongs().find(s => s.id === id)?.title ?? id;

  const iconButton = (label: string, aria: string, onClick: () => void, disabled = false) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'setlist-icon-btn';
    b.textContent = label;
    b.setAttribute('aria-label', aria);
    b.disabled = disabled;
    b.addEventListener('click', onClick);
    return b;
  };

  // Drag-and-drop per Pointer Events (funktioniert mit Maus und Touch)
  const startDrag = (e: PointerEvent, handle: HTMLElement, index: number) => {
    e.preventDefault();
    const items = Array.from(itemsList.children) as HTMLElement[];
    let from = index;
    items[index].classList.add('dragging');
    handle.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      const y = ev.clientY;
      let to = from;
      items.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        if (y >= r.top && y <= r.bottom) to = i;
      });
      if (to !== from) {
        const [moved] = ids.splice(from, 1);
        ids.splice(to, 0, moved);
        const [movedEl] = items.splice(from, 1);
        items.splice(to, 0, movedEl);
        items.forEach(el => itemsList.appendChild(el));
        from = to;
      }
    };
    const onEnd = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onEnd);
      handle.removeEventListener('pointercancel', onEnd);
      render();
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
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
        li.append(span, iconButton('+', `${s.title} hinzufügen`, () => { ids.push(s.id!); render(); }));
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
      handle.title = 'Zum Sortieren ziehen';
      handle.addEventListener('pointerdown', e => startDrag(e, handle, i));
      li.append(
        handle,
        span,
        iconButton('×', 'Entfernen', () => { ids.splice(i, 1); render(); }),
      );
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
    modal.classList.remove('hidden');
  };
  const close = () => modal.classList.add('hidden');

  triggers.forEach(t => t?.addEventListener('click', open));
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
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
