import { audio } from './audio';
import './audio.css';

/** One preference and delegated listener for both headers and dynamic UI buttons. */
export function mountAudio(): () => void {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-audio-toggle]'));
  const render = (): void => {
    for (const button of buttons) {
      button.disabled = !audio.supported;
      button.setAttribute('aria-pressed', String(audio.isEnabled));
      button.title = !audio.supported ? 'Audio unavailable in this browser' : audio.isEnabled ? 'Mute music and sound effects' : 'Enable music and sound effects';
      button.querySelector('[data-audio-label]')!.textContent = audio.isEnabled ? 'Audio on' : 'Audio off';
    }
  };
  const unlock = (): void => { audio.unlock(); render(); };
  const click = (event: MouseEvent): void => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    // Touch browsers may grant activation on click, after pointerdown has run.
    if (!button?.hasAttribute('data-audio-toggle')) unlock();
    if (!button || button.disabled) return;
    if (button.hasAttribute('data-audio-toggle')) { audio.toggle(); render(); return; }
    audio.play(button.dataset.sound === 'important' ? 'important' : 'click');
  };
  const blur = (): void => audio.focus(false);
  const focus = (): void => audio.focus(!document.hidden);
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);
  document.addEventListener('click', click, true);
  document.addEventListener('visibilitychange', focus);
  window.addEventListener('blur', blur); window.addEventListener('focus', focus);
  window.addEventListener('pagehide', blur); window.addEventListener('pageshow', focus);
  // Start immediately when autoplay is allowed; gestures retry when it is blocked.
  unlock();
  return () => {
    document.removeEventListener('pointerdown', unlock, true); document.removeEventListener('keydown', unlock, true);
    document.removeEventListener('click', click, true); document.removeEventListener('visibilitychange', focus);
    window.removeEventListener('blur', blur); window.removeEventListener('focus', focus);
    window.removeEventListener('pagehide', blur); window.removeEventListener('pageshow', focus);
    audio.dispose();
  };
}
