import { fmt } from './ui.js';
import { FORMATS, RESOLUTIONS, SYSTEM_FONTS, WEB_FONTS } from './presets.js';

const isOrbit = (S) => S.style === 'orbit';
const pctSigned = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
const pctOrOff = (v) => (v > 0 ? fmt.pct(v) : 'no');

export const TABS = [
  ['look', 'Stile'],
  ['scene', 'Scena'],
  ['text', 'Testi'],
  ['export', 'Esporta'],
];

export function panelSchema() {
  return [
    // ---------- Stile ----------
    { tab: 'look', title: 'Look', controls: [{ type: 'custom', id: 'looks' }] },
    {
      tab: 'look', title: 'Formato',
      controls: [{ type: 'seg', key: 'format', options: Object.entries(FORMATS).map(([k, f]) => [k, f.name, f.hint]) }],
    },
    { tab: 'look', title: 'Stile', controls: [{ type: 'custom', id: 'styles' }] },
    {
      tab: 'look', title: 'Forma',
      controls: [
        { type: 'range', key: 'scale', label: 'Dimensione', min: 0.6, max: 1.4, step: 0.02, fmt: fmt.pct },
        { type: 'range', key: 'offsetY', label: 'Posizione verticale', min: -0.25, max: 0.25, step: 0.01, fmt: pctSigned },
        { type: 'range', key: 'density', label: 'Densità', min: 0.3, max: 1, step: 0.05, fmt: fmt.pct },
        { type: 'range', key: 'barWidth', label: 'Spessore linee', min: 0.4, max: 2.5, step: 0.05 },
        { type: 'check', key: 'mirror', label: 'Simmetrico (speculare)', when: isOrbit },
        { type: 'seg', key: 'orientation', options: [['top', 'Bassi in alto'], ['bottom', 'Bassi in basso']], when: (S) => isOrbit(S) && S.mirror },
        { type: 'range', key: 'spin', label: 'Rotazione', min: 0, max: 1, step: 0.05, fmt: pctOrOff, when: isOrbit },
        {
          type: 'select', key: 'core', label: "Centro dell'anello",
          options: [['scope', 'Oscilloscopio'], ['pulse', 'Nucleo pulsante'], ['empty', 'Vuoto']],
          when: (S, api) => isOrbit(S) && !api.hasImage('cover'),
        },
        { type: 'check', key: 'showTicks', label: 'Anello dei battiti', when: isOrbit },
        { type: 'check', key: 'reflection', label: 'Riflesso', when: (S) => S.style === 'horizon' },
        { type: 'range', key: 'waveLayers', label: 'Strati della scia', min: 1, max: 6, step: 1, fmt: fmt.int, when: (S) => S.style === 'wave' },
        { type: 'check', key: 'showRipples', label: 'Onde sui colpi di cassa' },
      ],
    },
    {
      tab: 'look', title: 'Colori',
      controls: [
        { type: 'custom', id: 'swatches' },
        { type: 'colors', items: [{ key: 'colorA', label: 'Primario' }, { key: 'colorB', label: 'Secondario' }] },
        { type: 'seg', key: 'colorMode', label: 'Colore delle barre', options: [['frequency', 'Frequenza'], ['intensity', 'Intensità'], ['mono', 'Unico']] },
        { type: 'range', key: 'hueShift', label: 'Variazione di tinta nel tempo', min: 0, max: 1, step: 0.05, fmt: pctOrOff },
      ],
    },
    {
      tab: 'look', title: 'Dinamica',
      controls: [
        { type: 'range', key: 'reactivity', label: 'Reattività', min: 0.4, max: 1.8, step: 0.05 },
        { type: 'range', key: 'smoothing', label: 'Morbidezza', min: 0, max: 1, step: 0.05, fmt: fmt.pct },
        { type: 'range', key: 'sensitivity', label: 'Sensibilità ai colpi', min: 0, max: 1, step: 0.05, fmt: fmt.pct },
        {
          type: 'range', key: 'syncOffset', label: 'Sincronia grafica', min: -150, max: 150, step: 5, fmt: fmt.ms,
          hint: 'Negativo = la grafica anticipa il suono',
        },
        { type: 'custom', id: 'kickInfo' },
        { type: 'note', text: 'Doppio clic su uno slider per riportarlo al valore predefinito.' },
      ],
    },

    // ---------- Scena ----------
    {
      tab: 'scene', title: 'Sfondo',
      controls: [
        { type: 'seg', key: 'bgMode', options: [['solid', 'Tinta unita'], ['gradient', 'Sfumato']] },
        {
          type: 'colors',
          items: [
            { key: 'colorBg', label: 'Colore' },
            { key: 'colorBg2', label: 'Secondo colore', when: (S) => S.bgMode === 'gradient' },
          ],
        },
        { type: 'range', key: 'glow', label: 'Alone centrale', min: 0, max: 2, step: 0.05, fmt: pctOrOff },
        { type: 'custom', id: 'bgImage' },
        { type: 'range', key: 'bgBlur', label: 'Sfocatura immagine', min: 0, max: 1, step: 0.05, fmt: pctOrOff, when: (S, api) => api.hasImage('background') },
        { type: 'range', key: 'bgDim', label: 'Oscuramento immagine', min: 0, max: 0.9, step: 0.05, fmt: fmt.pct, when: (S, api) => api.hasImage('background') },
      ],
    },
    {
      tab: 'scene', title: 'Effetti',
      controls: [
        { type: 'range', key: 'bloom', label: 'Bagliore', min: 0, max: 1.5, step: 0.05, fmt: pctOrOff },
        { type: 'range', key: 'punch', label: 'Colpo di camera', min: 0, max: 2, step: 0.05, fmt: pctOrOff },
        { type: 'range', key: 'flash', label: 'Lampo sui colpi', min: 0, max: 1, step: 0.05, fmt: pctOrOff },
        { type: 'range', key: 'shake', label: 'Vibrazione', min: 0, max: 1, step: 0.05, fmt: pctOrOff },
        { type: 'range', key: 'particles', label: 'Particelle', min: 0, max: 2, step: 0.05, fmt: pctOrOff },
        { type: 'range', key: 'vignette', label: 'Vignettatura', min: 0, max: 1, step: 0.05, fmt: pctOrOff },
        { type: 'range', key: 'grain', label: 'Grana pellicola', min: 0, max: 1, step: 0.05, fmt: pctOrOff },
      ],
    },
    { tab: 'scene', title: 'Copertina', when: isOrbit, controls: [{ type: 'custom', id: 'coverImage' }] },
    {
      tab: 'scene', title: 'Logo',
      controls: [
        { type: 'custom', id: 'logoImage' },
        {
          type: 'select', key: 'logoPosition', label: 'Posizione',
          options: [
            ['top-left', 'In alto a sinistra'], ['top-center', 'In alto al centro'], ['top-right', 'In alto a destra'],
            ['bottom-left', 'In basso a sinistra'], ['bottom-center', 'In basso al centro'], ['bottom-right', 'In basso a destra'],
          ],
          when: (S, api) => api.hasImage('logo'),
        },
        { type: 'range', key: 'logoSize', label: 'Dimensione', min: 0.04, max: 0.3, step: 0.01, fmt: fmt.pct, when: (S, api) => api.hasImage('logo') },
        { type: 'range', key: 'logoOpacity', label: 'Opacità', min: 0.1, max: 1, step: 0.05, fmt: fmt.pct, when: (S, api) => api.hasImage('logo') },
      ],
    },

    // ---------- Testi ----------
    {
      tab: 'text', title: 'Titoli',
      controls: [
        { type: 'text', key: 'title', label: 'Titolo', placeholder: 'Titolo del brano' },
        { type: 'text', key: 'artist', label: 'Artista', placeholder: 'Nome artista' },
        {
          type: 'select', key: 'font', label: 'Carattere',
          options: (S, api) => [
            { group: 'Sistema', items: SYSTEM_FONTS.map((f) => [f, f]) },
            { group: 'Google Fonts (serve internet)', items: WEB_FONTS.map((f) => [f, f]) },
            ...(api.customFonts.length ? [{ group: 'Caricati', items: api.customFonts.map((f) => [f, f]) }] : []),
          ],
        },
        { type: 'custom', id: 'fontUpload' },
        { type: 'colors', items: [{ key: 'textColor', label: 'Colore del testo' }] },
        { type: 'check', key: 'showTitle', label: 'Mostra titolo e artista' },
        {
          type: 'select', key: 'titlePosition', label: 'Posizione titolo',
          options: [
            ['auto', 'Automatica'], ['top-left', 'In alto a sinistra'], ['top-center', 'In alto al centro'],
            ['bottom-left', 'In basso a sinistra'], ['bottom-center', 'In basso al centro'],
          ],
          when: (S) => S.showTitle,
        },
        { type: 'range', key: 'titleSize', label: 'Dimensione titolo', min: 0.6, max: 1.8, step: 0.05, when: (S) => S.showTitle },
        { type: 'check', key: 'titleUpper', label: 'Titolo in maiuscolo', when: (S) => S.showTitle },
        { type: 'check', key: 'showProgress', label: 'Barra di avanzamento' },
      ],
    },
    {
      tab: 'text', title: 'Testo della canzone', badge: 'lyricsBadge',
      controls: [
        { type: 'custom', id: 'lyricsEditor' },
        { type: 'check', key: 'showLyrics', label: 'Mostra il testo nel video' },
        {
          type: 'seg', key: 'lyricsAnim', label: 'Animazione',
          options: [['fade', 'Dissolvenza'], ['pop', 'Pop'], ['wipe', 'Scoperta'], ['karaoke', 'Karaoke']],
        },
        {
          type: 'select', key: 'lyricsPosition', label: 'Posizione',
          options: [['auto', 'Automatica'], ['top', 'In alto'], ['center', 'Al centro'], ['bottom', 'In basso']],
        },
        { type: 'range', key: 'lyricsSize', label: 'Dimensione', min: 0.6, max: 1.8, step: 0.05 },
        { type: 'seg', key: 'lyricsWeight', label: 'Spessore', number: true, options: [[400, 'Normale'], [600, 'Medio'], [800, 'Grassetto']] },
        { type: 'check', key: 'lyricsUpper', label: 'Tutto maiuscolo' },
        { type: 'check', key: 'showNextLine', label: 'Mostra in piccolo la riga successiva' },
      ],
    },

    // ---------- Esporta ----------
    {
      tab: 'export', title: 'Durata',
      controls: [
        { type: 'check', key: 'rangeEnabled', label: 'Esporta solo un estratto' },
        { type: 'custom', id: 'rangeEditor', when: (S) => S.rangeEnabled },
        { type: 'range', key: 'fadeIn', label: 'Dissolvenza in entrata', min: 0, max: 5, step: 0.1, fmt: fmt.sec },
        { type: 'range', key: 'fadeOut', label: 'Dissolvenza in uscita', min: 0, max: 5, step: 0.1, fmt: fmt.sec },
      ],
    },
    {
      tab: 'export', title: 'Video',
      controls: [
        { type: 'seg', key: 'resolution', number: true, options: Object.entries(RESOLUTIONS).map(([k, r]) => [k, r.name, r.hint]) },
        { type: 'seg', key: 'fps', number: true, options: [[30, '30 fps', 'più veloce'], [60, '60 fps', 'più fluido']] },
        { type: 'seg', key: 'quality', options: [['standard', 'Standard', 'qualità'], ['high', 'Alta', 'qualità']] },
        { type: 'check', key: 'previewHD', label: 'Anteprima a piena risoluzione' },
        { type: 'custom', id: 'exportButton' },
      ],
    },
  ];
}
