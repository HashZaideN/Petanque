/**
 * ============================================================================
 * PÉTANQUE SCORE - MODULE DE PERSISTANCE & MÉMORISATION LOCALE (STORAGE)
 * Stockage persistant : LocalStorage (Survit à la fermeture du navigateur/PWA)
 * Zéro dépendance externe - Vanilla JavaScript natif pur
 * ============================================================================
 */

(() => {
  'use strict';

  const STORAGE_KEY = 'petanque_score_data_v1';

  /**
   * Vérifie si le localStorage est accessible et disponible dans l'environnement courant
   * (Gère le mode navigation privée restrictive ou le blocage de stockage)
   */
  function isStorageAvailable() {
    try {
      const testKey = '__petanque_test__';
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      console.warn('LocalStorage non disponible ou désactivé :', e);
      return false;
    }
  }

  const storageAvailable = isStorageAvailable();

  /**
   * API Publique de stockage
   */
  const PetanqueStorage = {
    KEY: STORAGE_KEY,

    /**
     * Indique si la persistance est active
     */
    isSupported() {
      return storageAvailable;
    },

    /**
     * Sauvegarde l'état complet de la partie au fur et à mesure
     * @param {Object} state - État global de l'application
     * @returns {boolean} Succès ou échec de l'enregistrement
     */
    save(state) {
      if (!storageAvailable || !state) return false;

      try {
        const payload = {
          version: 1,
          savedAt: new Date().toISOString(),
          teams: (state.teams || []).map((t, idx) => ({
            name: (t && t.name) ? String(t.name).trim() : `Équipe ${idx + 1}`,
            players: Array.isArray(t && t.players) ? t.players.map(p => String(p).trim()).filter(Boolean) : []
          })),
          scores: Array.isArray(state.scores) ? [Number(state.scores[0]) || 0, Number(state.scores[1]) || 0] : [0, 0],
          history: Array.isArray(state.history) ? state.history : [],
          isGameOver: Boolean(state.isGameOver),
          settings: {
            soundEnabled: state.settings ? Boolean(state.settings.soundEnabled) : true,
            sunlightMode: state.settings ? Boolean(state.settings.sunlightMode) : false
          }
        };

        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        return true;
      } catch (err) {
        console.error('Erreur lors de la sauvegarde dans le stockage local :', err);
        return false;
      }
    },

    /**
     * Charge l'état complet mémorisé
     * Valide et nettoie les données avant de les retourner
     * @returns {Object|null} État sauvegardé ou null si aucune donnée valide
     */
    load() {
      if (!storageAvailable) return null;

      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;

        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return null;

        // Validation minimale de structure
        if (!Array.isArray(data.teams) || data.teams.length < 2) return null;
        if (!Array.isArray(data.scores) || data.scores.length < 2) return null;

        return {
          teams: [
            {
              name: data.teams[0].name || "Équipe 1",
              players: Array.isArray(data.teams[0].players) ? data.teams[0].players : []
            },
            {
              name: data.teams[1].name || "Équipe 2",
              players: Array.isArray(data.teams[1].players) ? data.teams[1].players : []
            }
          ],
          scores: [
            Math.max(0, parseInt(data.scores[0], 10) || 0),
            Math.max(0, parseInt(data.scores[1], 10) || 0)
          ],
          history: Array.isArray(data.history) ? data.history : [],
          isGameOver: Boolean(data.isGameOver),
          settings: {
            soundEnabled: data.settings?.soundEnabled !== false,
            sunlightMode: Boolean(data.settings?.sunlightMode)
          },
          savedAt: data.savedAt || null
        };
      } catch (err) {
        console.warn('Erreur lors de la lecture des données enregistrées :', err);
        return null;
      }
    },

    /**
     * Purge complètement la mémoire locale
     * Supprime définitivement la clé de stockage
     * @returns {boolean} Succès de la purge
     */
    clear() {
      if (!storageAvailable) return false;
      try {
        window.localStorage.removeItem(STORAGE_KEY);
        return true;
      } catch (err) {
        console.error('Erreur lors de la purge de la mémoire locale :', err);
        return false;
      }
    },

    /**
     * Exporte les données de la partie dans un fichier physique .json téléchargeable
     * @param {Object} state - État global de l'application
     */
    exportToFile(state) {
      try {
        const exportData = {
          exportDate: new Date().toISOString(),
          application: "Pétanque Score",
          state: {
            teams: state.teams,
            scores: state.scores,
            history: state.history,
            isGameOver: state.isGameOver,
            meneCount: (state.history || []).length + 1
          }
        };

        const jsonStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const now = new Date();
        const dateTag = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const fileName = `partie-petanque-${dateTag}.json`;

        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
      } catch (err) {
        console.error("Erreur lors de l'export du fichier :", err);
        return false;
      }
    }
  };

  // Exposition globale sécurisée
  window.PetanqueStorage = PetanqueStorage;
})();
