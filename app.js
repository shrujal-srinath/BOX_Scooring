// Basketball Scoreboard Pro — Full Functional Model

// ================== GLOBAL STATE ==================
const appState = {
  view: 'landing',
  isHost: false,
  gameCode: null,
  game: null,
  gameType: 'friendly',
  timers: { masterTimer: null, shotClockTimer: null },
  broadcastChannel: null,
  gameRunning: false,
  shotClockRunning: false,
  selectedPlayer: null,
  actionHistory: [],
  clockEditing: false
};

// =================== FIREBASE INITIALIZATION ======================
// Place this block right after your main appState and before any other initialization logic
let fbApp, fbDB;
(function initFirebase() {
  // Initializes Firebase when the necessary libraries and config are ready
  if (!window.FirebaseMods || !window.firebaseConfig) return setTimeout(initFirebase, 200);
  const { initializeApp, getDatabase, getAuth, signInAnonymously } = window.FirebaseMods;
  fbApp = initializeApp(window.firebaseConfig);
  fbDB  = getDatabase(fbApp);
  const auth = getAuth();
  signInAnonymously(auth).catch(e => console.warn("Firebase auth:", e));
  console.log("%c✔ Firebase initialized", "color:green");
})();
// ================================================================


// ================== SHORTCUTS ==================
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

// ================== HELPERS ==================
function generateGameCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
function pad2(n) { return n.toString().padStart(2, '0'); }
function formatTime(m, s) { return `${pad2(m)}:${pad2(s)}`; }
function toast(message, type = 'info', duration = 3000) {
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
async function copyToClipboard(text, element) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
        } else {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
        }
        toast('Game code copied!', 'success', 1500);
        if (element) {
            const originalText = element.textContent;
            element.textContent = 'Copied!';
            setTimeout(() => element.textContent = originalText, 2000);
        }
    } catch (err) {
        toast('Copy failed', 'error');
        console.error('Clipboard copy failed:', err);
    }
}

// ================== DATA MANAGEMENT ==================
function createNewGame() {
    const { getAuth } = window.FirebaseMods;
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
        toast("Authentication is initializing, please wait...", "warning");
        return null;
    }

    return {
        hostUid: user.uid,
        settings: {
            gameName: "Friendly Match",
            periodDuration: 12,
            shotClockDuration: 24,
            gameType: 'friendly',
            teamA: { name: 'Team A', color: '#FF6B35' },
            teamB: { name: 'Team B', color: '#1B263B' }
        },
        rosters: { teamA: [], teamB: [] },
        gameState: {
            period: 1,
            gameTime: { minutes: 12, seconds: 0 },
            shotClock: 24,
            possession: 'teamA',
            scoreA: 0,
            scoreB: 0,
            foulsA: 0,
            foulsB: 0,
            timeoutsA: 4,
            timeoutsB: 4,
            playerStats: {}
        }
    };
}

function saveGameState() {
    if (appState.isHost) {
        localStorage.setItem(`bball_game_${appState.gameCode}`, JSON.stringify(appState.game));
    }
}

function loadGameState(code) {
    const savedGame = localStorage.getItem(`bball_game_${code}`);
    if (savedGame) {
        appState.game = JSON.parse(savedGame);
        return true;
    }
    return false;
}

// ================== DATA BROADCASTING ==================
function broadcastUpdate() {
  // Local tab sync (for opening viewer in a new tab)
  if (appState.broadcastChannel) {
    try { appState.broadcastChannel.postMessage(appState.game); } catch(e) {}
  }
  // Global internet sync (Firebase)
  if (fbDB && appState.isHost && appState.gameCode) {
    const { ref, set } = window.FirebaseMods;
    set(ref(fbDB, `games/${appState.gameCode}`), appState.game)
      .catch(e => console.error("Firebase write error:", e));
  }
}

// ================== VIEW ROUTER ==================
function showView(view) {
  const ids = ['landing', 'config', 'setup', 'control', 'viewer'];
  ids.forEach(v => {
    const el = $(`${v}-view`);
    if (!el) return;
    el.style.display = (v === view) ? 'block' : 'none';
  });
  appState.view = view;
  window.scrollTo(0, 0);
}

