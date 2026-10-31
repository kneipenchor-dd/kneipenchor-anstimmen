// main.ts
import './style.css'
import audioManager from './audio-manager';
import { Setlist, parseSetlistFromUrl, resolveSetlistSongs, loadDone, saveDone, setupSetlistEditor } from './setlist';
import { VoiceType, Song, SongNote, Voice, isSongNote } from './types';

// Zuordnung von Voice-Keys zu Display-Namen
const voiceTypes: VoiceType[] = [
  { key: 'soprano', label: 'Sopran', class: 'soprano' },
  { key: 'alto', label: 'Alt', class: 'alto' },
  { key: 'tenor', label: 'Tenor', class: 'tenor' },
  { key: 'bass', label: 'Bass', class: 'bass' }
];

// Referenz auf alle geladenen Songs für die Suche
let allSongs: Song[] = [];

// Globale Variable für konfigurierbare Dauer
let individualNotePlayDuration = 800; // Default value in ms for individual note playback
const INDIVIDUAL_NOTE_PLAY_DURATION_STORAGE_KEY = 'individualNotePlayDurationSetting';

// Globale Variable für Lautstärke
let currentVolumePercent = 90; // Default volume 0-100 (90 corresponds to approx -6dB)
const VOLUME_SETTING_STORAGE_KEY = 'volumeSetting';

// Short forms for voice types for button display
const voiceShortForms: Record<Voice, string> = {
  soprano: 'S',
  alto: 'A',
  tenor: 'T',
  bass: 'B',
};

document.addEventListener('DOMContentLoaded', () => {
  loadSongs();
  setupFilterModal();
});

// Suchfunktionalität einrichten
function setupSearch(): void {
  const searchInput = document.getElementById('song-search') as HTMLInputElement;
  const clearButton = document.getElementById('clear-search');
  const searchResults = document.getElementById('search-results');

  if (!searchInput || !clearButton || !searchResults) return;

  // URL-Parameter prüfen und Suchfeld füllen
  const urlParams = new URLSearchParams(window.location.search);
  const searchParam = urlParams.get('search');

  if (searchParam) {
    searchInput.value = searchParam;
    clearButton.classList.add('visible');
    performSearch(searchParam.trim().toLowerCase());
  }

  // Event-Listener für die Eingabe
  searchInput.addEventListener('input', function() {
    const searchTerm = this.value.trim().toLowerCase();

    // Clear-Button anzeigen/ausblenden
    clearButton.classList.toggle('visible', searchTerm.length > 0);

    // Suche ausführen
    performSearch(searchTerm);
  });

  // Event-Listener für das Löschen der Suche
  clearButton.addEventListener('click', function() {
    searchInput.value = '';
    clearButton.classList.remove('visible');
    performSearch('');
    searchInput.focus();
  });

  // Event-Listener für ESC-Taste zum Löschen
  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      searchInput.value = '';
      clearButton.classList.remove('visible');
      performSearch('');
    }
  });
}

// Durchführung der Suche
function performSearch(searchTerm: string): void {
  const songRows = document.querySelectorAll('.title-row');
  const resultInfo = document.getElementById('search-results');

  // Alle Lieder durchsuchen
  let matchCount = 0;

  songRows.forEach(row => {
    const titleCell = row.querySelector('.song-title');
    if (!titleCell) return;

    const title = titleCell.textContent?.toLowerCase() || '';
    const nextRow = row.nextElementSibling as HTMLElement; // Die Zeile mit den Buttons

    // Prüfen, ob der Titel den Suchbegriff enthält
    const isMatch = title.includes(searchTerm);

    // Zeilen ein-/ausblenden
    row.classList.toggle('song-hidden', searchTerm !== '' && !isMatch);
    if (nextRow) {
      nextRow.classList.toggle('song-hidden', searchTerm !== '' && !isMatch);
    }

    // Zählen der Treffer
    if (isMatch && searchTerm !== '') {
      matchCount++;

      // Suchbegriff im Titel hervorheben (nur wenn etwas gesucht wird)
      if (searchTerm) {
        const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi');
        const highlightedTitle = (titleCell.textContent || '').replace(
          regex, 
          '<span class="highlight-match">$1</span>'
        );
        titleCell.innerHTML = highlightedTitle;
      } else {
        titleCell.textContent = titleCell.textContent || ''; // Zurücksetzen
      }
    } else if (searchTerm === '') {
      // Hervorhebungen entfernen wenn Suche leer ist
      titleCell.textContent = titleCell.textContent || '';
    }
  });

  // Suchinformationen anzeigen
  if (resultInfo) {
    if (searchTerm === '') {
      resultInfo.textContent = '';
    } else if (matchCount === 0) {
      resultInfo.textContent = 'Keine Lieder gefunden.';
    } else {
      resultInfo.textContent = `${matchCount} Lied${matchCount !== 1 ? 'er' : ''} gefunden.`;
    }
  }
}

