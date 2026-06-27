import { useEffect, useState } from 'react';
import { useSettings } from '../settings';
import { audio } from '../audio';

// Once per page load: a bald eagle swoops across the screen with a screech.
export default function EagleSwoop() {
  const { animations, music } = useSettings();
  const [flying, setFlying] = useState(false);

  useEffect(() => {
    if (!animations) return;
    setFlying(true);
    // Screech slightly after the swoop begins (only if audio is enabled).
    let screechTimer;
    if (music) {
      screechTimer = setTimeout(() => {
        audio.ensure();
        audio.playScreech();
      }, 250);
    }
    const done = setTimeout(() => setFlying(false), 3000);
    return () => {
      clearTimeout(done);
      if (screechTimer) clearTimeout(screechTimer);
    };
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!flying) return null;
  return (
    <div className="eagle-swoop" aria-hidden="true">
      <span className="eagle">🦅</span>
    </div>
  );
}
