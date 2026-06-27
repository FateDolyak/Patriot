import { useEffect } from 'react';
import { useSettings } from '../settings';
import { audio } from '../audio';

// Bridges the music setting to the audio engine and honors autoplay policy.
// Mobile browsers (especially iOS Safari) only allow audio to start from a
// genuine tap, and reject play() if the file hasn't loaded yet. So we listen
// for real tap/click/key events and keep retrying on each interaction until
// playback actually succeeds — rather than giving up after the first one.
export default function AudioController() {
  const { music } = useSettings();

  useEffect(() => {
    audio.setMusicEnabled(music);
  }, [music]);

  useEffect(() => {
    const events = ['click', 'touchend', 'keydown'];
    const remove = () => events.forEach((e) => window.removeEventListener(e, onGesture));
    const onGesture = () => {
      audio.ensure();
      if (music) audio.startMusic();
      // Stop listening once music is off or actually playing.
      if (!music || audio.isPlaying()) remove();
    };
    events.forEach((e) => window.addEventListener(e, onGesture, { passive: true }));
    return remove;
  }, [music]);

  return null;
}
