export const DEFAULT_EXTENSION_SETTINGS = {
  openOnStartup: false,
  openOnNewTab: false,
  showToastNotifications: true,
};
export type ExtensionSettings = typeof DEFAULT_EXTENSION_SETTINGS;
const keys = Object.keys(DEFAULT_EXTENSION_SETTINGS) as Array<keyof ExtensionSettings>;
export async function getExtensionSettings(): Promise<ExtensionSettings> {
  const stored = (await chrome.storage?.local?.get(keys)) ?? {};
  const result = { ...DEFAULT_EXTENSION_SETTINGS };
  for (const key of keys) if (typeof stored[key] === 'boolean') result[key] = stored[key];
  return result;
}
export async function saveExtensionSettings(patch: unknown): Promise<ExtensionSettings> {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch))
    throw new Error('Invalid settings');
  const input = patch as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) => !keys.includes(key as keyof ExtensionSettings) || typeof input[key] !== 'boolean',
    )
  )
    throw new Error('Invalid settings');
  if (!chrome.storage?.local?.set) throw new Error('Settings unavailable');
  // Never spread incoming messages into storage: only these three booleans are persisted.
  const allowed: Partial<ExtensionSettings> = {};
  for (const key of keys) if (key in input) allowed[key] = input[key] as boolean;
  await chrome.storage.local.set(allowed);
  return getExtensionSettings();
}
export function respondToSettings(
  message: unknown,
  sendResponse: (reply: unknown) => void,
): boolean {
  if (!message || typeof message !== 'object' || !('type' in message)) return false;
  if (
    !['PING', 'GET_SETTINGS', 'UPDATE_SETTINGS', 'UPDATE_EXTENSION_SETTINGS'].includes(
      String(message.type),
    )
  )
    return false;
  void (async () => {
    try {
      const settings =
        message.type === 'UPDATE_SETTINGS' || message.type === 'UPDATE_EXTENSION_SETTINGS'
          ? await saveExtensionSettings('settings' in message ? message.settings : undefined)
          : await getExtensionSettings();
      sendResponse({ status: 'ok', version: '0.1.0', settings });
    } catch {
      sendResponse({ status: 'error' });
    }
  })();
  return true;
}
