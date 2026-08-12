import { useUiStore } from './ui';

/** Fresh store per test — the module-level zustand store persists state across tests. */
const resetStore = () =>
  useUiStore.setState({
    activeTab: 'planets',
    selectedPlanetId: null,
    lessonPlanetId: null,
    lessonIntro: null,
    activeDeckId: null,
    unlockNotice: null,
  });

beforeEach(resetStore);

describe('ui store — tabs', () => {
  it('starts on the planets tab', () => {
    expect(useUiStore.getState().activeTab).toBe('planets');
  });

  it('switches tabs', () => {
    useUiStore.getState().setTab('chat');
    expect(useUiStore.getState().activeTab).toBe('chat');
    useUiStore.getState().setTab('flashcards');
    expect(useUiStore.getState().activeTab).toBe('flashcards');
  });
});

describe('ui store — planet selection', () => {
  it('opens and closes a planet detail', () => {
    useUiStore.getState().openPlanet('p1');
    expect(useUiStore.getState().selectedPlanetId).toBe('p1');
    useUiStore.getState().closePlanet();
    expect(useUiStore.getState().selectedPlanetId).toBeNull();
  });
});

describe('ui store — lesson flow', () => {
  it('startLesson jumps to the chat tab with the planet loaded', () => {
    useUiStore.getState().startLesson('p2');
    expect(useUiStore.getState().lessonPlanetId).toBe('p2');
    expect(useUiStore.getState().activeTab).toBe('chat');
  });

  it('beginLesson shows the intro interstitial without switching tabs', () => {
    useUiStore.getState().beginLesson('p3', 'lesson-9');
    expect(useUiStore.getState().lessonIntro).toEqual({ planetId: 'p3', lessonId: 'lesson-9' });
    expect(useUiStore.getState().activeTab).toBe('planets');
  });

  it('confirmLessonIntro starts the lesson from the intro', () => {
    useUiStore.getState().beginLesson('p3', 'lesson-9');
    useUiStore.getState().confirmLessonIntro();
    expect(useUiStore.getState().lessonIntro).toBeNull();
    expect(useUiStore.getState().lessonPlanetId).toBe('p3');
    expect(useUiStore.getState().activeTab).toBe('chat');
  });

  it('cancelLessonIntro drops the intro without starting anything', () => {
    useUiStore.getState().beginLesson('p3', 'lesson-9');
    useUiStore.getState().cancelLessonIntro();
    expect(useUiStore.getState().lessonIntro).toBeNull();
    expect(useUiStore.getState().lessonPlanetId).toBeNull();
    expect(useUiStore.getState().activeTab).toBe('planets');
  });

  it('confirmLessonIntro is a no-op without a pending intro', () => {
    useUiStore.getState().confirmLessonIntro();
    expect(useUiStore.getState().lessonIntro).toBeNull();
    expect(useUiStore.getState().lessonPlanetId).toBeNull();
    expect(useUiStore.getState().activeTab).toBe('planets');
  });
});

describe('ui store — decks', () => {
  it('opens and closes a deck', () => {
    useUiStore.getState().openDeck('deck-1');
    expect(useUiStore.getState().activeDeckId).toBe('deck-1');
    useUiStore.getState().closeDeck();
    expect(useUiStore.getState().activeDeckId).toBeNull();
  });
});

describe('ui store — unlock notice', () => {
  it('sets and clears the unlock banner', () => {
    useUiStore.getState().setUnlockNotice('Planet 2 unlocked!');
    expect(useUiStore.getState().unlockNotice).toBe('Planet 2 unlocked!');
    useUiStore.getState().clearUnlockNotice();
    expect(useUiStore.getState().unlockNotice).toBeNull();
    useUiStore.getState().setUnlockNotice('x');
    useUiStore.getState().setUnlockNotice(null);
    expect(useUiStore.getState().unlockNotice).toBeNull();
  });
});
