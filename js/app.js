/**
 * ============================================================================
 * PÉTANQUE SCORE - LOGIQUE APPLICATIVE MOBILE PWA
 * Conforme au PRD & Directives d'architecture légère (Zéro Bloatware)
 * Stockage : LocalStorage persistant via PetanqueStorage (survit à la fermeture)
 * ============================================================================
 */

(() => {
  'use strict';

  // --------------------------------------------------------------------------
  // 1. Modèle d'état en RAM (Volatile selon PRD)
  // --------------------------------------------------------------------------
  const state = {
    teams: [
      { name: "Équipe 1", players: [] },
      { name: "Équipe 2", players: [] }
    ],
    scores: [0, 0],
    currentMenePoints: [1, 1], // Points sélectionnés pour la mène en cours pour chaque équipe (1 à 6)
    isGameOver: false,
    victoryDismissed: false, // Permet de fermer la popup de victoire sans réinitialiser la partie
    editingTeamIndex: null,
    history: [], // Pile d'actions pour le bouton Undo et l'historique des mènes
    settings: {
      soundEnabled: true,
      sunlightMode: false,
      wakeLockActive: false
    }
  };

  const WINNING_SCORE = 13;
  let wakeLockSentinel = null;
  let audioCtx = null;

  // --------------------------------------------------------------------------
  // 2. Sélecteurs DOM (Strictement conformes au PRD + Contrôles Smartphone)
  // --------------------------------------------------------------------------
  const dom = {
    // Sélecteurs PRD de base
    names: [document.getElementById('name-0'), document.getElementById('name-1')],
    players: [document.getElementById('players-0'), document.getElementById('players-1')],
    scores: [document.getElementById('score-0'), document.getElementById('score-1')],
    teamPanels: [document.getElementById('team-info-0'), document.getElementById('team-info-1')],
    btnReset: document.getElementById('btn-reset'),
    banner: document.getElementById('victory-banner'),
    winnerText: document.getElementById('winner-text'),
    btnNewGame: document.getElementById('btn-new-game'),
    dialog: document.getElementById('team-dialog'),
    form: document.getElementById('team-form'),
    inputName: document.getElementById('input-team-name'),
    inputPlayers: [
      document.getElementById('input-player-1'),
      document.getElementById('input-player-2'),
      document.getElementById('input-player-3')
    ],
    btnCancelDialog: document.getElementById('btn-cancel-dialog'),

    // Contrôles de mène par équipe
    meneVals: [document.getElementById('mene-val-0'), document.getElementById('mene-val-1')],
    meneUnits: [document.getElementById('mene-unit-0'), document.getElementById('mene-unit-1')],
    validateBtns: [document.getElementById('btn-validate-0'), document.getElementById('btn-validate-1')],
    validatePts: [document.getElementById('validate-pts-0'), document.getElementById('validate-pts-1')],
    meneIndicator: document.getElementById('mene-indicator'),

    // Éléments popup de victoire (score géant & consultation)
    victoryScoreBoard: document.getElementById('victory-score-board'),
    victoryCard0: document.getElementById('victory-card-0'),
    victoryCard1: document.getElementById('victory-card-1'),
    victoryName0: document.getElementById('victory-name-0'),
    victoryName1: document.getElementById('victory-name-1'),
    victoryPts0: document.getElementById('victory-pts-0'),
    victoryPts1: document.getElementById('victory-pts-1'),
    btnVictoryCloseX: document.getElementById('btn-victory-close-x'),
    btnViewResults: document.getElementById('btn-view-results'),

    // Éléments smartphone & ergonomie terrain
    btnSunlight: document.getElementById('btn-sunlight'),
    btnWakeLock: document.getElementById('btn-wakelock') || document.getElementById('btn-wakeLock'),
    btnSound: document.getElementById('btn-sound'),
    btnUndo: document.getElementById('btn-undo'),
    btnDialogCloseX: document.getElementById('btn-dialog-close-x'),
    meneCount: document.getElementById('mene-count'),
    scoreDiff: document.getElementById('score-diff'),
    winnerDetails: document.getElementById('winner-details'),
    confettiCanvas: document.getElementById('confetti-canvas'),
    toast: document.getElementById('toast'),

    // Modale Historique (Bouton d'en-tête & Popup)
    btnHistory: document.getElementById('btn-history'),
    historyDialog: document.getElementById('history-dialog'),
    historyList: document.getElementById('history-list'),
    historyCount: document.getElementById('history-count'),
    btnCloseHistory: document.getElementById('btn-close-history'),
    btnHistoryOk: document.getElementById('btn-history-ok'),

    // Éléments de purge & mémorisation
    btnPurge: document.getElementById('btn-purge'),
    purgeDialog: document.getElementById('purge-dialog'),
    btnCancelPurge: document.getElementById('btn-cancel-purge'),
    btnConfirmPurge: document.getElementById('btn-confirm-purge'),
    btnPurgeCloseX: document.getElementById('btn-purge-close-x'),
    btnExportFile: document.getElementById('btn-export-file')
  };

  function persistState() {
    if (window.PetanqueStorage) {
      window.PetanqueStorage.save(state);
    }
  }

  // --------------------------------------------------------------------------
  // 3. Audio & Haptique (Web Audio API natif & Vibration)
  // --------------------------------------------------------------------------
  function triggerHaptic(type = 'tap') {
    if (!state.settings.soundEnabled) return;
    if (!('vibrate' in navigator)) return;

    try {
      if (type === 'tap') {
        navigator.vibrate(25);
      } else if (type === 'minus') {
        navigator.vibrate([15, 20, 15]);
      } else if (type === 'victory') {
        navigator.vibrate([100, 50, 100, 50, 250]);
      }
    } catch (_) {
      // Ignorer si bloqué par les permissions du navigateur
    }
  }

  function playTone(type = 'point') {
    if (!state.settings.soundEnabled) return;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();

      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === 'point') {
        // Son métallique sec et claquant (type choc de boule de pétanque)
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(820, now);
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.12);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'minus') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(380, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.14);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.start(now);
        osc.stop(now + 0.14);
      } else if (type === 'victory') {
        // Arpège de victoire
        const notes = [523.25, 659.25, 783.99, 1046.50]; // Do, Mi, Sol, Do
        notes.forEach((freq, idx) => {
          const noteOsc = audioCtx.createOscillator();
          const noteGain = audioCtx.createGain();
          noteOsc.type = 'sine';
          noteOsc.frequency.setValueAtTime(freq, now + idx * 0.1);
          noteGain.gain.setValueAtTime(0.25, now + idx * 0.1);
          noteGain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.35);
          noteOsc.connect(noteGain);
          noteGain.connect(audioCtx.destination);
          noteOsc.start(now + idx * 0.1);
          noteOsc.stop(now + idx * 0.1 + 0.35);
        });
      }
    } catch (_) {
      // Ignorer si audio non pris en charge
    }
  }

  // --------------------------------------------------------------------------
  // 4. Screen Wake Lock (Écran toujours actif sur le terrain)
  // --------------------------------------------------------------------------
  async function toggleWakeLock() {
    if (!('wakeLock' in navigator)) {
      showToast("Wake Lock non supporté sur ce navigateur");
      return;
    }

    try {
      if (state.settings.wakeLockActive && wakeLockSentinel) {
        await wakeLockSentinel.release();
        wakeLockSentinel = null;
        state.settings.wakeLockActive = false;
        dom.btnWakeLock.classList.remove('active');
        showToast("Écran : veille normale");
      } else {
        wakeLockSentinel = await navigator.wakeLock.request('screen');
        state.settings.wakeLockActive = true;
        dom.btnWakeLock.classList.add('active');
        showToast("Écran maintenu allumé 💡");

        wakeLockSentinel.addEventListener('release', () => {
          if (state.settings.wakeLockActive) {
            state.settings.wakeLockActive = false;
            dom.btnWakeLock.classList.remove('active');
          }
        });
      }
    } catch (err) {
      console.warn("Erreur Wake Lock:", err);
      showToast("Impossible d'activer le maintien de l'écran");
    }
  }

  // Réactivation automatique du WakeLock quand l'application revient au premier plan
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && state.settings.wakeLockActive) {
      try {
        wakeLockSentinel = await navigator.wakeLock.request('screen');
      } catch (_) {}
    }
  });

  // --------------------------------------------------------------------------
  // 5. Toast d'information
  // --------------------------------------------------------------------------
  let toastTimeout = null;
  function showToast(message) {
    if (!dom.toast) return;
    dom.toast.textContent = message;
    dom.toast.classList.remove('hidden');

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      dom.toast.classList.add('hidden');
    }, 2200);
  }

  // --------------------------------------------------------------------------
  // 6. Confettis visuels natifs (Canvas 2D léger)
  // --------------------------------------------------------------------------
  let confettiAnimId = null;
  function launchConfetti() {
    const canvas = dom.confettiCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = (canvas.width = window.innerWidth);
    const height = (canvas.height = window.innerHeight);

    const particles = [];
    const colors = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#ec4899', '#ffffff'];

    for (let i = 0; i < 90; i++) {
      particles.push({
        x: width / 2,
        y: height / 2,
        vx: (Math.random() - 0.5) * 14,
        vy: (Math.random() - 0.7) * 16,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        vr: (Math.random() - 0.5) * 10,
        gravity: 0.28,
        alpha: 1
      });
    }

    let start = performance.now();
    function animate(t) {
      const elapsed = t - start;
      ctx.clearRect(0, 0, width, height);

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.rotation += p.vr;
        p.alpha = Math.max(0, 1 - elapsed / 2500);

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      });

      if (elapsed < 2500) {
        confettiAnimId = requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, width, height);
      }
    }

    if (confettiAnimId) cancelAnimationFrame(confettiAnimId);
    confettiAnimId = requestAnimationFrame(animate);
  }

  // --------------------------------------------------------------------------
  // 7. Moteur de Rendu Synchronisé avec le State
  // --------------------------------------------------------------------------
  function renderMeneInputs() {
    [0, 1].forEach((idx) => {
      const remaining = WINNING_SCORE - state.scores[idx];
      const maxPts = Math.max(1, Math.min(6, remaining));

      if (!state.currentMenePoints[idx] || state.currentMenePoints[idx] < 1) {
        state.currentMenePoints[idx] = 1;
      }
      if (state.currentMenePoints[idx] > maxPts) {
        state.currentMenePoints[idx] = maxPts;
      }

      const pts = state.currentMenePoints[idx];

      if (dom.meneVals[idx]) {
        dom.meneVals[idx].textContent = pts;
      }
      if (dom.meneUnits[idx]) {
        dom.meneUnits[idx].textContent = pts > 1 ? 'pts' : 'pt';
      }
      if (dom.validatePts[idx]) {
        dom.validatePts[idx].textContent = `+${pts} ${pts > 1 ? 'pts' : 'pt'}`;
      }
      if (dom.validateBtns[idx]) {
        dom.validateBtns[idx].disabled = state.isGameOver || remaining <= 0;
      }

      const panel = dom.teamPanels[idx] ? dom.teamPanels[idx].closest('.team-panel') : null;
      if (panel) {
        const btnMinus = panel.querySelector('.btn-mene-minus');
        const btnPlus = panel.querySelector('.btn-mene-plus');
        if (btnMinus) btnMinus.disabled = state.isGameOver || pts <= 1;
        if (btnPlus) btnPlus.disabled = state.isGameOver || pts >= maxPts;
      }
    });
  }

  function render() {
    // Noms, joueurs et scores totaux
    state.teams.forEach((team, idx) => {
      dom.names[idx].textContent = team.name;

      const activePlayers = team.players.filter((p) => p.trim() !== '');
      dom.players[idx].textContent =
        activePlayers.length > 0
          ? activePlayers.join(' • ')
          : 'Touchez pour ajouter des joueurs';

      dom.scores[idx].textContent = state.scores[idx];
    });

    // Rendu des contrôles de mène
    renderMeneInputs();

    // Indicateurs de mènes et différence
    const diff = state.scores[0] - state.scores[1];
    if (dom.meneCount) {
      dom.meneCount.textContent = state.isGameOver
        ? state.history.length
        : state.history.length + 1;
    }

    if (dom.scoreDiff) {
      if (state.isGameOver) {
        const winnerIdx = state.scores[0] === WINNING_SCORE ? 0 : 1;
        dom.scoreDiff.textContent = `🏆 Victoire ${state.teams[winnerIdx].name} (${state.scores[0]} - ${state.scores[1]}) • Revoir`;
        dom.scoreDiff.style.color = "#4ade80";
        dom.scoreDiff.style.cursor = "pointer";
      } else if (diff === 0) {
        dom.scoreDiff.textContent = "Égalité";
        dom.scoreDiff.style.color = "#94a3b8";
        dom.scoreDiff.style.cursor = "default";
      } else if (diff > 0) {
        dom.scoreDiff.textContent = `+${diff} pour ${state.teams[0].name}`;
        dom.scoreDiff.style.color = "var(--team-a-accent)";
        dom.scoreDiff.style.cursor = "default";
      } else {
        dom.scoreDiff.textContent = `+${Math.abs(diff)} pour ${state.teams[1].name}`;
        dom.scoreDiff.style.color = "var(--team-b-accent)";
        dom.scoreDiff.style.cursor = "default";
      }
    }

    // Gestion de l'Undo
    if (dom.btnUndo) {
      dom.btnUndo.disabled = state.history.length === 0;
    }

    // Mise à jour du tiroir d'historique
    if (dom.historyCount) {
      dom.historyCount.textContent = state.history.length;
    }
    renderHistoryList();

    // Affichage de la victoire si match terminé (13 points)
    if (state.isGameOver) {
      const winnerIdx = state.scores[0] === WINNING_SCORE ? 0 : 1;
      const loserIdx = winnerIdx === 0 ? 1 : 0;
      const winnerName = state.teams[winnerIdx].name;
      const loserScore = state.scores[loserIdx];

      dom.winnerText.textContent = `${winnerName} remporte la partie !`;

      // Grand affichage du score demandé par l'utilisateur
      if (dom.victoryName0 && dom.victoryPts0 && dom.victoryName1 && dom.victoryPts1) {
        dom.victoryName0.textContent = state.teams[0].name;
        dom.victoryPts0.textContent = state.scores[0];
        dom.victoryName1.textContent = state.teams[1].name;
        dom.victoryPts1.textContent = state.scores[1];

        if (dom.victoryCard0) dom.victoryCard0.classList.toggle('winner', winnerIdx === 0);
        if (dom.victoryCard1) dom.victoryCard1.classList.toggle('winner', winnerIdx === 1);
      }

      if (dom.winnerDetails) {
        if (loserScore === 0) {
          dom.winnerDetails.textContent = `🥖 Fanny ! Score : 13 à 0 en ${state.history.length} mène${state.history.length > 1 ? 's' : ''}`;
        } else {
          dom.winnerDetails.textContent = `Score final : 13 - ${loserScore} en ${state.history.length} mène${state.history.length > 1 ? 's' : ''}`;
        }
      }

      // Si la popup de victoire n'a pas été fermée par l'utilisateur, l'afficher
      if (!state.victoryDismissed) {
        dom.banner.classList.remove('hidden');
        launchConfetti();
      } else {
        dom.banner.classList.add('hidden');
        if (confettiAnimId) cancelAnimationFrame(confettiAnimId);
      }
    } else {
      dom.banner.classList.add('hidden');
      if (confettiAnimId) cancelAnimationFrame(confettiAnimId);
    }
  }

  function renderHistoryList() {
    if (!dom.historyList) return;
    if (state.history.length === 0) {
      dom.historyList.innerHTML = `<li class="history-empty">Aucun point marqué pour l'instant.</li>`;
      return;
    }

    dom.historyList.innerHTML = state.history
      .map((entry, index) => {
        const teamName = state.teams[entry.teamIdx].name;
        const pts = entry.points || (entry.action === 'decrement' ? -1 : 1);
        const sign = pts > 0 ? `+${pts}` : `${pts}`;
        const ptsLabel = Math.abs(pts) > 1 ? 'pts' : 'pt';
        return `
          <li class="history-item team-${entry.teamIdx}">
            <span><strong>Mène ${entry.meneNum || index + 1}</strong> : ${teamName} (${sign} ${ptsLabel})</span>
            <span style="font-family: var(--font-mono); font-weight: bold;">${entry.snapshot[0]} - ${entry.snapshot[1]}</span>
          </li>
        `;
      })
      .reverse()
      .join('');
  }

  // --------------------------------------------------------------------------
  // 8. Moteur de Règles & Actions de Jeu (Gestion par Mène)
  // --------------------------------------------------------------------------
  function triggerScoreBounce(teamIndex) {
    const el = dom.scores[teamIndex];
    if (!el) return;
    el.classList.remove('pulse');
    void el.offsetWidth; // Forcer le reflow
    el.classList.add('pulse');
    setTimeout(() => el.classList.remove('pulse'), 160);
  }

  function changeMenePoints(teamIndex, delta) {
    if (state.isGameOver) return;
    const remaining = WINNING_SCORE - state.scores[teamIndex];
    if (remaining <= 0) return;

    const maxPts = Math.min(6, remaining);
    let pts = state.currentMenePoints[teamIndex] || 1;
    pts += delta;
    if (pts < 1) pts = 1;
    if (pts > maxPts) pts = maxPts;

    state.currentMenePoints[teamIndex] = pts;
    triggerHaptic('tap');
    renderMeneInputs();
  }

  function validateMene(teamIndex) {
    if (state.isGameOver) return;
    const pts = state.currentMenePoints[teamIndex] || 1;
    if (pts <= 0) return;

    const prevScores = [...state.scores];
    const prevGameOver = state.isGameOver;
    const newScore = Math.min(WINNING_SCORE, state.scores[teamIndex] + pts);
    const added = newScore - state.scores[teamIndex];
    if (added <= 0) return;

    const newScores = [
      teamIndex === 0 ? newScore : state.scores[0],
      teamIndex === 1 ? newScore : state.scores[1]
    ];

    state.history.push({
      action: 'mene',
      teamIdx: teamIndex,
      points: added,
      meneNum: state.history.length + 1,
      prevScores: prevScores,
      prevGameOver: prevGameOver,
      snapshot: newScores
    });

    state.scores[teamIndex] = newScore;
    triggerScoreBounce(teamIndex);

    // Réinitialisation des points de la mène suivante à 1
    state.currentMenePoints = [1, 1];

    if (state.scores[teamIndex] === WINNING_SCORE) {
      state.isGameOver = true;
      state.victoryDismissed = false; // Afficher la popup de victoire
      triggerHaptic('victory');
      playTone('victory');
    } else {
      triggerHaptic('tap');
      playTone('point');
      showToast(`Mène ${state.history.length} : +${added} pt${added > 1 ? 's' : ''} pour ${state.teams[teamIndex].name}`);
    }

    render();
    persistState();
  }

  function undoLastAction() {
    if (state.history.length === 0) return;

    const last = state.history.pop();
    state.scores = last.prevScores ? [...last.prevScores] : [...last.snapshot];
    state.isGameOver = last.prevGameOver || false;
    state.victoryDismissed = false;

    triggerHaptic('tap');
    showToast(`Mène ${last.meneNum || state.history.length + 1} annulée ↩️`);
    render();
    persistState();
  }

  function resetGame(keepTeams = true) {
    state.scores = [0, 0];
    state.isGameOver = false;
    state.victoryDismissed = false;
    state.currentMenePoints = [1, 1];
    state.history = [];

    if (!keepTeams) {
      state.teams = [
        { name: "Équipe 1", players: [] },
        { name: "Équipe 2", players: [] }
      ];
    }

    triggerHaptic('tap');
    showToast("Partie réinitialisée à 0 - 0");
    render();
    persistState();
  }

  function closeVictoryBanner() {
    state.victoryDismissed = true;
    if (dom.banner) {
      dom.banner.classList.add('hidden');
    }
    if (confettiAnimId) {
      cancelAnimationFrame(confettiAnimId);
    }
  }

  function reopenVictoryBanner() {
    if (state.isGameOver && dom.banner) {
      state.victoryDismissed = false;
      dom.banner.classList.remove('hidden');
      launchConfetti();
    }
  }

  // --------------------------------------------------------------------------
  // 8 bis. Gestion de la Purge Complète de la Mémoire
  // --------------------------------------------------------------------------
  function openPurgeModal() {
    if (dom.purgeDialog && typeof dom.purgeDialog.showModal === 'function') {
      dom.purgeDialog.showModal();
    } else if (confirm("Purger complètement la mémoire ?\n\nToutes les informations (scores, équipes, joueurs, historique) seront définitivement effacées.")) {
      confirmPurge();
    }
  }

  function closePurgeModal() {
    if (dom.purgeDialog && typeof dom.purgeDialog.close === 'function') {
      dom.purgeDialog.close();
    }
  }

  function confirmPurge() {
    closePurgeModal();

    if (window.PetanqueStorage) {
      window.PetanqueStorage.clear();
    }

    state.teams = [
      { name: "Équipe 1", players: [] },
      { name: "Équipe 2", players: [] }
    ];
    state.scores = [0, 0];
    state.isGameOver = false;
    state.history = [];

    triggerHaptic('minus');
    playTone('minus');
    showToast("Mémoire entièrement purgée 🗑️");
    render();
  }

  // --------------------------------------------------------------------------
  // 8 ter. Gestion de la Modale Popup d'Historique des Mènes
  // --------------------------------------------------------------------------
  function openHistoryModal() {
    renderHistoryList();
    if (dom.historyCount) {
      dom.historyCount.textContent = state.history.length;
    }
    if (dom.historyDialog && typeof dom.historyDialog.showModal === 'function') {
      dom.historyDialog.showModal();
    } else if (dom.historyDialog) {
      dom.historyDialog.setAttribute('open', '');
    }
  }

  function closeHistoryModal() {
    if (dom.historyDialog && typeof dom.historyDialog.close === 'function') {
      dom.historyDialog.close();
    } else if (dom.historyDialog) {
      dom.historyDialog.removeAttribute('open');
    }
  }

  // --------------------------------------------------------------------------
  // 9. Gestion de la Modale d'Édition d'Équipe
  // --------------------------------------------------------------------------
  function openTeamModal(teamIndex) {
    state.editingTeamIndex = teamIndex;
    const team = state.teams[teamIndex];

    const titleEl = document.getElementById('dialog-team-title');
    if (titleEl) {
      titleEl.textContent = `Modifier l'Équipe ${teamIndex === 0 ? 'A (Bleu)' : 'B (Rouge)'}`;
    }

    dom.inputName.value = team.name;
    dom.inputPlayers.forEach((input, i) => {
      input.value = team.players[i] || '';
    });

    if (typeof dom.dialog.showModal === 'function') {
      dom.dialog.showModal();
    } else {
      dom.dialog.setAttribute('open', '');
    }
  }

  function closeTeamModal() {
    if (typeof dom.dialog.close === 'function') {
      dom.dialog.close();
    } else {
      dom.dialog.removeAttribute('open');
    }
    state.editingTeamIndex = null;
  }

  // --------------------------------------------------------------------------
  // 10. Écouteurs d'Événements & Interactions Tactiles
  // --------------------------------------------------------------------------
  // Clics délégués sur les boutons de score et de mène
  document.addEventListener('click', (e) => {
    const target = e.target.closest('button');
    if (!target) return;

    const action = target.dataset.action;
    const teamIdx = parseInt(target.dataset.team, 10);

    if (action === 'mene-plus') {
      changeMenePoints(teamIdx, 1);
    } else if (action === 'mene-minus') {
      changeMenePoints(teamIdx, -1);
    } else if (action === 'validate-mene') {
      validateMene(teamIdx);
    }
  });

  // Ouverture modale d'édition d'équipe
  dom.teamPanels.forEach((panel, idx) => {
    panel.addEventListener('click', () => openTeamModal(idx));
    panel.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openTeamModal(idx);
      }
    });
  });

  // Soumission formulaire d'équipe
  dom.form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.editingTeamIndex === null) return;

    const trimmedName = dom.inputName.value.trim();
    state.teams[state.editingTeamIndex].name =
      trimmedName || `Équipe ${state.editingTeamIndex + 1}`;

    state.teams[state.editingTeamIndex].players = dom.inputPlayers
      .map((input) => input.value.trim())
      .filter((name) => name.length > 0);

    closeTeamModal();
    render();
    persistState();
    showToast("Équipe mise à jour ✔");
  });

  // Fermetures modale
  dom.btnCancelDialog.addEventListener('click', closeTeamModal);
  if (dom.btnDialogCloseX) {
    dom.btnDialogCloseX.addEventListener('click', closeTeamModal);
  }

  // Événements de purge complète
  if (dom.btnPurge) {
    dom.btnPurge.addEventListener('click', openPurgeModal);
  }
  if (dom.btnCancelPurge) {
    dom.btnCancelPurge.addEventListener('click', closePurgeModal);
  }
  if (dom.btnConfirmPurge) {
    dom.btnConfirmPurge.addEventListener('click', confirmPurge);
  }
  if (dom.btnPurgeCloseX) {
    dom.btnPurgeCloseX.addEventListener('click', closePurgeModal);
  }

  // Événements de la popup de victoire (consultation des résultats & fermeture sans reset)
  if (dom.btnViewResults) {
    dom.btnViewResults.addEventListener('click', () => {
      closeVictoryBanner();
      openHistoryModal();
      showToast("Scores conservés 📜 Mènes consultables");
    });
  }

  if (dom.btnVictoryCloseX) {
    dom.btnVictoryCloseX.addEventListener('click', () => {
      closeVictoryBanner();
      showToast("Scores conservés 📜");
    });
  }

  // Clic sur l'indicateur de mène pour revoir le podium de victoire si le match est fini
  if (dom.meneIndicator) {
    dom.meneIndicator.addEventListener('click', () => {
      if (state.isGameOver) {
        reopenVictoryBanner();
      }
    });
  }

  // Export fichier JSON
  if (dom.btnExportFile) {
    dom.btnExportFile.addEventListener('click', () => {
      if (window.PetanqueStorage) {
        const success = window.PetanqueStorage.exportToFile(state);
        if (success) {
          showToast("Partie enregistrée dans un fichier 💾");
        } else {
          showToast("Erreur lors de l'export du fichier");
        }
      }
    });
  }

  // Bouton Réinitialiser (Nouvelle manche rapide)
  dom.btnReset.addEventListener('click', () => {
    if (confirm("Réinitialiser le score à 0 - 0 ?")) {
      resetGame(true);
    }
  });

  // Bouton Revanche (Nouvelle partie avec confirmation pour éviter la perte accidentelle de données)
  if (dom.btnNewGame) {
    dom.btnNewGame.addEventListener('click', () => {
      if (confirm("Démarrer une nouvelle partie (remise à 0 - 0) ?\n\nLes équipes seront conservées mais les scores repartiront à zéro.")) {
        resetGame(true);
      }
    });
  }

  // Bouton Undo (Annule la dernière mène complète)
  if (dom.btnUndo) {
    dom.btnUndo.addEventListener('click', undoLastAction);
  }

  // Bouton Mode Plein Soleil
  if (dom.btnSunlight) {
    dom.btnSunlight.addEventListener('click', () => {
      state.settings.sunlightMode = !state.settings.sunlightMode;
      document.body.classList.toggle('sunlight-mode', state.settings.sunlightMode);
      dom.btnSunlight.classList.toggle('active', state.settings.sunlightMode);
      persistState();
      showToast(state.settings.sunlightMode ? "Mode Plein Soleil activé ☀️" : "Mode Sombre activé 🌙");
    });
  }

  // Bouton Garder l'écran allumé (Wake Lock)
  if (dom.btnWakeLock) {
    dom.btnWakeLock.addEventListener('click', toggleWakeLock);
  }

  // Bouton Son & Vibrations
  if (dom.btnSound) {
    dom.btnSound.addEventListener('click', () => {
      state.settings.soundEnabled = !state.settings.soundEnabled;
      dom.btnSound.classList.toggle('active', state.settings.soundEnabled);
      dom.btnSound.textContent = state.settings.soundEnabled ? '🔊' : '🔇';
      persistState();
      showToast(state.settings.soundEnabled ? "Sons et vibrations activés 🔊" : "Mode silencieux 🔇");
    });
  }

  // Modale Popup d'Historique des Mènes (Bouton d'en-tête 📜)
  if (dom.btnHistory) {
    dom.btnHistory.addEventListener('click', openHistoryModal);
  }

  if (dom.btnCloseHistory) {
    dom.btnCloseHistory.addEventListener('click', closeHistoryModal);
  }

  if (dom.btnHistoryOk) {
    dom.btnHistoryOk.addEventListener('click', closeHistoryModal);
  }

  if (dom.historyDialog) {
    dom.historyDialog.addEventListener('click', (e) => {
      if (e.target === dom.historyDialog) {
        closeHistoryModal();
      }
    });
  }

  // --------------------------------------------------------------------------
  // 11. Enregistrement du Service Worker (PWA Offline)
  // --------------------------------------------------------------------------
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then(
        (reg) => console.log('ServiceWorker actif avec succès:', reg.scope),
        (err) => console.warn('Erreur enregistrement ServiceWorker:', err)
      );
    });
  }

  // Restauration de l'état mémorisé si disponible
  if (window.PetanqueStorage) {
    const saved = window.PetanqueStorage.load();
    if (saved) {
      state.teams = saved.teams;
      state.scores = saved.scores;
      state.history = saved.history;
      state.isGameOver = saved.isGameOver;
      if (state.isGameOver) {
        state.victoryDismissed = true;
      }

      if (saved.settings) {
        state.settings.soundEnabled = saved.settings.soundEnabled;
        state.settings.sunlightMode = saved.settings.sunlightMode;

        if (dom.btnSound) {
          dom.btnSound.classList.toggle('active', state.settings.soundEnabled);
          dom.btnSound.textContent = state.settings.soundEnabled ? '🔊' : '🔇';
        }
        if (dom.btnSunlight) {
          document.body.classList.toggle('sunlight-mode', state.settings.sunlightMode);
          dom.btnSunlight.classList.toggle('active', state.settings.sunlightMode);
        }
      }
    }
  }

  // Premier rendu à l'initialisation
  render();
})();
