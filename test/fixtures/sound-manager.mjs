const categories = [
  "combat",
  "spell",
  "skill",
  "potion",
  "quest",
  "celebration",
  "discussion",
  "alert",
  "ambient",
  "fishing",
  "ui",
  "music",
];

export function createSoundManagerStub() {
  const listeners = new Set();
  const calls = [];
  const settings = {
    enabled: true,
    volume: 0.7,
    audioUnlocked: true,
    pendingCount: 0,
    categoryEnabled: Object.fromEntries(categories.map((category) => [category, true])),
  };
  let resetCount = 0;
  const emit = () => {
    for (const listener of [...listeners]) listener();
  };

  return {
    calls,
    get resetCount() {
      return resetCount;
    },
    getSettings: () => ({ ...settings, categoryEnabled: { ...settings.categoryEnabled } }),
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async unlockFromUserGesture() {
      settings.audioUnlocked = true;
      emit();
      return true;
    },
    setEnabled(enabled) {
      settings.enabled = !!enabled;
      emit();
    },
    setVolume(volume) {
      settings.volume = volume;
      emit();
    },
    setCategoryEnabled(category, enabled) {
      settings.categoryEnabled[category] = !!enabled;
      emit();
    },
    play(category, sound, volume) {
      calls.push(["play", category, sound, volume]);
    },
    loop(category, sound, id, volume) {
      calls.push(["loop", category, sound, id, volume]);
    },
    stop(category, id) {
      calls.push(["stop", category, id]);
    },
    handleMessage(message) {
      if (message.type === "play") this.play(message.category, message.sound, message.volume);
      else if (message.type === "loop")
        this.loop(message.category, message.sound, message.id, message.volume);
      else this.stop(message.category, message.id);
      return true;
    },
    resetSessionPlayback() {
      resetCount += 1;
      settings.pendingCount = 0;
      emit();
    },
  };
}
