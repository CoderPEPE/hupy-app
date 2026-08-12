// Contract tests for the endpoint wrapper layer: every function must hit the
// right path with the right method, auth flag, and body shape. `./client` is
// mocked so no fetch happens — we assert the request descriptions only.
import { apiArrayBuffer, apiRequest } from './client';
import * as authApi from './auth';
import * as conversations from './conversations';
import * as flashcards from './flashcards';
import * as gamification from './gamification';
import * as planets from './planets';
import * as realtime from './realtime';
import * as tts from './tts';
import * as voices from './voices';

jest.mock('./client', () => ({
  apiRequest: jest.fn(),
  apiArrayBuffer: jest.fn(),
}));

const mockApiRequest = apiRequest as jest.Mock;
const mockApiArrayBuffer = apiArrayBuffer as jest.Mock;

const lastCall = () => mockApiRequest.mock.calls[mockApiRequest.mock.calls.length - 1] as [string, unknown];
const lastArrayCall = () => mockApiArrayBuffer.mock.calls[mockApiArrayBuffer.mock.calls.length - 1] as [string, unknown];

beforeEach(() => {
  jest.clearAllMocks();
  mockApiRequest.mockResolvedValue({});
  mockApiArrayBuffer.mockResolvedValue(new ArrayBuffer(0));
});

describe('auth endpoints', () => {
  it('register posts credentials plus the course pair and name', async () => {
    await authApi.register('a@b.c', 'pw', 'es', 'en', 'Ana');
    const [path, init] = lastCall();
    expect(path).toBe('/api/auth/register');
    expect(init).toMatchObject({
      method: 'POST',
      body: { email: 'a@b.c', password: 'pw', base_language: 'es', language: 'en', name: 'Ana' },
    });
    expect(mockApiRequest.mock.calls[0][1]).not.toHaveProperty('auth', true);
  });

  it('login posts email and password without auth', async () => {
    await authApi.login('a@b.c', 'pw');
    const [path, init] = lastCall();
    expect(path).toBe('/api/auth/login');
    expect(init).toMatchObject({ method: 'POST', body: { email: 'a@b.c', password: 'pw' } });
  });

  it('me reads with auth', async () => {
    await authApi.me();
    expect(lastCall()).toEqual(['/api/auth/me', { auth: true }]);
  });

  it('setLanguage posts the pair with auth', async () => {
    await authApi.setLanguage('pt', 'en');
    expect(lastCall()).toEqual([
      '/api/auth/language',
      { method: 'POST', auth: true, body: { language: 'pt', base_language: 'en' } },
    ]);
  });

  it('setVoice and setName post their fields with auth', async () => {
    await authApi.setVoice('onyx');
    expect(lastCall()).toEqual(['/api/auth/voice', { method: 'POST', auth: true, body: { voice: 'onyx' } }]);
    await authApi.setName('Ana');
    expect(lastCall()).toEqual(['/api/auth/name', { method: 'POST', auth: true, body: { name: 'Ana' } }]);
  });
});

describe('planets endpoints', () => {
  it('getPlanets lists with auth', async () => {
    await planets.getPlanets();
    expect(lastCall()).toEqual(['/api/planets', { auth: true }]);
  });

  it('getCatalogStats builds the course query and is public', async () => {
    await planets.getCatalogStats('es', 'en');
    const [path, init] = lastCall();
    expect(path).toBe('/api/planets/catalog?base_language=es&language=en');
    expect(init).toBeUndefined(); // no options → no auth header
  });

  it('getPlanet and getPlanetLesson hit the id routes with auth', async () => {
    await planets.getPlanet('p1');
    expect(lastCall()).toEqual(['/api/planets/p1', { auth: true }]);
    await planets.getPlanetLesson('p1');
    expect(lastCall()).toEqual(['/api/planets/p1/lesson', { auth: true }]);
  });

  it('bumpPlanetProgress posts the metric and delta', async () => {
    await planets.bumpPlanetProgress('p1', 'pronunciation', 0.1);
    expect(lastCall()).toEqual([
      '/api/planets/p1/progress',
      { method: 'POST', auth: true, body: { metric: 'pronunciation', delta: 0.1 } },
    ]);
  });

  it('masterSentence posts the mastered flag', async () => {
    await planets.masterSentence('p1', 's1', true);
    expect(lastCall()).toEqual([
      '/api/planets/p1/sentences/s1/master',
      { method: 'POST', auth: true, body: { mastered: true } },
    ]);
  });
});