// ================== UI UPDATE FUNCTIONS ==================
function updateControlDisplay() {
    if (!appState.game || appState.view !== 'control') return;
    const g = appState.game;
    const gs = g.gameState;
    const s = g.settings;

    // Header
    $('controlGameName').textContent = s.gameName;
    $('controlGameCode').textContent = appState.gameCode;

    // Scoreboard
    $('teamANameHdr').textContent = s.teamA.name;
    $('teamAScore').textContent = gs.scoreA;
    $('teamBNameHdr').textContent = s.teamB.name;
    $('teamBScore').textContent = gs.scoreB;

    // Clocks
    $('clockDisplay').textContent = formatTime(gs.gameTime.minutes, gs.gameTime.seconds);
    $('periodDisplay').textContent = gs.period;
    if (s.shotClockDuration > 0) {
        $('shotClockSection').classList.remove('hidden');
        $('shotClockDisplay').textContent = gs.shotClock;
    } else {
        $('shotClockSection').classList.add('hidden');
    }

    // Possession
    $('possessionTeamA').classList.toggle('active', gs.possession === 'teamA');
    $('possessionTeamB').classList.toggle('active', gs.possession === 'teamB');

    // Stats Section Visibility
    const statsSection = $('statsSection');
    if (s.gameType === 'full') {
        statsSection.classList.add('show');
        updatePlayerScoringGrid();
        updateComprehensiveStatsTable();
    } else {
        statsSection.classList.remove('show');
    }
}

function updateSpectatorView() {
    if (!appState.game || appState.view !== 'viewer') return;
    const g = appState.game;
    const gs = g.gameState;
    const s = g.settings;

    // Team Names and Scores
    $('viewerTeamAName').textContent = s.teamA.name;
    $('viewerTeamAScore').textContent = gs.scoreA;
    $('viewerTeamBName').textContent = s.teamB.name;
    $('viewerTeamBScore').textContent = gs.scoreB;

    // Center Info
    $('viewerClock').textContent = formatTime(gs.gameTime.minutes, gs.gameTime.seconds);
    $('viewerPeriod').textContent = gs.period;
    $('viewerShotClock').textContent = s.shotClockDuration > 0 ? gs.shotClock : '--';

    // Bottom Info
    $('viewerGameName').textContent = s.gameName;
    $('viewerPossession').textContent = `Possession: ${gs.possession === 'teamA' ? s.teamA.name : s.teamB.name}`;
}

function updatePlayerScoringGrid() { /* Placeholder for brevity */ }
function updateComprehensiveStatsTable() { /* Placeholder for brevity */ }


// ================== TIMER LOGIC ==================
function startMasterTimer() {
    stopMasterTimer();
    appState.timers.masterTimer = setInterval(() => {
        if (!appState.game) return;
        let changed = false;

        // Game Clock
        if (appState.gameRunning) {
            const time = appState.game.gameState.gameTime;
            if (time.seconds > 0) {
                time.seconds--;
                changed = true;
            } else if (time.minutes > 0) {
                time.minutes--;
                time.seconds = 59;
                changed = true;
            } else {
                appState.gameRunning = false;
                appState.shotClockRunning = false;
                toast('Period ended!', 'warning');
                playViolation();
            }
        }

        // Shot Clock
        if (appState.shotClockRunning && appState.game.settings.shotClockDuration > 0) {
            if (appState.game.gameState.shotClock > 0) {
                appState.game.gameState.shotClock--;
                changed = true;
                if (appState.game.gameState.shotClock <= 5) {
                    addShotClockWarning();
                }
            } else {
                handleShotClockViolation();
                changed = true;
            }
        }

        if (changed) {
            updateControlDisplay();
            broadcastUpdate();
            saveGameState();
        }
        updateMasterStartButton();
    }, 1000);
}

function stopMasterTimer() {
    clearInterval(appState.timers.masterTimer);
    appState.timers.masterTimer = null;
}

