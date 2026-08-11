import { create } from 'zustand';

export type TabKey = 'chat' | 'flashcards' | 'planets';

/**
 * Pure UI state. All learning data (planets, lessons, flashcards, reviews,
 * progress, conversations) is served from the backend — nothing is persisted
 * here anymore.
 */
type UiState = {
  activeTab: TabKey;
  setTab: (tab: TabKey) => void;

  /** Planets: the selected planet detail (null = map overview). */
  selectedPlanetId: string | null;
  openPlanet: (id: string) => void;
  closePlanet: () => void;

  /** Planets: the planet whose lesson Chat should load ("Continue lesson"). */
  lessonPlanetId: string | null;
  /** Switches to Chat with the chosen planet's lesson ready to play. */
  startLesson: (id: string) => void;

  /** Flashcards: the current deck id (null = deck list). */
  activeDeckId: string | null;
  openDeck: (id: string) => void;
  closeDeck: () => void;

  /** Transient banner when a planet unlocks (set by whoever bumps mastery). */
  unlockNotice: string | null;
  setUnlockNotice: (message: string | null) => void;
  clearUnlockNotice: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  activeTab: 'planets',
  setTab: (tab) => set({ activeTab: tab }),

  selectedPlanetId: null,
  openPlanet: (id) => set({ selectedPlanetId: id }),
  closePlanet: () => set({ selectedPlanetId: null }),

  lessonPlanetId: null,
  startLesson: (id) => set({ lessonPlanetId: id, activeTab: 'chat' }),

  activeDeckId: null,
  openDeck: (id) => set({ activeDeckId: id }),
  closeDeck: () => set({ activeDeckId: null }),

  unlockNotice: null,
  setUnlockNotice: (message) => set({ unlockNotice: message }),
  clearUnlockNotice: () => set({ unlockNotice: null }),
}));
