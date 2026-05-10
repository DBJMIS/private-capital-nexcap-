/**
 * Portal password rules (client + server should match messaging).
 */

export function assertPasswordStrength(password: string): { ok: true } | { ok: false; message: string } {
  if (password.length < 8) {
    return { ok: false, message: 'Password must be at least 8 characters.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { ok: false, message: 'Password must include at least one uppercase letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, message: 'Password must include at least one number.' };
  }
  return { ok: true };
}
