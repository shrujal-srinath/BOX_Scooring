// Basketball Scoreboard Pro — Fixed Model 2

// ================== GLOBAL STATE ==================
const appState = {
  view: 'landing',
  isHost: false,
  gameCode: null,
  game: null,
  gameType: 'friendly',
  timers: { masterTimer: null },
  broadcastChannel: null,
  gameRunning: false,
  shotClockRunning: false,
  selectedPlayer: null,
  actionHistory: [],
  clockEditing: false
};

// ================== FIREBASE INITIALIZATION ======================
let fbApp, fbDB;
(function initFirebase() {
  // Initializes Firebase when the necessary libraries and config are ready
  if (!window.FirebaseMods || !window.firebaseConfig) return setTimeout(initFirebase, 200);
  const { initializeApp, getDatabase, getAuth, signInAnonymously } = window.FirebaseMods;
  fbApp = initializeApp(window.firebaseConfig);
  fbDB = getDatabase(fbApp);
  signInAnonymously(getAuth()).catch(e => console.warn("Firebase auth:", e));
  console.log("%c✔ Firebase initialized", "color:green");
})();

// ================== SHORTCUTS ==================
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

// ================== HELPERS ==================
function generateGameCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
function pad2(n) { return n.toString().padStart(2, '0'); }
function formatTime(m, s) { return `${pad2(m)}:${pad2(s)}`; }
function toast(message, type = 'info', duration = 2000) {
  const c = $('toastContainer');
  if (!c) return;
  const el = document.createElement('div');
  const size = message.length > 50 || type === 'error' ? 'large' :
               message.length > 30 || type === 'warning' ? 'medium' : 'small';
  el.className = `toast ${type} ${size}`;
  el.textContent = message;
  c.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(100%)';
    setTimeout(() => el.remove(), 300);
  }, duration);
}
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      toast('Game code copied!', 'success', 1500);
      return;
    }
  } catch {}
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    toast('Game code copied!', 'success', 1500);
  } catch {
    toast('Copy failed - copy manually', 'warning', 3000);
  }
  ta.remove();
}

// ================== DATA BROADCASTING ======================
function broadcastUpdate() {
  // Local tab sync (existing unchanged logic)
  if (appState.broadcastChannel) {
    try { appState.broadcastChannel.postMessage(appState.game); } catch(e) {}
  }
  // Global internet sync (new Firebase logic)
  if (fbDB && appState.isHost && appState.gameCode) {
    const { ref, set } = window.FirebaseMods;
    set(ref(fbDB, `games/${appState.gameCode}`), appState.game)
      .catch(e => console.error("Firebase write", e));
  }
}

// ================== VIEW ROUTER ==================
function showView(view) {
  const ids = ['landing', 'config', 'setup', 'control', 'viewer'];
  ids.forEach(v => {
    const el = $(`${v}-view`);
    if (!el) return;
    if (v === view) {
      el.classList.remove('hidden');
      el.style.display = 'block';
    } else {
      el.classList.add('hidden');
      el.style.display = 'none';
    }
  });
  appState.view = view;
}

// ================== SHOT CLOCK VIOLATION ==================
function playViolation() {
  const buzzer = $('buzzerSound');
  if (buzzer) {
    buzzer.currentTime = 0;
    buzzer.play().catch(()=>{});
  }
  const alert = $('shotClockViolation');
  if (alert) {
    alert.classList.remove('hidden');
    setTimeout(() => alert.classList.add('hidden'), 2000);
  }
}
function handleShotClockViolation() {
  playViolation();
  toast('SHOT CLOCK VIOLATION!', 'error', 3000);
  appState.shotClockRunning = false;
  if (appState.game) {
    const cur = appState.game.gameState.possession;
    appState.game.gameState.possession = cur === 'teamA' ? 'teamB' : 'teamA';
    appState.game.gameState.shotClock = 0;
    removeShotClockWarning(); // Note: This function needs to be defined in your code.
    updateControlDisplay();   // Note: This function needs to be defined in your code.
    updateSpectatorView();    // Note: This function needs to be defined in your code.
    broadcastUpdate();
    saveGameState();          // Note: This function needs to be defined in your code.
  }
  toast('Shot clock stopped - use restart buttons', 'warning', 4000);
}

