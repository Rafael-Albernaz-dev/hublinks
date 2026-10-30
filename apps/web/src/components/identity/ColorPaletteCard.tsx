import { useState } from 'react';
import { ModalDialog } from '../ModalDialog';
import { brandInk, hexToRgb, rgbToCss, rgbToHex } from '../../config';
import {
  WORKSPACE_PURPLE,
  parseHexField,
  parseRgbField,
  rgbField,
} from '../../hooks/identityFields';
import type { AuthenticatedWorkspace } from '../../hooks/useWorkspace';

export function ColorPaletteCard({
  config,
  setConfig,
  visualColor,
  chooseColor,
  hexDraft,
  editHex,
  setHexDraft,
  rgbDraft,
  editRgb,
  setRgbDraft,
}: Pick<
  AuthenticatedWorkspace,
  | 'config'
  | 'setConfig'
  | 'visualColor'
  | 'chooseColor'
  | 'hexDraft'
  | 'editHex'
  | 'setHexDraft'
  | 'rgbDraft'
  | 'editRgb'
  | 'setRgbDraft'
>) {
  return (
    <div className="setting-group identity-color-card">
      <h3>Cores e aparência</h3>
      <div
        className="color-showcase"
        style={{ background: rgbToCss(visualColor), color: brandInk(visualColor) }}
      >
        <strong>Hublink</strong>
        <span>Prévia de contraste da cor de destaque</span>
        <label className="color-picker-label">
          <span>Escolher cor</span>
          <input
            type="color"
            aria-label="Seletor visual de cor"
            value={rgbToHex(visualColor)}
            onChange={(event) => chooseColor(hexToRgb(event.target.value))}
          />
        </label>
      </div>
      <div className="color-inputs">
        <label>
          Hexadecimal
          <input
            aria-label="Hexadecimal"
            type="text"
            spellCheck={false}
            maxLength={7}
            value={hexDraft}
            aria-invalid={hexDraft.length > 0 && !parseHexField(hexDraft)}
            onChange={(event) => editHex(event.target.value)}
            onBlur={() => setHexDraft(rgbToHex(visualColor).toUpperCase())}
            placeholder="#7137D1"
          />
        </label>
        <label>
          RGB
          <input
            aria-label="RGB"
            type="text"
            value={rgbDraft}
            aria-invalid={rgbDraft.length > 0 && !parseRgbField(rgbDraft)}
            onChange={(event) => editRgb(event.target.value)}
            onBlur={() => setRgbDraft(rgbField(visualColor))}
            placeholder="113, 55, 209"
          />
        </label>
      </div>
      <div className="color-inputs">
        <label>
          Cor do texto (opcional)
          <span className="inline-color-control">
            <input
              type="color"
              aria-label="Seletor de cor do texto"
              value={config.textColor || '#14131a'}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  textColor: event.target.value.toLowerCase(),
                }))
              }
            />
            <input
              type="text"
              aria-label="Cor do texto"
              maxLength={7}
              placeholder="Padrão do tema"
              value={config.textColor ?? ''}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  textColor: event.target.value || null,
                }))
              }
            />
          </span>
        </label>
        <label>
          Cor de fundo (opcional)
          <span className="inline-color-control">
            <input
              type="color"
              aria-label="Seletor de cor de fundo"
              value={config.backgroundColor || '#f7f7fa'}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  backgroundColor: event.target.value.toLowerCase(),
                }))
              }
            />
            <input
              type="text"
              aria-label="Cor de fundo"
              maxLength={7}
              placeholder="Padrão do tema"
              value={config.backgroundColor ?? ''}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  backgroundColor: event.target.value || null,
                }))
              }
            />
          </span>
        </label>
      </div>
      <div className="color-reset-row">
        <button
          type="button"
          className="reset-color"
          onClick={() => {
            chooseColor(WORKSPACE_PURPLE);
            setConfig((current) => ({
              ...current,
              textColor: null,
              backgroundColor: null,
              brandPrimaryColor: null,
              brandSecondaryColor: null,
            }));
          }}
        >
          Restaurar roxo padrão
        </button>
      </div>
    </div>
  );
}

export function IdentityBackupCard({
  canRestoreDefaults,
  restoreHublinkDefaults,
  saving,
  exportConfig,
  importConfig,
}: Pick<
  AuthenticatedWorkspace,
  'restoreHublinkDefaults' | 'saving' | 'exportConfig' | 'importConfig'
> & {
  canRestoreDefaults: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="setting-group transfer-group">
      <h3>Levar configuração</h3>
      <p className="setting-help">
        Exporte para reutilizar ou importe um arquivo Hublink. O arquivo pode conter a logo e os
        links.
      </p>
      <div className="transfer-actions">
        <button type="button" className="button button-small" onClick={exportConfig}>
          Exportar JSON
        </button>
        <label htmlFor="config-import" className="button button-small">
          Importar JSON
        </label>
        <input
          id="config-import"
          className="visually-hidden"
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            void importConfig(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </div>
      {canRestoreDefaults && (
        <button
          type="button"
          className="reset-button"
          disabled={saving}
          onClick={() => setConfirming(true)}
        >
          Restaurar padrão Hublink
        </button>
      )}
      {confirming && (
        <ModalDialog
          titleId="identity-reset-dialog-title"
          chip="Personalização"
          title="Restaurar padrão Hublink"
          description="Nome, textos, logo e cores voltam ao padrão Hublink e são salvos para toda a equipe. Links e layout da Home são mantidos."
          onClose={() => setConfirming(false)}
        >
          <div className="hublink-modal-actions">
            <button
              type="button"
              className="button button-danger"
              onClick={() => {
                setConfirming(false);
                void restoreHublinkDefaults();
              }}
            >
              Confirmar restauração
            </button>
            <button
              type="button"
              className="button button-plain"
              onClick={() => setConfirming(false)}
            >
              Cancelar
            </button>
          </div>
        </ModalDialog>
      )}
    </div>
  );
}
