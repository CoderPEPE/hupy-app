import {
  currentPlanet,
  isBlockDone,
  isPlanetFinished,
  nextBlock,
  type BlockState,
  type PlanetLesson,
  type PlanetStatus,
} from '../types';

const block = (position: number, state: BlockState): PlanetLesson => ({
  id: `b${position}`,
  position,
  kind: 'context',
  title: `Block ${position}`,
  description: '',
  state,
  skill: 'conversation',
  focus: 'focus:have',
  structures: [],
  flashcards_total: 0,
  flashcards_reviewed: 0,
});

describe('isPlanetFinished', () => {
  it('is true only for the two states behind the learner', () => {
    const finished: PlanetStatus[] = ['conquered', 'mastered'];
    const open: PlanetStatus[] = ['locked', 'available', 'in_progress', 'review'];
    finished.forEach((s) => expect(isPlanetFinished(s)).toBe(true));
    open.forEach((s) => expect(isPlanetFinished(s)).toBe(false));
  });

  /// A planet with a pending review is explicitly *not* finished — that is the
  /// whole point of the state (spec §5: a short review, not a new planet).
  it('does not treat a pending review as finished', () => {
    expect(isPlanetFinished('review')).toBe(false);
  });
});

describe('currentPlanet', () => {
  const p = (id: string, status: PlanetStatus) => ({ id, status });

  it('picks the first planet that is neither finished nor locked', () => {
    const planets = [p('a', 'conquered'), p('b', 'mastered'), p('c', 'in_progress'), p('d', 'locked')];
    expect(currentPlanet(planets)?.id).toBe('c');
  });

  it('sends the learner back to a planet owing a review before a fresh one', () => {
    const planets = [p('a', 'conquered'), p('b', 'review'), p('c', 'available')];
    expect(currentPlanet(planets)?.id).toBe('b');
  });

  it('falls back to the first planet when everything is conquered', () => {
    const planets = [p('a', 'conquered'), p('b', 'mastered')];
    expect(currentPlanet(planets)?.id).toBe('a');
  });

  it('handles an empty course', () => {
    expect(currentPlanet([])).toBeUndefined();
  });
});

describe('isBlockDone', () => {
  it('counts only a module with both halves finished', () => {
    expect(isBlockDone('completed')).toBe(true);
  });

  /// The whole point of the gate: the conversation alone is not the module.
  it('does not count a module still owing its flashcards', () => {
    expect(isBlockDone('flashcards_pending')).toBe(false);
    expect(isBlockDone('locked')).toBe(false);
    expect(isBlockDone('current')).toBe(false);
  });
});

describe('nextBlock', () => {
  it('returns the first reachable unfinished module', () => {
    const blocks = [block(1, 'completed'), block(2, 'current'), block(3, 'locked')];
    expect(nextBlock(blocks)?.position).toBe(2);
  });

  /// A module waiting on its cards is where the learner must go — the path
  /// does not open past it.
  it('stops at a module awaiting its flashcards', () => {
    const blocks = [block(1, 'completed'), block(2, 'flashcards_pending'), block(3, 'locked')];
    expect(nextBlock(blocks)?.position).toBe(2);
  });

  it('returns null when every module is done', () => {
    expect(nextBlock([block(1, 'completed'), block(2, 'completed')])).toBeNull();
  });

  it('returns null for an empty path', () => {
    expect(nextBlock([])).toBeNull();
  });
});
