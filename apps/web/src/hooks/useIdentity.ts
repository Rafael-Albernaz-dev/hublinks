import type { PreferencesModel } from './usePreferences';
import type { UserThemeOverrides } from '../types';
import type { CSSProperties } from 'react';
import { useEffect } from 'react';
import type { HubConfig, RgbColor } from '../config';
import { DEFAULT_CONFIG, brandInk, brandText, parseHubConfig, rgbToCss, rgbToHex } from '../config';
import {
  WORKSPACE_PURPLE,
  colorEquals,
  parseHexField,
  parseRgbField,
  rgbField,
} from './identityFields';
import type { WorkspaceState } from './useWorkspaceState';
export function useIdentity(
  state: Pick<
    WorkspaceState,
    | 'globalConfig'
    | 'setGlobalConfig'
    | 'currentUser'
    | 'setConfig'
    | 'setColorChosen'
    | 'setPersisted'
    | 'setApiState'
    | 'persisted'
    | 'config'
    | 'apiState'
    | 'saving'
    | 'setNotice'
    | 'setSaving'
    | 'colorChosen'
    | 'setHexDraft'
    | 'setRgbDraft'
  >,
  personal: PreferencesModel,
) {
  const {
    currentUser,
    globalConfig,
    setGlobalConfig,
    setConfig,
    setColorChosen,
    setPersisted,
    setApiState,
    persisted,
    config,
    apiState,
    saving,
    setNotice,
    setSaving,
    colorChosen,
    setHexDraft,
    setRgbDraft,
  } = state;

  useEffect(() => {
    setConfig(DEFAULT_CONFIG);
    setPersisted(null);
    setApiState('loading');
    if (!currentUser) return;
    const pendingPreferences = personal.loadPreferences();
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/config', { signal: controller.signal });
        if (!response.ok) throw new Error('API unavailable');
        const global = parseHubConfig(await response.json());
        const preferences = await pendingPreferences;
        const loaded =
          currentUser?.role === 'attendant' ? { ...global, ...preferences.themeOverrides } : global;
        if (!controller.signal.aborted) {
          setGlobalConfig(global);
          setConfig(loaded);
          setColorChosen(false);
          setPersisted(loaded);
          setApiState('online');
        }
      } catch {
        const preferences = await pendingPreferences;
        if (!controller.signal.aborted) {
          setConfig(
            currentUser?.role === 'attendant'
              ? { ...DEFAULT_CONFIG, ...preferences.themeOverrides }
              : DEFAULT_CONFIG,
          );
          setApiState('offline');
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [currentUser]);
  const isDirty = persisted !== null && JSON.stringify(config) !== JSON.stringify(persisted);
  async function saveConfig() {
    if (apiState !== 'online' || !isDirty || saving) return;
    let candidate: HubConfig;
    try {
      candidate = parseHubConfig(config);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Configuração inválida.');
      return;
    }
    setSaving(true);
    setNotice('');
    try {
      if (currentUser?.role === 'attendant') {
        const overrides: UserThemeOverrides = {};
        for (const key of Object.keys(candidate) as Array<keyof HubConfig>) {
          if (
            key === 'version' ||
            key === 'links' ||
            key === 'homeLayout' ||
            key === 'showShortcutCards'
          )
            continue;
          if (JSON.stringify(candidate[key]) !== JSON.stringify(globalConfig[key]))
            Object.assign(overrides, { [key]: candidate[key] });
        }
        // Null explicitly clears an inherited optional color/text setting.
        for (const key of [
          'textColor',
          'backgroundColor',
          'brandPrimaryColor',
          'brandSecondaryColor',
        ] as const) {
          if (globalConfig[key] && !candidate[key]) overrides[key] = null;
        }
        for (const key of [
          'headerTagline',
          'homeEyebrow',
          'homeTitle',
          'brandPrimaryText',
          'brandSecondaryText',
        ] as const) {
          if (globalConfig[key] && !candidate[key]) overrides[key] = '';
        }
        await personal.updatePreferences({ themeOverrides: overrides });
        setPersisted(candidate);
        setNotice('Personalização pessoal salva.');
        return;
      }
      await putGlobalConfig(candidate);
      setNotice('Alterações salvas na API local.');
    } catch {
      setNotice('Não foi possível salvar as alterações na API local.');
    } finally {
      setSaving(false);
    }
  }
  async function putGlobalConfig(candidate: HubConfig): Promise<HubConfig> {
    const response = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(candidate),
    });
    if (!response.ok) throw new Error('A API não conseguiu salvar a configuração.');
    const result = (await response.json()) as { config: unknown };
    const saved = parseHubConfig(result.config);
    setGlobalConfig(saved);
    setPersisted(saved);
    await personal.loadPreferences();
    return saved;
  }
  /** Resets only the visual identity; saved links and Home layout are team content, not theme. */
  async function restoreHublinkDefaults() {
    if (apiState !== 'online' || saving) return;
    const base = persisted ?? config;
    const candidate: HubConfig = { ...DEFAULT_CONFIG, links: base.links };
    if (base.homeLayout) candidate.homeLayout = base.homeLayout;
    if (base.showShortcutCards !== undefined) candidate.showShortcutCards = base.showShortcutCards;
    setSaving(true);
    setNotice('');
    try {
      const saved = await putGlobalConfig(candidate);
      setConfig(saved);
      setColorChosen(false);
      setNotice('Padrão Hublink restaurado.');
    } catch {
      setNotice('Não foi possível restaurar o padrão Hublink.');
    } finally {
      setSaving(false);
    }
  }
  async function resetPersonalPreferences() {
    try {
      await personal.updatePreferences({}, true);
      setConfig(globalConfig);
      setPersisted(globalConfig);
      setColorChosen(false);
      setNotice('Padrão da empresa restaurado.');
    } catch {
      setNotice('Não foi possível restaurar o padrão da empresa.');
    }
  }
  const isLegacyDefault = colorEquals(config.color, DEFAULT_CONFIG.color) && !colorChosen;
  const visualColor = isLegacyDefault ? WORKSPACE_PURPLE : config.color;
  const customAccent = !colorEquals(visualColor, WORKSPACE_PURPLE) ? rgbToCss(visualColor) : null;
  const style = {
    '--brand': rgbToCss(visualColor),
    '--brand-ink': brandInk(visualColor),
    '--brand-text': brandText(visualColor),
    ...(customAccent
      ? {
          '--hb-accent': customAccent,
          '--hb-on': brandInk(visualColor),
          '--hb-monogram': brandInk(visualColor),
          '--hb-soft': 'color-mix(in srgb, ' + customAccent + ' 15%, var(--hb-panel))',
        }
      : {}),
    ...(config.textColor ? { '--hb-ink': config.textColor } : {}),
    ...(config.backgroundColor ? { '--hb-bg': config.backgroundColor } : {}),
  } as CSSProperties;
  useEffect(() => {
    setHexDraft(rgbToHex(visualColor).toUpperCase());
    setRgbDraft(rgbField(visualColor));
  }, [visualColor.r, visualColor.g, visualColor.b]);
  function chooseColor(color: RgbColor) {
    setColorChosen(true);
    setConfig((current) => ({ ...current, color }));
  }
  function editHex(value: string) {
    setHexDraft(value);
    const parsed = parseHexField(value);
    if (parsed) chooseColor(parsed);
  }
  function editRgb(value: string) {
    setRgbDraft(value);
    const parsed = parseRgbField(value);
    if (parsed) chooseColor(parsed);
  }
  function uploadLogo(file: File | undefined) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1_000_000) {
      setNotice('Escolha uma logo PNG, JPG ou WebP de até 1 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setConfig((current) => ({ ...current, logoDataUrl: reader.result as string }));
        setNotice('Logo alterada. Salve as alterações para persistir.');
      }
    };
    reader.onerror = () => setNotice('Não foi possível ler a imagem.');
    reader.readAsDataURL(file);
  }
  function exportConfig() {
    try {
      const blob = new Blob([JSON.stringify(parseHubConfig(config), null, 2)], {
        type: 'application/json',
      });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = 'hublink-config.json';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setNotice('Configuração exportada. Guarde o arquivo em local adequado.');
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Não foi possível exportar.');
    }
  }
  async function importConfig(file: File | undefined) {
    if (!file) return;
    if (file.size > 2_000_000) {
      setNotice('O arquivo de configuração é grande demais.');
      return;
    }
    try {
      setConfig(parseHubConfig(JSON.parse(await file.text())));
      setNotice('Configuração importada. Salve as alterações para persistir.');
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Arquivo de configuração inválido.');
    }
  }
  return {
    isDirty,
    resetPersonalPreferences,
    restoreHublinkDefaults,
    saveConfig,
    isLegacyDefault,
    visualColor,
    customAccent,
    style,
    chooseColor,
    editHex,
    editRgb,
    uploadLogo,
    exportConfig,
    importConfig,
  };
}
