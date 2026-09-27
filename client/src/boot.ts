import { hideLoading, loadingFailed } from './loading';

// Keep the first screen independent of Phaser and the application stylesheet.
const slowLoad = window.setTimeout(() => {
  loadingFailed('The adventure is taking a little longer. Still trying…');
}, 20000);

try {
  await import('./main');
  hideLoading();
} catch (error) {
  console.error('Could not start OpenRPG', error);
  loadingFailed('The game could not load. Please try again.');
} finally {
  window.clearTimeout(slowLoad);
}
