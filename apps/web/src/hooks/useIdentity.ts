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
) {
  const {
    currentUser,
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
    if (!currentUser) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/config', { signal: controller.signal });
        if (!response.ok) throw new Error('API unavailable');
        const loaded = parseHubConfig(await response.json());
        if (!controller.signal.aborted) {
          setConfig(loaded);
          setColorChosen(false);
          setPersisted(loaded);
          setApiState('online');
        }
      } catch {
        if (!controller.signal.aborted) setApiState('offline');
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
      const response = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(candidate),
      });
      if (!response.ok) throw new Error('A API não conseguiu salvar a configuração.');
      const result = (await response.json()) as { config: unknown };
      setPersisted(parseHubConfig(result.config));
      setNotice('Alterações salvas na API local.');
    } catch {
      setNotice('Não foi possível salvar as alterações na API local.');
    } finally {
      setSaving(false);
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