// Hilfsfunktion zum Escapen von Sonderzeichen in RegExp
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Filter-Funktion einrichten
function setupVoiceFilter(): void {
  // Alle Einstellungen laden (Filter, Notendauer, Lautstärke)
  loadAllSettings();

  // --- Event-Listener für Filtercheckboxen ---
  const checkboxes = document.querySelectorAll('.filter-option input[type="checkbox"]');
  checkboxes.forEach(checkbox => {
    checkbox.addEventListener('change', function(this: HTMLInputElement) {
      const voiceKey = this.dataset.voice || '';
      toggleVoiceVisibility(voiceKey, this.checked);

      // Einstellungen im localStorage speichern
      saveAllSettings();
    });

    // Initial die Sichtbarkeit basierend auf Checkbox-Status setzen
    const voiceKey = (checkbox as HTMLInputElement).dataset.voice || '';
    toggleVoiceVisibility(voiceKey, (checkbox as HTMLInputElement).checked);
  });

  // --- Event-Listener für Abspieldauer-Eingabefeld (einzelne Töne) ---
  const playDurationInput = document.getElementById('play-duration-input') as HTMLInputElement;
  const playDurationValueDisplay = document.getElementById('play-duration-value') as HTMLSpanElement;

  if (playDurationInput && playDurationValueDisplay) {
    // Event listener for the range slider
    playDurationInput.addEventListener('input', function(this: HTMLInputElement) {
      const newDuration = parseInt(this.value, 10);
      if (!isNaN(newDuration) && newDuration >= parseInt(this.min) && newDuration <= parseInt(this.max)) {
        individualNotePlayDuration = newDuration;
        playDurationValueDisplay.textContent = newDuration.toString();
        saveAllSettings();
      } else {
        // Reset to current valid value if input is invalid
        this.value = individualNotePlayDuration.toString();
        playDurationValueDisplay.textContent = individualNotePlayDuration.toString();
      }
    });
  }

  // --- Event-Listener für Lautstärke-Regler ---
  const volumeInput = document.getElementById('volume-control-input') as HTMLInputElement;
  const volumeValueDisplay = document.getElementById('volume-control-value') as HTMLSpanElement;

  if (volumeInput && volumeValueDisplay) {
    volumeInput.addEventListener('input', function(this: HTMLInputElement) {
      const newVolume = parseInt(this.value, 10);
      // Range input inherently constrains values between min and max
      currentVolumePercent = newVolume;
      volumeValueDisplay.textContent = newVolume.toString();
      audioManager.setVolume(currentVolumePercent); // Update AudioManager
      saveAllSettings(); // Save the new volume setting
    });
  }
}



