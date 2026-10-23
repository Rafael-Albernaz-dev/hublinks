import { homeLayouts } from '../HomeServiceViews';
import type { HomeLayoutMode, UserPreferences } from '../../types';

export function HomeLayoutCard({
  layout,
  showShortcuts,
  shortcutStyle,
  onLayout,
  onShowShortcuts,
  onShortcutStyle,
}: {
  layout: HomeLayoutMode;
  showShortcuts: boolean;
  shortcutStyle: UserPreferences['shortcutStyle'];
  onLayout: (value: HomeLayoutMode) => void;
  onShowShortcuts: (value: boolean) => void;
  onShortcutStyle: (value: UserPreferences['shortcutStyle']) => void;
}) {
  return (
    <div
      className="setting-group hb-home-layout-card"
      role="group"
      aria-label="Preferências da Home"
    >
      <h3>Exibição da tela inicial</h3>
      <p className="setting-help">Escolha a organização dos serviços e dos atalhos.</p>
      <label>
        Organização da Home
        <select value={layout} onChange={(event) => onLayout(event.target.value as HomeLayoutMode)}>
          {homeLayouts.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="hb-check-label">
        <input
          type="checkbox"
          checked={showShortcuts}
          onChange={(event) => onShowShortcuts(event.target.checked)}
        />
        Mostrar atalhos
      </label>
      <label>
        Formato dos seus atalhos
        <select
          value={shortcutStyle}
          onChange={(event) =>
            onShortcutStyle(event.target.value as UserPreferences['shortcutStyle'])
          }
        >
          <option value="cards">Cards</option>
          <option value="chips">Barra compacta</option>
        </select>
      </label>
    </div>
  );
}
