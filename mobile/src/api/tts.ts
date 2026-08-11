import { apiArrayBuffer } from './client';

/** Returns MP3 audio bytes for `text` (backend caches identical requests).
 * `voice` picks a course-appropriate OpenAI TTS voice so Spanish/Portuguese
 * text is pronounced natively rather than with English phonetics. */
export function getSpeech(text: string, speed?: number, voice?: string): Promise<ArrayBuffer> {
  return apiArrayBuffer('/api/tts', {
    method: 'POST',
    auth: true,
    body: { text, speed, voice },
  });
}
