// build-songs.ts
import fs from 'fs';
import path from 'path';
import { projectRoot } from './commons';

// Define interfaces for your data structures
interface SongNote {
  [key: string]: string | Record<string, string>;
}

interface Song {
  id?: string;
  title: string;
  notes: SongNote;
  [key: string]: any; // For any additional properties
}

interface OutputData {
  songs: Song[];
  meta: {
    count: number;
    generatedAt: string;
    sourceFiles: number;
  };
}

// Konfiguration
const sourceDir = path.join(projectRoot, 'songs');
const outputFile = path.join(projectRoot, 'public', 'songs.json');

console.log('Start Build-Prozess für songs.json');

// Prüfen, ob Quellverzeichnis existiert
if (!fs.existsSync(sourceDir)) {
  console.error(`Quellverzeichnis ${sourceDir} existiert nicht!`);
  process.exit(1);
}

// Alle JSON-Dateien im Quellverzeichnis finden
const songFiles = fs.readdirSync(sourceDir)
  .filter(file => file.endsWith('.json'));

console.log(`Gefundene Song-Dateien: ${songFiles.length}`);

// Alle Songs einlesen und zusammenführen
const songs: Song[] = [];
let errorCount = 0;

songFiles.forEach(file => {
  try {
    const filePath = path.join(sourceDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const song = JSON.parse(content) as Song;

    // Einfache Validierung
    if (!song.title || !song.notes) {
      console.warn(`Warnung: Song in ${file} hat nicht alle erforderlichen Felder (title, notes)`);
    }

    song.id = file.replace(/\.json$/, ''); // Dateiname als stabile ID
    songs.push(song);
    console.log(`✓ ${file} (${song.title})`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`× Fehler bei ${file}: ${error.message}`);
    } else {
      console.error(`× Fehler bei ${file}: Unbekannter Fehler`);
    }
    errorCount++;
  }
});

// Songs alphabetisch nach Titel sortieren
songs.sort((a, b) => a.title.localeCompare(b.title, 'de', { sensitivity: 'base' }));

// Ausgabedatei erzeugen
const output: OutputData = {
  songs: songs,
  meta: {
    count: songs.length,
    generatedAt: new Date().toISOString(),
    sourceFiles: songFiles.length
  }
};

// Ausgabeverzeichnis erstellen falls nötig
const outputDir = path.dirname(outputFile);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Ausgabedatei schreiben
fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));

console.log(`\nBuild abgeschlossen:`);
console.log(`- ${songs.length} Songs verarbeitet`);
console.log(`- ${errorCount} Fehler aufgetreten`);
console.log(`- Ausgabe: ${outputFile}`);
