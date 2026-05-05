let lockCount = 0;
let savedScrollY = 0;
let safetyTimer: ReturnType<typeof setTimeout> | null = null;

function applyLock() {
  savedScrollY = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${savedScrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';
}

function removeLock() {
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
  window.scrollTo(0, savedScrollY);
}

export function lockBodyScroll() {
  lockCount++;
  if (lockCount > 1) return;
  applyLock();
  if (safetyTimer) clearTimeout(safetyTimer);
  safetyTimer = setTimeout(() => {
    if (lockCount > 0) {
      lockCount = 0;
      removeLock();
    }
  }, 30000);
}

export function unlockBodyScroll() {
  if (lockCount <= 0) return;
  lockCount--;
  if (lockCount > 0) return;
  if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
  removeLock();
}