function handleShotClockViolation() {
    playViolation();
    toast('SHOT CLOCK VIOLATION!', 'error');
    appState.shotClockRunning = false;
    if (appState.game) {
        const currentPossession = appState.game.gameState.possession;
        appState.game.gameState.possession = currentPossession === 'teamA' ? 'teamB' : 'teamA';
        appState.game.gameState.shotClock = appState.game.settings.shotClockDuration;
        removeShotClockWarning();
        updateControlDisplay();
        broadcastUpdate();
        saveGameState();
    }
}

function addShotClockWarning() {
    $('shotClockDisplay')?.classList.add('warning');
}

function removeShotClockWarning() {
    $('shotClockDisplay')?.classList.remove('warning');
}

function updateMasterStartButton() {
  const btn = $('startGameBtn');
  if (!btn) return;
  if (appState.gameRunning || appState.shotClockRunning) {
    btn.textContent = 'PAUSE GAME';
    btn.classList.replace('resume', 'pause');
  } else {
    btn.textContent = 'START GAME';
    btn.classList.replace('pause', 'resume');
  }
}

// ================== EVENT LISTENERS ==================
document.addEventListener('DOMContentLoaded', () => {

    // =========== Landing View Controls ===========
    $('createGameBtn').addEventListener('click', () => {
        const newGame = createNewGame();
        if (newGame) {
            appState.game = newGame;
            appState.isHost = true;
            appState.gameCode = generateGameCode();
            saveGameState();
            broadcastUpdate();
            // For now, skip config and go straight to controls
            showView('control');
            updateControlDisplay();
            toast(`Game ${appState.gameCode} created!`, 'success');
        }
    });

    $('quickGameBtn').addEventListener('click', () => {
        const newGame = createNewGame();
        if (newGame) {
            appState.game = newGame;
            appState.isHost = true;
            appState.gameCode = generateGameCode();
            saveGameState();
            broadcastUpdate();
            showView('control');
            updateControlDisplay();
            toast(`Quick Game ${appState.gameCode} started!`, 'success');
        }
    });

    // =========== Control View Controls ===========
    $('startGameBtn').addEventListener('click', () => {
        if (appState.gameRunning || appState.shotClockRunning) {
            appState.gameRunning = false;
            appState.shotClockRunning = false;
            stopMasterTimer();
            toast('Game paused', 'info');
        } else {
            appState.gameRunning = true;
            if (appState.game.settings.shotClockDuration > 0) {
                appState.shotClockRunning = true;
            }
            startMasterTimer();
            toast('Game started!', 'success');
        }
        updateMasterStartButton();
        broadcastUpdate();
        saveGameState();
    });

    $('resetAllClocksBtn').addEventListener('click', () => {
        if (!appState.game) return;
        appState.game.gameState.gameTime.minutes = appState.game.settings.periodDuration;
        appState.game.gameState.gameTime.seconds = 0;
        appState.game.gameState.shotClock = appState.game.settings.shotClockDuration;
        appState.gameRunning = false;
        appState.shotClockRunning = false;
        stopMasterTimer();
        removeShotClockWarning();
        updateControlDisplay();
        updateMasterStartButton();
        broadcastUpdate();
        saveGameState();
        toast('Clocks Reset', 'info');
    });

    // Score Buttons
    const scoreControls = {
        'teamAPlus1': { team: 'A', value: 1 }, 'teamAPlus2': { team: 'A', value: 2 },
        'teamAPlus3': { team: 'A', value: 3 }, 'teamAMinus1': { team: 'A', value: -1 },
        'teamBPlus1': { team: 'B', value: 1 }, 'teamBPlus2': { team: 'B', value: 2 },
        'teamBPlus3': { team: 'B', value: 3 }, 'teamBMinus1': { team: 'B', value: -1 },
    };

    for (const [id, { team, value }] of Object.entries(scoreControls)) {
        $(id).addEventListener('click', () => {
            if (!appState.game) return;
            const scoreProp = `score${team}`;
            appState.game.gameState[scoreProp] += value;
            if (appState.game.gameState[scoreProp] < 0) appState.game.gameState[scoreProp] = 0;
            updateControlDisplay();
            broadcastUpdate();
            saveGameState();
        });
    }

    // Possession Buttons
    $('possessionTeamA').addEventListener('click', () => {
        if(appState.game) appState.game.gameState.possession = 'teamA';
        updateControlDisplay();
        broadcastUpdate();
        saveGameState();
    });
    $('possessionTeamB').addEventListener('click', () => {
        if(appState.game) appState.game.gameState.possession = 'teamB';
        updateControlDisplay();
        broadcastUpdate();
        saveGameState();
    });

    // Copy Code Buttons
    $('copyControlCode').addEventListener('click', (e) => copyToClipboard(appState.gameCode, e.target));
    $('copyConfigCode').addEventListener('click', (e) => copyToClipboard(appState.gameCode, e.target));
    $('copySetupCode').addEventListener('click', (e) => copyToClipboard(appState.gameCode, e.target));

    // Open Viewer
    $('goToViewer').addEventListener('click', () => {
        window.open(window.location.href, '_blank');
    });

    // Setup Broadcast Channel for local tab communication
    if ('BroadcastChannel' in window) {
        appState.broadcastChannel = new BroadcastChannel('bball_scoreboard');
        appState.broadcastChannel.onmessage = (event) => {
            if (!appState.isHost) { // Spectator tabs update from broadcast
                appState.game = event.data;
                updateSpectatorView();
                updateControlDisplay(); // In case a host is also a spectator in another tab
            }
        };
    }
});


