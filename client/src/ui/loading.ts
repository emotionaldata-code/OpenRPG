const screen = document.getElementById('loading')!;
const message = document.getElementById('loading-message')!;
const retry = document.getElementById('loading-retry')!;
const minimumVisibleMs = 3000;
let shownAt = performance.now();
let hideTimer: number | undefined;

function setContentInert(value: boolean): void {
  for (const id of ['lobby', 'play']) {
    document.getElementById(id)!.inert = value;
  }
}

export function showLoading(text: string): void {
  window.clearTimeout(hideTimer);
  shownAt = performance.now();
  message.textContent = text;
  retry.hidden = true;
  screen.hidden = false;
  screen.setAttribute('aria-busy', 'true');
  setContentInert(true);
}

export function hideLoading(after?: () => void): void {
  window.clearTimeout(hideTimer);
  const remainingMs = Math.max(0, minimumVisibleMs - (performance.now() - shownAt));
  hideTimer = window.setTimeout(() => {
    document.documentElement.removeAttribute('data-booting');
    screen.hidden = true;
    screen.setAttribute('aria-busy', 'false');
    setContentInert(false);
    hideTimer = undefined;
    after?.();
  }, remainingMs);
}

export function loadingFailed(text: string): void {
  window.clearTimeout(hideTimer);
  message.textContent = text;
  screen.setAttribute('aria-busy', 'false');
  retry.hidden = false;
}
