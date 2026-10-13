/**
 * NYVEX — first-launch responsibility agreement
 */
import { showScreen } from '../core/router.js';
import { toast } from '../core/toast.js';

const KEY = 'nyvex_agreement_accepted_v1';
const KEY_DATE = 'nyvex_agreement_date';

export function hasAcceptedAgreement() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function acceptAgreement() {
  try {
    localStorage.setItem(KEY, '1');
    localStorage.setItem(KEY_DATE, new Date().toISOString());
  } catch {}
}

/**
 * @param {() => void | Promise<void>} onAccepted — continue app boot (model load etc.)
 */
export function setupAgreement(onAccepted) {
  const checkbox = document.getElementById('agreeCheckbox');
  const btn = document.getElementById('agreeBtn');
  if (!checkbox || !btn) {
    // No UI — treat as accepted for safety of old builds
    Promise.resolve(onAccepted()).catch(console.error);
    return;
  }

  btn.disabled = !checkbox.checked;

  checkbox.addEventListener('change', () => {
    btn.disabled = !checkbox.checked;
  });

  btn.addEventListener('click', async () => {
    if (!checkbox.checked) return;
    btn.disabled = true;
    acceptAgreement();
    try {
      toast('Согласие сохранено');
    } catch {}
    await onAccepted();
  });
}
