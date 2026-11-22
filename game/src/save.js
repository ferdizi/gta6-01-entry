// Laguna Azul — localStorage save and load. One job: persist progression
// (cash, mission progress, health, position) between sessions, nothing else.
const SAVE_KEY = 'laguna-azul-save-v1';

export function saveGame(state) {
  try {
    const payload = {
      version: 1,
      savedAt: Date.now(),
      cash: state.cash,
      missionIndex: state.missionIndex,
      missionsDone: state.missionsDone,
      health: state.health,
      ammo: state.ammo,
      totalEarned: state.totalEarned,
      bestSpeed: state.bestSpeed,
      playerX: state.playerX,
      playerZ: state.playerZ,
      playerHeading: state.playerHeading,
      inCar: state.inCar,
      carColor: state.carColor,
      timeOfDay: state.timeOfDay,
      muted: state.muted,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    return true;
  } catch (error) {
    console.warn('[save] could not write save:', error);
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch (error) {
    console.warn('[save] could not read save:', error);
    return null;
  }
}

export function hasSave() {
  try {
    return window.localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // storage unavailable; nothing to clear
  }
}
