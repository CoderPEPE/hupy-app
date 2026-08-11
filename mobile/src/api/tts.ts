import { apiArrayBuffer } from './client';

/** Returns MP3 audio bytes for `text` (backend caches identical requests). */
export function getSpeech(text: string, speed?: number): Promise<ArrayBuffer> {
  return apiArrayBuffer('/api/tts', {
    method: 'POST',
    auth: true,
    body: { text, speed },
  });
}
