import { create } from 'zustand';

// The spec's five bottom tabs (Home, Planets, Chat, Flashcards, Audio).
// 'lessons'/'profile' stay valid internally: Lessons is folded into each
// planet's block list, and Profile is reached from the Home avatar.
export type TabKey = 'home' | 'planets' | 'chat' | 'flashcards' | 'audio' | 'lessons' | 'profile';

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

  /** Chapter-intro interstitial shown before a lesson starts (Começar a Primeira Lição). */
  lessonIntro: { planetId: string; lessonId: string } | null;
  beginLesson: (planetId: string, lessonId: string) => void;
  confirmLessonIntro: () => void;
  cancelLessonIntro: () => void;

  /** Flashcards: the current deck id (null = deck list). */
  activeDeckId: string | null;
  openDeck: (id: string) => void;
  closeDeck: () => void;
  /** Switches to the Flashcards tab with a module's pending review deck open —
   * where "Start review" should land when a module is only waiting on its
   * cards, instead of starting another chat lesson. */
  reviewModule: (lessonId: string) => void;

  /** Transient banner when a planet unlocks (set by whoever bumps mastery). */
  unlockNotice: string | null;
  setUnlockNotice: (message: string | null) => void;
  clearUnlockNotice: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  activeTab: 'home',
  setTab: (tab) => set({ activeTab: tab }),

  selectedPlanetId: null,
  openPlanet: (id) => set({ selectedPlanetId: id }),
  closePlanet: () => set({ selectedPlanetId: null }),

  lessonPlanetId: null,
  startLesson: (id) => set({ lessonPlanetId: id, activeTab: 'chat' }),

  lessonIntro: null,
  beginLesson: (planetId, lessonId) => set({ lessonIntro: { planetId, lessonId } }),
  confirmLessonIntro: () =>
    set((s) => (s.lessonIntro ? { lessonPlanetId: s.lessonIntro.planetId, activeTab: 'chat', lessonIntro: null } : {})),
  cancelLessonIntro: () => set({ lessonIntro: null }),

  activeDeckId: null,
  openDeck: (id) => set({ activeDeckId: id }),
  closeDeck: () => set({ activeDeckId: null }),
  reviewModule: (lessonId) => set({ activeTab: 'flashcards', activeDeckId: lessonId }),

  unlockNotice: null,
  setUnlockNotice: (message) => set({ unlockNotice: message }),
  clearUnlockNotice: () => set({ unlockNotice: null }),
}));