// Sichtbarkeit einer Stimmgruppe umschalten (no changes to this function)
function toggleVoiceVisibility(voiceKey: string, isVisible: boolean): void {
  console.log(`Toggling visibility for ${voiceKey}: ${isVisible}`);

  // Determine the correct selectors for header and cells
  const headerSelector = voiceKey === 'alle' ? `th.alle-column` : `th.voice-column.${voiceKey}`;
  const cellSelector = voiceKey === 'alle' ? `td.alle-column` : `td.voice-column.${voiceKey}`;

  // Toggle header visibility
  const headerCell = document.querySelector(headerSelector);
  if (headerCell) {
    headerCell.classList.toggle('hidden', !isVisible);
  }

  // Toggle cell visibility (this covers both desktop and mobile views)
  const cells = document.querySelectorAll(cellSelector);
  cells.forEach(cell => {
    cell.classList.toggle('hidden', !isVisible);
  });
}

// Alle Einstellungen (Filter, Notendauer, Lautstärke) im localStorage speichern
function saveAllSettings(): void {
  // Filter-Einstellungen speichern
  const filterSettings: Record<string, boolean> = {};
  document.querySelectorAll('.filter-option input[type="checkbox"]').forEach(checkbox => {
    const voice = (checkbox as HTMLInputElement).dataset.voice;
    if (voice) {
      filterSettings[voice] = (checkbox as HTMLInputElement).checked;
    }
  });
  localStorage.setItem('voiceFilterSettings', JSON.stringify(filterSettings));

  // Abspieldauer für einzelne Töne speichern
  localStorage.setItem(INDIVIDUAL_NOTE_PLAY_DURATION_STORAGE_KEY, individualNotePlayDuration.toString());

  // Lautstärke speichern
  localStorage.setItem(VOLUME_SETTING_STORAGE_KEY, currentVolumePercent.toString());
}

// Alle Einstellungen (Filter, Notendauer, Lautstärke) aus localStorage laden
function loadAllSettings(): void {
  // --- Filter-Einstellungen laden ---
  // Filter-Einstellungen laden
  const savedFilterSettings = localStorage.getItem('voiceFilterSettings');
  if (savedFilterSettings) {
    const settings = JSON.parse(savedFilterSettings) as Record<string, boolean>;
    document.querySelectorAll('.filter-option input[type="checkbox"]').forEach(checkbox => {
      const voice = (checkbox as HTMLInputElement).dataset.voice;
      if (voice && voice in settings) {
        (checkbox as HTMLInputElement).checked = settings[voice];
      }
    });
  }

  // --- Abspieldauer für Töne laden ---
  const savedPlayDuration = localStorage.getItem(INDIVIDUAL_NOTE_PLAY_DURATION_STORAGE_KEY);
  if (savedPlayDuration) {
    const parsedPlayDuration = parseInt(savedPlayDuration, 10);
    if (!isNaN(parsedPlayDuration)) {
      individualNotePlayDuration = parsedPlayDuration;
    }
  }
  // Update both the slider and its value display
  const playDurationInput = document.getElementById('play-duration-input') as HTMLInputElement;
  const playDurationValueDisplay = document.getElementById('play-duration-value') as HTMLSpanElement;
  if (playDurationInput && playDurationValueDisplay) {
    playDurationInput.value = individualNotePlayDuration.toString();
    playDurationValueDisplay.textContent = individualNotePlayDuration.toString();
  }

  // --- Lautstärke laden ---
  const savedVolume = localStorage.getItem(VOLUME_SETTING_STORAGE_KEY);
  if (savedVolume) {
    const parsedVolume = parseInt(savedVolume, 10);
    if (!isNaN(parsedVolume) && parsedVolume >= 0 && parsedVolume <= 100) {
      currentVolumePercent = parsedVolume;
    }
  }
  const volumeInput = document.getElementById('volume-control-input') as HTMLInputElement;
  const volumeValueDisplay = document.getElementById('volume-control-value') as HTMLSpanElement;
  if (volumeInput && volumeValueDisplay) {
    volumeInput.value = currentVolumePercent.toString();
    volumeValueDisplay.textContent = currentVolumePercent.toString();
  }
  audioManager.setVolume(currentVolumePercent); // Apply loaded/default volume to AudioManager
}


