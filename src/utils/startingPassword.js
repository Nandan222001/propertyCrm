/**
 * The password just typed at sign-in, held in memory only (never in Redux, storage or the URL) so the
 * "choose a new password" popup can show it already filled in. Gone on reload, sign-out or password change.
 */
let remembered = '';

export const startingPassword = {
  remember: (value) => { remembered = value || ''; },
  get: () => remembered,
  clear: () => { remembered = ''; },
};
