// Точка входу окремої сторінки reader.html: лише сеанс погляду + читанка (без блок-схем).
import { initGazeSession } from './gaze/session.js';
import { initReader } from './reader/reader.js';

initGazeSession({ pauseBtn: document.getElementById('rd-pause') });
initReader({ standalone: true });