// ================== MASTER TIMER LOOP ==================
function startMasterTimer() {
  stopMasterTimer();
  appState.timers.masterTimer = setInterval(() => {
    const g = appState.game;
    if (!g) return;
    let changed = false;

    // Game clock
    if (appState.gameRunning) {
      const t = g.gameState.gameTime;
      if (t.seconds > 0) {
        t.seconds--; changed = true;
      } else if (t.minutes > 0) {
        t.minutes--; t.seconds = 59; changed = true;
      } else {
        appState.gameRunning = false;
        appState.shotClockRunning = false;
        toast('Period ended!', 'warning', 3000);
        updateMasterStartButton();
      }
    }

    // Shot clock
    if (appState.shotClockRunning && g.settings.shotClockDuration > 0) {
      if (g.gameState.shotClock > 0) {
        g.gameState.shotClock--; changed = true;
        if (g.gameState.shotClock === 5) addShotClockWarning();
      } else {
        handleShotClockViolation();
        changed = true;
      }
    }

    if (changed) {
      updateControlDisplay(); // Note: This function needs to be defined in your code.
      updateSpectatorView();  // Note: This function needs to be defined in your code.
      broadcastUpdate();
      saveGameState();        // Note: This function needs to be defined in your code.
    }
  }, 1000);
}
function stopMasterTimer() {
  if (appState.timers.masterTimer) {
    clearInterval(appState.timers.masterTimer);
    appState.timers.masterTimer = null;
  }
}

// ================== CLOCK CONTROLS ==================
function updateMasterStartButton() {
  const btn = $('startGameBtn');
  if (!btn) return;
  if (appState.gameRunning || appState.shotClockRunning) {
    btn.textContent = 'PAUSE GAME';
    btn.className = 'btn btn--primary master-start-btn pause';
  } else {
    btn.textContent = 'START GAME';
    btn.className = 'btn btn--primary master-start-btn resume';
  }
}
function toggleMasterGame() {
  if (!appState.game) return;
  if (appState.gameRunning || appState.shotClockRunning) {
    appState.gameRunning = false;
    appState.shotClockRunning = false;
    stopMasterTimer();
    toast('Game paused', 'info', 1500);
  } else {
    appState.gameRunning = true;
    if (appState.game.settings.shotClockDuration > 0 && appState.game.gameState.shotClock > 0) {
      appState.shotClockRunning = true;
    }
    startMasterTimer();
    toast('Game started!', 'success', 1500);
  }
  updateMasterStartButton();
  broadcastUpdate();
  saveGameState(); // Note: This function needs to be defined in your code.
}
function resetAllClocks() {
  if (!appState.game) return;
  const g = appState.game;
  g.gameState.gameTime.minutes = g.settings.periodDuration;
  g.gameState.gameTime.seconds = 0;
  if (g.settings.shotClockDuration > 0) {
    g.gameState.shotClock = g.settings.shotClockDuration;
  } else {
    g.gameState.shotClock = 0;
  }
  removeShotClockWarning(); // Note: This function needs to be defined in your code.
  updateControlDisplay();   // Note: This function needs to be defined in your code.
  updateSpectatorView();    // Note: This function needs to be defined in your code.
  broadcastUpdate();
  saveGameState();          // Note: This function needs to be defined in your code.
  toast('All clocks reset', 'info', 1500);
}
function addShotClockWarning() {
  $('shotClockDisplay')?.classList.add('warning'); // Completed the function
}
function removeShotClockWarning() {
    $('shotClockDisplay')?.classList.remove('warning');
}

// ================== SPECTATOR AND EVENT LISTENERS ==============================
let fbDetach = null;
function startSpectating(code) {
  if (!fbDB) return toast?.("Connecting… please wait", "warning");
  const { ref, onValue } = window.FirebaseMods;
  // Remove any previous listener so only 1 active at a time
  if (typeof fbDetach === "function") { try { fbDetach(); } catch(e){} }
  fbDetach = onValue(ref(fbDB, `games/${code}`), snap => {
    const g = snap.val();
    if (!g) return;
    appState.game = g;
    appState.gameCode = code;
    // You must already have updateSpectatorView and updateControlDisplay
    updateSpectatorView?.();
    updateControlDisplay?.();
  }, e => console.error("Firebase read", e));
  toast?.(`Watching game ${code}`, "success");
}

// This should be right where you handle your "Watch Game" button event
$("watchGameBtn")?.addEventListener("click", () => {
  const code = $("watchCodeInput")?.value.trim();
  if (!code) return toast?.("Enter a game code", "warning");
  appState.isHost = false;
  startSpectating(code);
  showView?.("viewer");
});

// PDF EXPORT BUTTON FUNCTION
$("exportPdfBtn")?.addEventListener("click", () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.text(`Basketball Box Score – Game ${appState.gameCode || ""}`, 40, 40);
  doc.autoTable({
    html: "#statsTable",
    startY: 60,
    styles: { fontSize: 8, halign: "center" },
    headStyles: { fillColor: [33,128,141] }
  });
  doc.save(`bball_stats_${appState.gameCode || "game"}.pdf`);
});