async function loadSongs(): Promise<void> {
  try {
    const response = await fetch('./songs.json', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Konnte Lieder nicht laden');
    }

    const data = await response.json();
    allSongs = data.songs; // Alle Songs für die Suche speichern
    const setlist = parseSetlistFromUrl();
    setupSetlistEditor(() => allSongs, setlist);
    if (setlist) {
      setupSetlistView(setlist);
    } else {
      displaySongs(data.songs);
    }

    const loadingElement = document.getElementById('loading');
    const songTableElement = document.getElementById('song-table');

    if (loadingElement) loadingElement.classList.add('hidden');
    if (songTableElement) songTableElement.classList.remove('hidden');

    setupSearch();
    setupVoiceFilter();
  } catch (error) {
    console.error('Fehler beim Laden der Lieder:', error);
    const loadingElement = document.getElementById('loading');
    if (loadingElement) {
      loadingElement.textContent = 'Fehler beim Laden der Lieder. Bitte Seite neu laden.';
    }
  }
}

// Setlist-Ansicht: feste Reihenfolge, gesungene Lieder werden ausgeblendet
function setupSetlistView(setlist: Setlist): void {
  const { songs, unknown } = resolveSetlistSongs(setlist, allSongs);
  const done = loadDone(setlist);
  const bar = document.getElementById('setlist-bar')!;
  const progress = document.getElementById('setlist-progress')!;
  document.getElementById('app-title')!.textContent = setlist.name;
  document.title = `${setlist.name} – Chor Anfangstöne`;
  bar.classList.remove('hidden');
  document.getElementById('search-section')?.classList.add('hidden');
  document.getElementById('all-songs-link')?.classList.remove('hidden');
  if (unknown.length > 0) {
    console.warn('Unbekannte Lied-IDs in Setlist:', unknown);
  }

  displaySongs(songs, true);

  const rows = () => document.querySelectorAll<HTMLElement>('#song-list .title-row');
  const refresh = () => {
    rows().forEach(row => {
      const isDone = done.has(row.dataset.songId || '');
      row.classList.toggle('song-done', isDone);
      (row.nextElementSibling as HTMLElement | null)?.classList.toggle('song-done', isDone);
    });
    const doneCount = songs.filter(s => done.has(s.id || '')).length;
    progress.textContent = `${doneCount}/${songs.length} gesungen`
      + (unknown.length ? ` · ${unknown.length} unbekannt` : '');
  };

  let toastTimer: number | undefined;
  const toast = document.createElement('div');
  toast.className = 'setlist-toast hidden';
  document.body.appendChild(toast);
  const showUndo = (song: Song) => {
    toast.innerHTML = '';
    const text = document.createElement('span');
    text.textContent = `„${song.title}“ gesungen`;
    const undo = document.createElement('button');
    undo.type = 'button';
    undo.textContent = 'Rückgängig';
    undo.addEventListener('click', () => {
      done.delete(song.id || '');
      saveDone(setlist, done);
      toast.classList.add('hidden');
      refresh();
    });
    toast.append(text, undo);
    toast.classList.remove('hidden');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.add('hidden'), 6000);
  };

  document.getElementById('song-list')!.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest('.setlist-done-btn');
    const id = btn?.closest<HTMLElement>('.title-row')?.dataset.songId;
    const song = songs.find(s => s.id === id);
    if (!id || !song) return;
    done.add(id);
    saveDone(setlist, done);
    refresh();
    showUndo(song);
  });
  document.getElementById('setlist-reset')!.addEventListener('click', () => {
    if (done.size === 0 || !confirm('Alle Lieder wieder als ungesungen markieren?')) return;
    done.clear();
    saveDone(setlist, done);
    refresh();
  });
  refresh();
}

