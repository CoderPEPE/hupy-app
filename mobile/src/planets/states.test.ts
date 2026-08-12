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
  it('counts a block flagged for review as done — it was finished once', () => {
    expect(isBlockDone('review')).toBe(true);
    expect(isBlockDone('completed')).toBe(true);
    expect(isBlockDone('mastered')).toBe(true);
  });

  it('does not count blocks the learner has not finished', () => {
    expect(isBlockDone('locked')).toBe(false);
    expect(isBlockDone('available')).toBe(false);
    expect(isBlockDone('in_progress')).toBe(false);
  });
});

describe('nextBlock', () => {
  it('returns the first reachable unfinished block', () => {
    const blocks = [block(1, 'completed'), block(2, 'in_progress'), block(3, 'locked')];
    expect(nextBlock(blocks)?.position).toBe(2);
  });

  it('skips finished blocks including ones awaiting review', () => {
    const blocks = [block(1, 'review'), block(2, 'mastered'), block(3, 'available')];
    expect(nextBlock(blocks)?.position).toBe(3);
  });

  it('returns null when every block is done', () => {
    expect(nextBlock([block(1, 'completed'), block(2, 'mastered')])).toBeNull();
  });

  it('returns null for an empty path', () => {
    expect(nextBlock([])).toBeNull();
  });
});
