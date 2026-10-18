import { DEFAULT_CONFIG, brandInk, hexToRgb, rgbToCss, rgbToHex } from '../config';
import { WORKSPACE_PURPLE, parseHexField, parseRgbField, rgbField } from '../hooks/identityFields';
import type { AuthenticatedWorkspace } from '../hooks/useWorkspace';
export function IdentityView({
  page,
  currentUser,
  style,
  config,
  setConfig,
  draggingLogo,
  setDraggingLogo,
  uploadLogo,
  visualColor,
  chooseColor,
  hexDraft,
  editHex,
  setHexDraft,
  rgbDraft,
  editRgb,
  setRgbDraft,
  exportConfig,
  importConfig,
  setColorChosen,
  setNotice,
  isDirty,
  saving,
  saveConfig,
  notice,
}: Pick<
  AuthenticatedWorkspace,
  | 'page'
  | 'currentUser'
  | 'style'
  | 'config'
  | 'setConfig'
  | 'draggingLogo'
  | 'setDraggingLogo'
  | 'uploadLogo'
  | 'visualColor'
  | 'chooseColor'
  | 'hexDraft'
  | 'editHex'
  | 'setHexDraft'
  | 'rgbDraft'
  | 'editRgb'
  | 'setRgbDraft'
  | 'exportConfig'
  | 'importConfig'
  | 'setColorChosen'
  | 'setNotice'
  | 'isDirty'
  | 'saving'
  | 'saveConfig'
  | 'notice'
>) {
  return (
    <>
      {page === 'identidade' && currentUser.role === 'admin' && (
        <section aria-labelledby="identity-title">
          <div className="hb-page-intro">
            <h1 id="identity-title">Identidade do seu hub</h1>
            <p>Uma marca horizontal para o cabeçalho. Um símbolo para espaços compactos.</p>
          </div>
          <div className="hb-identity-grid">
            <div className="hb-identity-preview" aria-label="Prévia da marca" style={style}>
              <span className="logo-preview">
                {config.logoDataUrl ? (
                  <img src={config.logoDataUrl} alt="Prévia da logo" />
                ) : (
                  config.companyName.slice(0, 1).toUpperCase()
                )}
              </span>
              <strong>{config.companyName}</strong>
              <p>{config.subtitle}</p>
            </div>
            <div>
              {' '}
              <div className="setting-group">
                <h3>Identidade</h3>
                <label>
                  Nome da empresa
                  <input
                    value={config.companyName}
                    maxLength={60}
                    onChange={(event) =>
                      setConfig((current) => ({ ...current, companyName: event.target.value }))
                    }
                    onBlur={() =>
                      setConfig((current) => ({
                        ...current,
                        companyName: current.companyName.trim() || DEFAULT_CONFIG.companyName,
                      }))
                    }
                  />
                </label>
                <label>
                  Texto de apresentação
                  <textarea
                    value={config.subtitle}
                    maxLength={160}
                    rows={2}
                    onChange={(event) =>
                      setConfig((current) => ({ ...current, subtitle: event.target.value }))
                    }
                  />
                </label>
              </div>
              <div className="setting-group identity-logo-card">
                <h3>Logo da empresa</h3>
                <div
                  className={'logo-dropzone' + (draggingLogo ? ' is-dragging' : '')}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDraggingLogo(true);
                  }}
                  onDragLeave={() => setDraggingLogo(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDraggingLogo(false);
                    uploadLogo(event.dataTransfer.files[0]);
                  }}
                >
                  <span className="logo-dropzone-preview">
                    {config.logoDataUrl ? (
                      <img src={config.logoDataUrl} alt="Logo enviada" />
                    ) : (
                      <span>{config.companyName.slice(0, 1).toUpperCase()}</span>
                    )}
                  </span>
                  <div className="logo-dropzone-actions">
                    <label className="button button-primary" htmlFor="logo-upload">
                      Enviar nova logo
                    </label>
                    <input
                      id="logo-upload"
                      className="visually-hidden"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => {
                        uploadLogo(event.target.files?.[0]);
                        event.target.value = '';
                      }}
                    />
                    {config.logoDataUrl && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setConfig((current) => ({ ...current, logoDataUrl: null }))}
                      >
                        Remover logo
                      </button>
                    )}
                  </div>
                  <small>
                    Arraste uma imagem ou escolha um arquivo. PNG, JPG ou WebP · até 1 MB
                  </small>
                </div>
              </div>
              <div className="setting-group identity-color-card">
                <h3>Cor da marca</h3>
                <div
                  className="color-showcase"
                  style={{ background: rgbToCss(visualColor), color: brandInk(visualColor) }}
                >
                  <strong>Hublink</strong>
                  <span>Prévia de contraste</span>
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
                <button
                  type="button"
                  className="reset-color"
                  onClick={() => chooseColor(WORKSPACE_PURPLE)}
                >
                  Restaurar roxo padrão
                </button>
              </div>
              <div className="setting-group transfer-group">
                <h3>Levar configuração</h3>
                <p className="setting-help">
                  Exporte para reutilizar ou importe um arquivo Hublink. O arquivo pode conter a
                  logo e os links.
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
                <button
                  type="button"
                  className="reset-button"
                  onClick={() => {
                    if (window.confirm('Restaurar a configuração de exemplo?')) {
                      setConfig(DEFAULT_CONFIG);
                      setColorChosen(false);
                      setNotice('Exemplo restaurado.');
                    }
                  }}
                >
                  Restaurar exemplo
                </button>
              </div>
              <div className="save-actions">
                <button
                  type="button"
                  className="button button-primary"
                  disabled={!isDirty || saving}
                  onClick={() => void saveConfig()}
                >
                  {saving ? 'Salvando...' : 'Salvar alterações'}
                </button>
                {isDirty && <span>Alterações pendentes</span>}
              </div>
              <p className="notice" aria-live="polite">
                {notice}
              </p>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
