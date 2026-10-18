import {
  DEFAULT_CONFIG,
  DEFAULT_HEADER_TAGLINE,
  DEFAULT_HOME_EYEBROW,
  DEFAULT_HOME_TITLE,
  brandInk,
  hexToRgb,
  rgbToCss,
  rgbToHex,
} from '../config';
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
  const monogram = (config.companyName || 'S').slice(0, 1).toUpperCase();
  const hasBicolor = Boolean(config.brandPrimaryText?.trim() || config.brandSecondaryText?.trim());

  return (
    <>
      {page === 'identidade' && currentUser.role === 'admin' && (
        <section aria-labelledby="identity-title">
          <div className="hb-page-intro">
            <h1 id="identity-title">Personalização do seu hub</h1>
            <p>
              Ajuste nome da empresa, textos da tela inicial, logo com prévia Light/Dark e paleta de
              cores.
            </p>
          </div>
          <div className="hb-identity-grid">
            <div className="hb-identity-preview" aria-label="Prévia da marca" style={style}>
              <div className="hb-identity-preview-brand">
                <span className="logo-preview">
                  {config.logoDataUrl ? (
                    <img src={config.logoDataUrl} alt="Prévia da logo" />
                  ) : (
                    monogram
                  )}
                </span>
                <div className="hb-identity-preview-titles">
                  <strong>
                    {hasBicolor ? (
                      <span className="hb-brand-bicolor">
                        {config.brandPrimaryText?.trim() && (
                          <span
                            style={
                              config.brandPrimaryColor
                                ? { color: config.brandPrimaryColor }
                                : undefined
                            }
                          >
                            {config.brandPrimaryText.trim()}
                          </span>
                        )}
                        {config.brandPrimaryText?.trim() && config.brandSecondaryText?.trim()
                          ? ' '
                          : ''}
                        {config.brandSecondaryText?.trim() && (
                          <span
                            style={
                              config.brandSecondaryColor
                                ? { color: config.brandSecondaryColor }
                                : undefined
                            }
                          >
                            {config.brandSecondaryText.trim()}
                          </span>
                        )}
                      </span>
                    ) : (
                      config.companyName
                    )}
                  </strong>
                  <small className="hb-preview-tagline">
                    {config.headerTagline || DEFAULT_HEADER_TAGLINE}
                  </small>
                </div>
              </div>
              <div className="hb-identity-preview-hero">
                <span className="hb-eyebrow">{config.homeEyebrow || DEFAULT_HOME_EYEBROW}</span>
                <b className="hb-identity-preview-headline">
                  {config.homeTitle || DEFAULT_HOME_TITLE}
                </b>
                <p>{config.subtitle}</p>
              </div>
              <div className="hb-identity-preview-meta">
                <span className="hb-badge hb-badge-accent">Prévia em tempo real</span>
                <small>
                  {config.companyName} · {new Date().getFullYear()}
                </small>
              </div>
            </div>

            <div className="hb-identity-column">
              <div className="setting-group">
                <h3>Nome da empresa e textos</h3>
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

                <div className="bicolor-brand-box">
                  <div className="bicolor-brand-head">
                    <span className="setting-label">
                      Nome bicolor na barra de navegação (opcional)
                    </span>
                    <small className="setting-help">
                      Exemplo: <strong>Rural</strong> em uma cor e <strong>Conecta</strong> em
                      outra. Se ficar em branco, usa o Nome da empresa acima.
                    </small>
                  </div>
                  <div className="color-inputs">
                    <label>
                      Texto parte 1 (navbar)
                      <input
                        type="text"
                        maxLength={40}
                        placeholder="Ex: Rural"
                        value={config.brandPrimaryText ?? ''}
                        onChange={(event) =>
                          setConfig((current) => ({
                            ...current,
                            brandPrimaryText: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Cor parte 1
                      <span className="inline-color-control">
                        <input
                          type="color"
                          aria-label="Seletor cor parte 1"
                          value={config.brandPrimaryColor || rgbToHex(visualColor)}
                          onChange={(event) =>
                            setConfig((current) => ({
                              ...current,
                              brandPrimaryColor: event.target.value.toLowerCase(),
                            }))
                          }
                        />
                        <input
                          type="text"
                          aria-label="Cor parte 1 hexadecimal"
                          maxLength={7}
                          placeholder="#1F568B"
                          value={config.brandPrimaryColor ?? ''}
                          onChange={(event) =>
                            setConfig((current) => ({
                              ...current,
                              brandPrimaryColor: event.target.value || null,
                            }))
                          }
                        />
                      </span>
                    </label>
                  </div>
                  <div className="color-inputs">
                    <label>
                      Texto parte 2 (navbar)
                      <input
                        type="text"
                        maxLength={40}
                        placeholder="Ex: Conecta"
                        value={config.brandSecondaryText ?? ''}
                        onChange={(event) =>
                          setConfig((current) => ({
                            ...current,
                            brandSecondaryText: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Cor parte 2
                      <span className="inline-color-control">
                        <input
                          type="color"
                          aria-label="Seletor cor parte 2"
                          value={config.brandSecondaryColor || '#102333'}
                          onChange={(event) =>
                            setConfig((current) => ({
                              ...current,
                              brandSecondaryColor: event.target.value.toLowerCase(),
                            }))
                          }
                        />
                        <input
                          type="text"
                          aria-label="Cor parte 2 hexadecimal"
                          maxLength={7}
                          placeholder="#102333"
                          value={config.brandSecondaryColor ?? ''}
                          onChange={(event) =>
                            setConfig((current) => ({
                              ...current,
                              brandSecondaryColor: event.target.value || null,
                            }))
                          }
                        />
                      </span>
                    </label>
                  </div>
                </div>

                <div className="color-inputs">
                  <label>
                    Selo do cabeçalho (navbar)
                    <input
                      type="text"
                      maxLength={60}
                      placeholder={DEFAULT_HEADER_TAGLINE}
                      value={config.headerTagline ?? DEFAULT_HEADER_TAGLINE}
                      onChange={(event) =>
                        setConfig((current) => ({
                          ...current,
                          headerTagline: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    Selo da tela inicial
                    <input
                      type="text"
                      maxLength={60}
                      placeholder={DEFAULT_HOME_EYEBROW}
                      value={config.homeEyebrow ?? DEFAULT_HOME_EYEBROW}
                      onChange={(event) =>
                        setConfig((current) => ({
                          ...current,
                          homeEyebrow: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>

                <label style={{ marginTop: '14px' }}>
                  Título da tela inicial
                  <input
                    type="text"
                    maxLength={120}
                    placeholder={DEFAULT_HOME_TITLE}
                    value={config.homeTitle ?? DEFAULT_HOME_TITLE}
                    onChange={(event) =>
                      setConfig((current) => ({
                        ...current,
                        homeTitle: event.target.value,
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
            </div>

            <div className="hb-identity-column">
              <div className="setting-group identity-logo-card">
                <div className="logo-setting-head">
                  <div>
                    <h3>Logo da empresa</h3>
                    <small className="logo-resolution-hint">
                      Resolução recomendada: <strong>256×256 px</strong> (símbolo 1:1) ou{' '}
                      <strong>320×96 px</strong> (horizontal) · PNG, JPG ou WebP · até 1 MB
                    </small>
                  </div>
                </div>
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
                  <div
                    className="logo-theme-previews"
                    aria-label="Prévia da logo nos modos claro e escuro"
                  >
                    <div className="logo-theme-box logo-theme-light">
                      <span className="logo-theme-tag">Light mode</span>
                      <span className="logo-dropzone-preview">
                        {config.logoDataUrl ? (
                          <img src={config.logoDataUrl} alt="Logo enviada" />
                        ) : (
                          <span>{monogram}</span>
                        )}
                      </span>
                    </div>
                    <div className="logo-theme-box logo-theme-dark">
                      <span className="logo-theme-tag">Dark mode</span>
                      <span className="logo-dropzone-preview">
                        {config.logoDataUrl ? (
                          <img src={config.logoDataUrl} alt="" />
                        ) : (
                          <span>{monogram}</span>
                        )}
                      </span>
                    </div>
                  </div>
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
                      }));
                    }}
                  >
                    Restaurar roxo padrão
                  </button>
                </div>
              </div>
            </div>

            <div className="hb-identity-footer">
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
