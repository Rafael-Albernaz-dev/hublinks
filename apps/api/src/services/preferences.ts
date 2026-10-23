import { readFile } from 'node:fs/promises';
import { parseConfig } from '../validators/index.js';
import type { Pool } from 'pg';
import type { UserPreferences } from '../types/index.js';

export const DEFAULT_PREFERENCES: UserPreferences = {
  homeLayout: 'grid',
  showShortcutCards: true,
  cardOrder: [],
  shortcutOrder: [],
  shortcutStyle: 'cards',
  themeOverrides: null,
};
const columns = `home_layout AS "homeLayout", show_shortcut_cards AS "showShortcutCards", card_order AS "cardOrder", theme_overrides AS "themeOverrides", shortcut_order AS "shortcutOrder", shortcut_style AS "shortcutStyle"`;
export async function readPreferences(
  pool: Pool,
  userId: string,
  defaults = DEFAULT_PREFERENCES,
): Promise<UserPreferences> {
  const result = await pool.query<UserPreferences>(
    `SELECT ${columns} FROM user_preferences WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0] ?? { ...defaults, cardOrder: [] };
}
export async function updatePreferences(
  pool: Pool,
  userId: string,
  patch: Partial<UserPreferences>,
  defaults = DEFAULT_PREFERENCES,
): Promise<UserPreferences> {
  // Each supplied column is updated atomically; concurrent partial writes preserve other columns.
  const result = await pool.query<UserPreferences>(
    `
    INSERT INTO user_preferences (user_id, home_layout, show_shortcut_cards, card_order, theme_overrides, shortcut_order, shortcut_style)
    VALUES ($1, COALESCE($2, $10), COALESCE($3::boolean, $11::boolean), COALESCE($4::jsonb, '[]'::jsonb), $5::jsonb, COALESCE($12::jsonb, '[]'::jsonb), COALESCE($13, 'cards'))
    ON CONFLICT (user_id) DO UPDATE SET
      home_layout = CASE WHEN $6 THEN EXCLUDED.home_layout ELSE user_preferences.home_layout END,
      show_shortcut_cards = CASE WHEN $7 THEN EXCLUDED.show_shortcut_cards ELSE user_preferences.show_shortcut_cards END,
      card_order = CASE WHEN $8 THEN EXCLUDED.card_order ELSE user_preferences.card_order END,
      theme_overrides = CASE WHEN $9 THEN EXCLUDED.theme_overrides ELSE user_preferences.theme_overrides END,
      shortcut_order = CASE WHEN $14 THEN EXCLUDED.shortcut_order ELSE user_preferences.shortcut_order END,
      shortcut_style = CASE WHEN $15 THEN EXCLUDED.shortcut_style ELSE user_preferences.shortcut_style END,
      updated_at = NOW()
    RETURNING ${columns}`,
    [
      userId,
      patch.homeLayout ?? null,
      patch.showShortcutCards ?? null,
      patch.cardOrder ? JSON.stringify(patch.cardOrder) : null,
      patch.themeOverrides ? JSON.stringify(patch.themeOverrides) : null,
      'homeLayout' in patch,
      'showShortcutCards' in patch,
      'cardOrder' in patch,
      'themeOverrides' in patch,
      defaults.homeLayout,
      defaults.showShortcutCards,
      patch.shortcutOrder ? JSON.stringify(patch.shortcutOrder) : null,
      patch.shortcutStyle ?? null,
      'shortcutOrder' in patch,
      'shortcutStyle' in patch,
    ],
  );
  return result.rows[0]!;
}
export async function resetPreferences(
  pool: Pool,
  userId: string,
  defaults = DEFAULT_PREFERENCES,
): Promise<UserPreferences> {
  await pool.query('DELETE FROM user_preferences WHERE user_id = $1', [userId]);
  return { ...defaults, cardOrder: [] };
}

export async function companyPreferences(configPath: string): Promise<UserPreferences> {
  try {
    const config = parseConfig(JSON.parse(await readFile(configPath, 'utf8')));
    return {
      ...DEFAULT_PREFERENCES,
      homeLayout: config.homeLayout ?? 'grid',
      showShortcutCards: config.showShortcutCards ?? true,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ...DEFAULT_PREFERENCES };
    throw error;
  }
}
