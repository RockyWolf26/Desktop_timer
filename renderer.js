const { ipcRenderer } = require('electron');

const modeLabel = document.getElementById('mode-label');
const timerDisplay = document.getElementById('timer-display');
const actionBtn = document.getElementById('action-btn');
const pauseBtn = document.getElementById('pause-btn');
const minimizeBtn = document.getElementById('minimize-btn');
const closeBtn = document.getElementById('close-btn');

let state = 'idle'; // 'idle' | 'focus' | 'break'
let intervalId = null;

// Zmienne do śledzenia czasu za pomocą Date.now()
let focusTotalMs = 0;        // skumulowany czas skupienia w ms (uwzględnia pauzy)
let focusStartTime = null;   // timestamp startu bieżącego odcinka (po starcie lub wznowieniu)
let isPaused = false;

let breakEndTime = null;     // timestamp zakończenia przerwy
let breakTotalMs = 0;        // pozostało ms w przerwie (do wyświetlania)

// ---- Obsługa przycisków tytułowych przez IPC ----
minimizeBtn.addEventListener('click', () => {
  ipcRenderer.send('minimize-window');
});

closeBtn.addEventListener('click', () => {
  ipcRenderer.send('close-window');
});

// ---- Dźwięk po zakończeniu przerwy ----
function playBreakEndSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.5);

    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1108, audioCtx.currentTime + 0.2);
    gain2.gain.setValueAtTime(0.3, audioCtx.currentTime + 0.2);
    gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.7);
    osc2.start(audioCtx.currentTime + 0.2);
    osc2.stop(audioCtx.currentTime + 0.7);

    const osc3 = audioCtx.createOscillator();
    const gain3 = audioCtx.createGain();
    osc3.connect(gain3);
    gain3.connect(audioCtx.destination);
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(1320, audioCtx.currentTime + 0.4);
    gain3.gain.setValueAtTime(0.3, audioCtx.currentTime + 0.4);
    gain3.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.9);
    osc3.start(audioCtx.currentTime + 0.4);
    osc3.stop(audioCtx.currentTime + 0.9);
  } catch (e) {
    // Audio nie jest dostępne – ignoruj
  }
}

// ---- Formatowanie czasu ----
function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ---- Odczyt aktualnego czasu skupienia ----
function getFocusElapsedMs() {
  if (focusStartTime === null) return focusTotalMs;
  return focusTotalMs + (Date.now() - focusStartTime);
}

function getFocusElapsedSeconds() {
  return Math.floor(getFocusElapsedMs() / 1000);
}

function updateUI() {
  if (state === 'idle') {
    modeLabel.textContent = 'GOTOWY';
    timerDisplay.textContent = '00:00';
    actionBtn.textContent = 'Start';
    actionBtn.style.display = 'inline-block';
    pauseBtn.style.display = 'none';
  } else if (state === 'focus') {
    modeLabel.textContent = 'SESJA SKUPIENIA';
    timerDisplay.textContent = formatTime(getFocusElapsedSeconds());
    actionBtn.textContent = 'Przejdź do przerwy';
    actionBtn.style.display = 'inline-block';
    pauseBtn.style.display = 'inline-flex';
  } else if (state === 'break') {
    modeLabel.textContent = 'PRZERWA';
    timerDisplay.textContent = formatTime(Math.max(0, Math.ceil(breakTotalMs / 1000)));
    actionBtn.style.display = 'none';
    pauseBtn.style.display = 'none';
  }
}

function stopTimer() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function startFocusTimer() {
  // Interwał co 200ms dla responsywności – nawet gdy okno ukryte, Date.now() daje poprawny czas
  intervalId = setInterval(() => {
    if (state === 'focus') {
      timerDisplay.textContent = formatTime(getFocusElapsedSeconds());
    } else if (state === 'break') {
      const remainingMs = breakEndTime - Date.now();
      breakTotalMs = remainingMs;
      timerDisplay.textContent = formatTime(Math.max(0, Math.ceil(remainingMs / 1000)));
      if (remainingMs <= 0) {
        stopTimer();
        playBreakEndSound();
        state = 'idle';
        focusTotalMs = 0;
        focusStartTime = null;
        breakEndTime = null;
        breakTotalMs = 0;
        isPaused = false;
        updateUI();
      }
    }
  }, 200);
}

function startFocus() {
  state = 'focus';
  isPaused = false;
  focusTotalMs = 0;
  focusStartTime = Date.now();
  pauseBtn.textContent = '⏸';
  stopTimer();
  updateUI();
  startFocusTimer();
}

function togglePause() {
  if (state !== 'focus') return;

  if (!isPaused) {
    // Pauzuj – zapamiętaj skumulowany czas
    focusTotalMs += Date.now() - focusStartTime;
    focusStartTime = null;
    isPaused = true;
    pauseBtn.textContent = '▶';
  } else {
    // Wznów – ustaw nowy start
    focusStartTime = Date.now();
    isPaused = false;
    pauseBtn.textContent = '⏸';
  }
}

function startBreak() {
  stopTimer();

  const focusSeconds = getFocusElapsedSeconds();

  // Oblicz czas przerwy: czas skupienia / 5, zaokrąglone w dół do pełnych minut
  const breakMinutes = Math.floor(focusSeconds / 4 / 60);
  let breakMs = breakMinutes * 60 * 1000;

  // Jeśli przerwa wyszła 0 minut, ustaw minimalnie 1 minutę
  if (breakMs < 60000) {
    breakMs = 60000;
  }

  state = 'break';
  isPaused = false;
  focusStartTime = null;
  breakEndTime = Date.now() + breakMs;
  breakTotalMs = breakMs;
  updateUI();
  startFocusTimer();
}

actionBtn.addEventListener('click', () => {
  if (state === 'idle') {
    startFocus();
  } else if (state === 'focus') {
    startBreak();
  }
});

pauseBtn.addEventListener('click', togglePause);

// Zablokuj kontekstowe menu
document.addEventListener('contextmenu', (e) => e.preventDefault());