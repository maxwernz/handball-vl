// localStorage can be unavailable (private mode, blocked site data); the app must work without it.
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(`hvl:${key}`);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null) {
    try {
      if (value === null) localStorage.removeItem(`hvl:${key}`);
      else localStorage.setItem(`hvl:${key}`, value);
    } catch {
      /* ignore */
    }
  },
};