function displaySongs(songs: Song[], setlistMode = false): void {
  const songList = document.getElementById('song-list');
  if (!songList) return;

  songs.forEach(song => {
    // Erste Zeile mit Liedtitel (überspannt alle 4 Spalten)
    const titleRow = document.createElement('tr');
    titleRow.className = 'title-row';
    const titleCell = document.createElement('td');
    titleCell.textContent = song.title;
    titleCell.className = 'song-title';
    titleCell.colSpan = 5; // Überspannt alle 5 Spalten (4 Stimmen + Alle)
    if (song.id) titleRow.dataset.songId = song.id;
    if (setlistMode) {
      titleCell.textContent = '';
      const text = document.createElement('span');
      text.className = 'song-title-text';
      text.textContent = song.title;
      const doneBtn = document.createElement('button');
      doneBtn.type = 'button';
      doneBtn.className = 'setlist-done-btn';
      doneBtn.textContent = '☐ gesungen';
      doneBtn.setAttribute('aria-label', `${song.title} als gesungen markieren`);
      const inner = document.createElement('div');
      inner.className = 'setlist-title-cell';
      inner.append(text, doneBtn);
      titleCell.appendChild(inner);
    }
    titleRow.appendChild(titleCell);
    songList.appendChild(titleRow);

    // Zweite Zeile mit Buttons für die Stimmlagen
    const notesRow = document.createElement('tr');
    notesRow.className = 'notes-row';

    // --- Create the "Alle" cell (now first) ---
    const alleCell = document.createElement('td');
    alleCell.className = 'voice-column alle-column'; // Class for styling
    alleCell.dataset.label = 'Alle'; // For mobile view label

    const alleButtonContainer = document.createElement('div');
    alleButtonContainer.className = 'button-group';

    // Collect notes for sequential playback and their corresponding display labels for the button's static text
    const notesForSequencePlayback: SongNote[] = [];
    const sequenceDisplayLabels: string[] = [];

    voiceTypes.forEach(vt => {
      const noteValue = song.notes[vt.key];
      const voiceShort = voiceShortForms[vt.key];

      if (isSongNote(noteValue)) { // Single note string
        if (noteValue !== '-') {
          notesForSequencePlayback.push(noteValue);
          sequenceDisplayLabels.push(voiceShort);
        }
      } else if (noteValue && typeof noteValue === 'object') { // Object with sub-notes
        // Iterate entries to maintain a somewhat predictable order (e.g., 'hoch' then 'tief' if defined that way)
        Object.entries(noteValue).forEach(([subKey, subNote]) => {
          if (typeof subNote === 'string' && subNote !== '-') {
            notesForSequencePlayback.push(subNote);
            const subKeyShort = subKey.length > 0 ? subKey.substring(0, 1).toUpperCase() : ''; // e.g., H for hoch, T for tief
            sequenceDisplayLabels.push(`${voiceShort}${subKeyShort}`);
          }
        });
      }
    });
    // --- "Akkord" Button ---
    let allNotesForSong: SongNote[];

    let melodyNodesForSong: SongNote[] = [];
    // Check for customMoldy
    if (song.customMelody && song.customMelody.length > 0) {
      melodyNodesForSong = song.customMelody.filter(note => note !== '-');
      console.log(`Found custom melody for "${song.title}":`, melodyNodesForSong)
    }

    // Check for customChord first
    if (song.customChord && song.customChord.length > 0) {
      allNotesForSong = song.customChord.filter(note => note !== '-'); // Use custom chord if provided and not empty
      console.log(`Using custom chord for "${song.title}":`, allNotesForSong);
    } else {
      // Fallback to collecting notes from voices
      allNotesForSong = [];
      voiceTypes.forEach(vt => {
        const noteValue = song.notes[vt.key];
        if (isSongNote(noteValue)) { // Single note string
          if (noteValue !== '-') allNotesForSong.push(noteValue);
        } else if (noteValue && typeof noteValue === 'object') { // Object with sub-notes like { hoch: 'C4', tief: 'G3' }
          Object.values(noteValue).forEach(subNote => {
            if (typeof subNote === 'string' && subNote !== '-') {
              allNotesForSong.push(subNote);
            }
          });
        }
      });
    }

    const akkordButton = document.createElement('button');
    akkordButton.textContent = 'Akkord';
    akkordButton.className = 'play-button alle-button akkord-button';
    // Disable if no notes are available (allNotesForSong will be empty if all notes are '-')
    akkordButton.disabled = allNotesForSong.length === 0;

    akkordButton.addEventListener('click', async () => {
      if (akkordButton.disabled) return;
      akkordButton.disabled = true;
      audioManager.updatePlayingStatus(akkordButton, true);
      const playPromises = allNotesForSong.map(note =>
        audioManager.playNote(note, individualNotePlayDuration).catch(e => {
          console.error(`Fehler beim Abspielen von ${note} im Akkord-Versuch für "${song.title}".`, e);
          return false;
        })
      );
      await Promise.all(playPromises);
      setTimeout(() => {
        akkordButton.disabled = allNotesForSong.length === 0;
        audioManager.updatePlayingStatus(akkordButton, false);
      }, individualNotePlayDuration); // Use configurable duration
    });
    alleButtonContainer.appendChild(akkordButton);

    // Melody Button
    if (melodyNodesForSong.length !== 0) {
      const melodyButton = document.createElement('button');
      melodyButton.textContent = 'Melodie';
      melodyButton.className = 'play-button alle-button melody-button';
      melodyButton.addEventListener('click', async () => {
        if (melodyButton.disabled) return;
        melodyButton.disabled = true;
        for (let i = 0; i < melodyNodesForSong.length; i++) {
          const noteToPlay = melodyNodesForSong[i];
          audioManager.updatePlayingStatus(melodyButton, true);
          try {
            await audioManager.playNote(noteToPlay, individualNotePlayDuration);
          } catch (e) {
            console.error(`Fehler beim Abspielen von ${noteToPlay} in der Melodie-Versuch für "${song.title}.`, e);
          }
          await new Promise(resolve => setTimeout(resolve, individualNotePlayDuration));
          if (i < melodyNodesForSong.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
        melodyButton.disabled = false;
      });
      alleButtonContainer.appendChild(melodyButton);
    }

    // --- "Nacheinander" Button ---
    const nacheinanderButton = document.createElement('button');
    const nacheinanderButtonInitialText = sequenceDisplayLabels.length > 0 ? sequenceDisplayLabels.join(', ') : 'Nacheinander';
    nacheinanderButton.textContent = nacheinanderButtonInitialText;
    nacheinanderButton.className = 'play-button alle-button nacheinander-button';
    nacheinanderButton.disabled = notesForSequencePlayback.length === 0;

    // Event listener for "Nacheinander" (Sequential) button
    nacheinanderButton.addEventListener('click', async () => {
      if (nacheinanderButton.disabled) return;
      nacheinanderButton.disabled = true; // Disable the button for the duration of the sequence
      // The button text (e.g., "S, AH, T") remains static during playback.

      const DURATION_PER_NOTE = individualNotePlayDuration; // Use the single configurable duration

      for (let i = 0; i < notesForSequencePlayback.length; i++) {
        const noteToPlay = notesForSequencePlayback[i];

        // Visual pulse remains, text does not change
        audioManager.updatePlayingStatus(nacheinanderButton, true); // Start visual pulse for this note

        try {
          await audioManager.playNote(noteToPlay, DURATION_PER_NOTE);
        } catch (e) {
          console.error(`Fehler beim Abspielen von ${noteToPlay} in Sequenz für Lied "${song.title}".`, e);
          // Continue to the delay even if this note fails, to maintain timing for visuals
        }

        // Wait for DURATION_PER_NOTE. This allows the note to be heard
        await new Promise(resolve => setTimeout(resolve, DURATION_PER_NOTE));

        audioManager.updatePlayingStatus(nacheinanderButton, false); // Stop visual pulse for this note

        // If not the last note, add a tiny delay for separation / animation restart.
        if (i < notesForSequencePlayback.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 50)); // 50ms brief pause
        }
      }
      // Re-enable the button after the entire sequence is complete
      nacheinanderButton.disabled = notesForSequencePlayback.length === 0;
    });
    alleButtonContainer.appendChild(nacheinanderButton);

    alleCell.appendChild(alleButtonContainer);
    notesRow.appendChild(alleCell); // Append "Alle" cell first

    // Zellen für die Stimmgruppen
    voiceTypes.forEach(voice => {
      const cell = document.createElement('td');
      cell.className = `voice-column ${voice.class}`;

      // Datenattribute für mobile Ansicht hinzufügen
      cell.dataset.label = voice.label;

      // Prüfen, ob es sich um ein einfaches Note-Format oder Hoch/Tief-Format handelt
      const noteValue = song.notes[voice.key];

      if (isSongNote(noteValue)) {
        // Einfacher Ton
        const button = createPlayButton(noteValue, voice.key, song.title);
        cell.appendChild(button);
      } else {
        // Mehrere Töne (Hoch/Tief)
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'button-group';

        // Für jeden Untertyp einen Button erstellen
        for (const [type, note] of Object.entries(noteValue)) {
          const button = createPlayButton(note, voice.key, song.title, type);
          button.dataset.voiceType = type;
          buttonContainer.appendChild(button);
        }

        cell.appendChild(buttonContainer);
      }

      notesRow.appendChild(cell);
    });

    songList.appendChild(notesRow);
  });
}

