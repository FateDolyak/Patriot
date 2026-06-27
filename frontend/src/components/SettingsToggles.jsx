import { useSettings } from '../settings';
import { audio } from '../audio';

// Toggle buttons for animations and music/SFX. Choices persist via localStorage.
export default function SettingsToggles() {
  const { animations, music, toggleAnimations, toggleMusic } = useSettings();

  const onMusic = () => {
    // This click is a user gesture, so it's safe to start audio here. Act on the
    // engine synchronously within the tap (don't wait for the React effect) so
    // mobile browsers reliably honor it as user-initiated playback.
    const turningOn = !music;
    audio.ensure();
    audio.setMusicEnabled(turningOn);
    toggleMusic();
  };

  return (
    <div className="settings-toggles">
      <button
        type="button"
        className={`toggle-chip ${animations ? 'on' : 'off'}`}
        onClick={toggleAnimations}
        aria-pressed={animations}
        title={animations ? 'Animations on' : 'Animations off'}
      >
        {animations ? '✨' : '🚫'} Animations
      </button>
      <button
        type="button"
        className={`toggle-chip ${music ? 'on' : 'off'}`}
        onClick={onMusic}
        aria-pressed={music}
        title={music ? 'Music & sound on' : 'Music & sound off'}
      >
        {music ? '🔊' : '🔇'} Music
      </button>
    </div>
  );
}