// ================== SPECTATOR LISTENER/VIEW START ==============================
let fbDetach = null;
function startSpectating(code) {
  if (!fbDB) return toast?.("Connecting… please wait", "warning");
  const { ref, onValue } = window.FirebaseMods;
  // Remove any previous listener so only 1 active at a time
  if (typeof fbDetach === "function") { try { fbDetach(); } catch(e){} }

  fbDetach = onValue(ref(fbDB, `games/${code}`), snap => {
    const g = snap.val();
    if (!g) {
        toast(`Game ${code} not found or has ended.`, "error");
        if(typeof fbDetach === "function") fbDetach();
        showView('landing');
        return;
    }
    appState.game      = g;
    appState.gameCode  = code;
    appState.isHost    = false; // Ensure spectator mode
    updateSpectatorView();
    // Also update control display in case it's a host looking at their own game
    updateControlDisplay();
  }, e => {
      console.error("Firebase read error:", e);
      toast("Error connecting to game.", "error");
  });
  toast(`Watching game ${code}`, "success");
}

// Watch Game Button Event
$("watchGameBtn")?.addEventListener("click", () => {
  const code = $("watchCodeInput")?.value.trim();
  if (!code || code.length !== 6) return toast?.("Enter a valid 6-digit game code", "warning");

  // Check if this game exists in Firebase before switching view
  const { ref, get } = window.FirebaseMods;
  get(ref(fbDB, `games/${code}`)).then((snapshot) => {
    if (snapshot.exists()) {
      appState.isHost = false;
      startSpectating(code);
      showView("viewer");
    } else {
      toast("Game not found. Please check the code.", "error");
    }
  }).catch(e => {
      console.error("Firebase check error:", e);
      toast("Could not verify game code.", "error");
  });
});

// Enable watch button only when code is 6 digits
$('watchCodeInput')?.addEventListener('input', (e) => {
    const btn = $('watchGameBtn');
    if (e.target.value.length === 6) {
        btn.disabled = false;
    } else {
        btn.disabled = true;
    }
});
// ==================================================================


// =================== PDF EXPORT BUTTON FUNCTION =========================
$("exportPdfBtn")?.addEventListener("click", () => {
  if (!appState.game) return toast('No game data to export.', 'warning');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.text(`Basketball Box Score – ${appState.game.settings.gameName}`, 40, 40);
  doc.setFontSize(10);
  doc.text(`Game Code: ${appState.gameCode}`, 40, 55);

  doc.autoTable({
    html: "#statsTable",
    startY: 70,
    theme: 'grid',
    styles: { fontSize: 8, halign: "center" },
    headStyles: { fillColor: [27, 38, 59] } // Dark blue color
  });

  doc.save(`bball_stats_${appState.gameCode || "game"}.pdf`);
});
// ==================================================================

// Initial Load
showView('landing');