describe('flashcard endpoints', () => {
  it('getFlashcards with no filters hits the plain list', async () => {
    await flashcards.getFlashcards();
    expect(lastCall()).toEqual(['/api/flashcards', { auth: true }]);
  });

  it('getFlashcards encodes planet and due filters', async () => {
    await flashcards.getFlashcards({ planetId: 'p2', due: true });
    const [path, init] = lastCall();
    expect(path).toBe('/api/flashcards?planet_id=p2&due=true');
    expect(init).toEqual({ auth: true });
  });

  it('createFlashcard maps planetId to planet_id', async () => {
    await flashcards.createFlashcard({ en: 'I work', pt: 'Eu trabalho', planetId: 'p2' });
    const [path, init] = lastCall();
    expect(path).toBe('/api/flashcards');
    expect(init).toMatchObject({ method: 'POST', auth: true, body: { en: 'I work', pt: 'Eu trabalho', planet_id: 'p2' } });
  });

  it('review, correction-to-card, and confirm-mastery hit their routes', async () => {
    await flashcards.reviewFlashcard('c1', 'hard');
    expect(lastCall()).toEqual(['/api/flashcards/c1/review', { method: 'POST', auth: true, body: { rating: 'hard' } }]);
    await flashcards.correctionToCard('corr1');
    expect(lastCall()).toEqual(['/api/flashcards/corrections/corr1/flashcard', { method: 'POST', auth: true }]);
    await flashcards.confirmFlashcardMastery('c1');
    expect(lastCall()).toEqual(['/api/flashcards/c1/confirm-live-mastery', { method: 'POST', auth: true }]);
  });
});

describe('conversation endpoints', () => {
  it('list and detail are authed reads', async () => {
    await conversations.getConversations();
    expect(lastCall()).toEqual(['/api/conversations', { auth: true }]);
    await conversations.getConversation('conv1');
    expect(lastCall()).toEqual(['/api/conversations/conv1', { auth: true }]);
  });

  it('createConversation posts the title and planet', async () => {
    await conversations.createConversation({ title: 'My chat', planetId: 'p1' });
    expect(lastCall()).toEqual([
      '/api/conversations',
      { method: 'POST', auth: true, body: { title: 'My chat', planet_id: 'p1' } },
    ]);
  });

  it('addConversationMessage posts role and text', async () => {
    await conversations.addConversationMessage('conv1', { role: 'user', text: 'Hello' });
    expect(lastCall()).toEqual([
      '/api/conversations/conv1/messages',
      { method: 'POST', auth: true, body: { role: 'user', text: 'Hello' } },
    ]);
  });

  it('addConversationCorrection maps camelCase to snake_case fields', async () => {
    await conversations.addConversationCorrection('conv1', {
      said: 'I go',
      corrected: 'I went',
      explanation: 'past',
      mistakePart: 'go',
      subject: 'I',
      verb: 'went',
      complement: '',
    });
    const [path, init] = lastCall();
    expect(path).toBe('/api/conversations/conv1/corrections');
    expect(init).toMatchObject({
      method: 'POST',
      auth: true,
      body: {
        said: 'I go',
        corrected: 'I went',
        explanation: 'past',
        mistake_part: 'go',
        subject: 'I',
        verb: 'went',
        complement: '',
      },
    });
  });
});

describe('gamification / realtime / voices / tts endpoints', () => {
  it('gamification stats is an authed read', async () => {
    await gamification.getGamificationStats();
    expect(lastCall()).toEqual(['/api/gamification/stats', { auth: true }]);
  });

  it('realtime client-secret is an authed POST', async () => {
    await realtime.getRealtimeClientSecret();
    expect(lastCall()).toEqual(['/api/realtime/client-secret', { method: 'POST', auth: true }]);
  });

  it('voices is an authed read', async () => {
    await voices.getVoices();
    expect(lastCall()).toEqual(['/api/voices', { auth: true }]);
  });

  it('getSpeech posts text, speed, and voice to the binary endpoint', async () => {
    await tts.getSpeech('Good morning', 1.2, 'marin');
    const [path, init] = lastArrayCall();
    expect(path).toBe('/api/tts');
    expect(init).toMatchObject({
      method: 'POST',
      auth: true,
      body: { text: 'Good morning', speed: 1.2, voice: 'marin' },
    });
  });
});