// Filter Modal Funktionalität
function setupFilterModal(): void {
  const modal = document.getElementById('filter-modal') as HTMLElement;
  const triggerButton = document.getElementById('filter-modal-trigger') as HTMLButtonElement;
  const closeButton = document.getElementById('modal-close-button') as HTMLButtonElement;

  if (!modal || !triggerButton || !closeButton) {
    console.error('Filter modal elements not found. Modal functionality will be disabled.');
    if (triggerButton) triggerButton.style.display = 'none'; // Hide trigger if modal is broken
    return;
  }

  const openModal = () => {
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    // Focus the close button or first interactive element within the modal
    closeButton.focus();
  };

  const closeModal = () => {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    // Return focus to the button that opened the modal
    triggerButton.focus();
  };

  triggerButton.addEventListener('click', openModal);
  closeButton.addEventListener('click', closeModal);

  // Close modal if user clicks on the backdrop
  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  // Close modal with Escape key
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeModal();
    }
  });
}


// Hilfsfunktion zum Erstellen eines Wiedergabe-Buttons
function createPlayButton(note: SongNote, voice: Voice, songTitle: string, subVoice: string | null = null): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'play-button';

  // Button-Text basierend auf Vorhandensein von voiceType anpassen
  if (subVoice) {
    button.textContent = `${subVoice}: ${note}`;
  } else {
    button.textContent = note;
  }

  button.dataset.note = note;
  button.dataset.voice = voice;
  button.disabled = (note === '-');

  button.addEventListener('click', async () => {
    // Verhindere mehrfaches Klicken
    if (button.disabled) return;

    const voiceInfo = subVoice ? `${voice} (${subVoice})` : voice;
    console.log(`Spiele Ton ${note} für ${voiceInfo} in Lied "${songTitle}"`);

    // Visuelles Feedback
    button.disabled = true;
    audioManager.updatePlayingStatus(button, true);

    // Ton abspielen
    const success = await audioManager.playNote(note, individualNotePlayDuration);

    // Nach konfigurierbarer Dauer zurücksetzen
    setTimeout(() => {
      button.disabled = false;
      audioManager.updatePlayingStatus(button, false);
    }, individualNotePlayDuration); // Use configurable duration

    // Fehlerbehandlung
    if (!success) {
      console.error(`Fehler beim Abspielen von ${note}`);
      alert('Tonwiedergabe nicht möglich.');
    }
  });

  return button;
}

// Audio-Initialisierung bei erster Benutzerinteraktion
document.addEventListener('click', async () => {
  if (!audioManager.initialized) {
    console.log('Initialisiere Audio nach Benutzerinteraktion');
    // AudioManager will use its currentVolumePercent, which was set by loadAllSettings()
    await audioManager.initialize(); 
  }
}, { once: true }); // once: true sorgt dafür, dass der Listener nur einmal ausgeführt wird
