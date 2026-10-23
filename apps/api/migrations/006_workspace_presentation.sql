ALTER TABLE user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_home_layout_check;
ALTER TABLE user_preferences
  ADD CONSTRAINT user_preferences_home_layout_check
    CHECK (home_layout IN ('grid', 'list', 'carousel', 'compact', 'sections'));
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS shortcut_order JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS shortcut_style VARCHAR(10) NOT NULL DEFAULT 'cards'
    CHECK (shortcut_style IN ('cards', 'chips'));
