import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_CONFIG, parseHubConfig } from '../config';
import type { User, UserPreferences } from '../types';
export const defaultPreferences: UserPreferences = {
  homeLayout: 'grid',
  showShortcutCards: true,
  cardOrder: [],
  themeOverrides: null,
};
const key = (id: string) => `hublink:preferences:${id}`;
function validatePreferences(raw: unknown): UserPreferences {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid preferences');
  const value = { ...defaultPreferences, ...raw };
  if (
    !['grid', 'list', 'carousel'].includes(value.homeLayout) ||
    typeof value.showShortcutCards !== 'boolean' ||
    !Array.isArray(value.cardOrder) ||
    value.cardOrder.length > 100 ||
    value.cardOrder.some(
      (id: unknown) => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,50}$/.test(id),
    )
  )
    throw new Error('Invalid preferences');
  if (value.themeOverrides !== null) {
    if (typeof value.themeOverrides !== 'object' || Array.isArray(value.themeOverrides))
      throw new Error('Invalid theme');
    const allowed = [
      'companyName',
      'subtitle',
      'color',
      'logoDataUrl',
      'headerTagline',
      'homeEyebrow',
      'homeTitle',
      'brandPrimaryText',
      'brandPrimaryColor',
      'brandSecondaryText',
      'brandSecondaryColor',
      'textColor',
      'backgroundColor',
    ];
    if (Object.keys(value.themeOverrides).some((field) => !allowed.includes(field)))
      throw new Error('Invalid theme');
    parseHubConfig({ ...DEFAULT_CONFIG, ...value.themeOverrides });
  }
  return value;
}
function cached(id: string): UserPreferences {
  try {
    return validatePreferences(JSON.parse(localStorage.getItem(key(id)) ?? '{}'));
  } catch {
    return { ...defaultPreferences };
  }
}
function pendingValue(id: string): string | null {
  try {
    return localStorage.getItem(key(id) + ':pending');
  } catch {
    return null;
  }
}
function cache(id: string, value: UserPreferences) {
  try {
    localStorage.setItem(key(id), JSON.stringify(value));
  } catch {
    /* Storage can be unavailable or full. */
  }
}
export function usePreferences(user: User | null) {
  const id = user?.id;
  const activeId = useRef(id);
  activeId.current = id;
  const [stored, setStored] = useState<{ id: string; value: UserPreferences } | null>(null);
  const current = useRef<UserPreferences>(defaultPreferences);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const preferences = stored && stored.id === id ? stored.value : defaultPreferences;
  const apply = useCallback((userId: string, value: UserPreferences) => {
    if (activeId.current !== userId) return;
    cache(userId, value);
    current.current = value;
    setStored({ id: userId, value });
  }, []);
  const loadPreferences = useCallback(async () => {
    if (!id) return defaultPreferences;
    const run = async () => {
      if (activeId.current !== id) return defaultPreferences;
      let value: UserPreferences;
      try {
        const pending = pendingValue(id);
        if (pending) {
          const saved = JSON.parse(pending) as { reset: boolean; value: unknown };
          const patch = validatePreferences(saved.value);
          const synced = await fetch('/api/me/preferences', {
            method: saved.reset ? 'DELETE' : 'PUT',
            headers: { 'Content-Type': 'application/json' },
            ...(saved.reset ? {} : { body: JSON.stringify(patch) }),
          });
          if (!synced.ok) throw new Error('Preferências indisponíveis.');
          localStorage.removeItem(key(id) + ':pending');
        }
        if (activeId.current !== id) return defaultPreferences;
        const response = await fetch('/api/me/preferences');
        if (!response.ok) throw new Error('Preferências indisponíveis.');
        const body = (await response.json()) as { preferences: UserPreferences };
        if (!body.preferences) throw new Error('Preferências inválidas.');
        value = validatePreferences(body.preferences);
      } catch {
        value = cached(id);
      }
      apply(id, value);
      return value;
    };
    const result = queue.current.catch(() => undefined).then(run);
    queue.current = result;
    return result;
  }, [id, apply]);
  const updatePreferences = useCallback(
    (patch: Partial<UserPreferences>, reset = false): Promise<UserPreferences> => {
      if (!id) return Promise.reject(new Error('Entre na sua conta.'));
      const userId = id;
      const run = async () => {
        if (activeId.current !== userId) throw new Error('A conta foi alterada.');
        const next = reset ? { ...defaultPreferences } : { ...current.current, ...patch };
        let response: Response;
        try {
          response = await fetch('/api/me/preferences', {
            method: reset ? 'DELETE' : 'PUT',
            headers: { 'Content-Type': 'application/json' },
            ...(reset ? {} : { body: JSON.stringify(pendingValue(userId) ? next : patch) }),
          });
        } catch {
          try {
            localStorage.setItem(key(userId) + ':pending', JSON.stringify({ reset, value: next }));
          } catch {
            /* Storage can be unavailable. */
          }
          apply(userId, next);
          return next;
        }
        if (!response.ok) throw new Error('Não foi possível salvar suas preferências.');
        const body = (await response.json()) as { preferences: UserPreferences };
        const value = validatePreferences(body.preferences);
        try {
          localStorage.removeItem(key(userId) + ':pending');
        } catch {
          /* Storage can be unavailable. */
        }
        apply(userId, value);
        return value;
      };
      const result = queue.current.catch(() => undefined).then(run);
      queue.current = result;
      return result;
    },
    [id, apply],
  );
  useEffect(() => {
    const sync = () => {
      void loadPreferences();
    };
    window.addEventListener('online', sync);
    return () => window.removeEventListener('online', sync);
  }, [loadPreferences]);
  return { preferences, loadPreferences, updatePreferences };
}
export type PreferencesModel = ReturnType<typeof usePreferences>;
