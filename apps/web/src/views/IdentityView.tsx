import { HomeLayoutCard } from '../components/identity/HomeLayoutCard';
import type { AuthenticatedWorkspace } from '../hooks/useWorkspace';
import { IdentityPreviewBanner } from '../components/identity/IdentityPreviewBanner';
import { BrandTextSettingsCard } from '../components/identity/BrandTextSettingsCard';
import { LogoUploadCard } from '../components/identity/LogoUploadCard';
import { ColorPaletteCard, IdentityBackupCard } from '../components/identity/ColorPaletteCard';

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
  resetPersonalPreferences,
  preferences,
  updatePreferences,
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
  | 'resetPersonalPreferences'
  | 'preferences'
  | 'updatePreferences'
  | 'notice'
>) {
  const monogram = (config.companyName || 'S').slice(0, 1).toUpperCase();

  return (
    <>
      {page === 'identidade' && (
        <section aria-labelledby="identity-title">
          <div className="hb-page-intro">
            <h1 id="identity-title">Personalização do seu hub</h1>
            <p>
              Ajuste nome da empresa, textos da tela inicial, logo com prévia Light/Dark e paleta de
              cores.
            </p>
          </div>
          {currentUser.role === 'attendant' && (
            <p role="note">
              Personalização pessoal — suas cores, logo e textos são aplicados apenas à sua conta. O
              catálogo padrão da empresa permanece protegido.
            </p>
          )}
          {currentUser.role === 'admin' && (
            <p>Preset Global da Empresa — cores, logo e textos padrão da equipe.</p>
          )}
          {currentUser.role === 'attendant' && (
            <button type="button" onClick={() => void resetPersonalPreferences()}>
              Restaurar padrão da empresa
            </button>
          )}
          <div className="hb-identity-grid">
            <IdentityPreviewBanner config={config} style={style} />

            <div className="hb-identity-column">
              <BrandTextSettingsCard
                config={config}
                setConfig={setConfig}
                visualColor={visualColor}
              />

              <HomeLayoutCard
                layout={
                  currentUser.role === 'admin'
                    ? (config.homeLayout ?? 'grid')
                    : preferences.homeLayout
                }
                showShortcuts={
                  currentUser.role === 'admin'
                    ? (config.showShortcutCards ?? true)
                    : preferences.showShortcutCards
                }
                shortcutStyle={preferences.shortcutStyle}
                onLayout={(homeLayout) =>
                  currentUser.role === 'admin'
                    ? setConfig((current) => ({ ...current, homeLayout }))
                    : void updatePreferences({ homeLayout }).catch(() =>
                        setNotice('Não foi possível salvar suas preferências.'),
                      )
                }
                onShowShortcuts={(showShortcutCards) =>
                  currentUser.role === 'admin'
                    ? setConfig((current) => ({ ...current, showShortcutCards }))
                    : void updatePreferences({ showShortcutCards }).catch(() =>
                        setNotice('Não foi possível salvar suas preferências.'),
                      )
                }
                onShortcutStyle={(shortcutStyle) =>
                  void updatePreferences({ shortcutStyle }).catch(() =>
                    setNotice('Não foi possível salvar suas preferências.'),
                  )
                }
              />

              <IdentityBackupCard
                setConfig={setConfig}
                exportConfig={exportConfig}
                importConfig={importConfig}
                setColorChosen={setColorChosen}
                setNotice={setNotice}
              />
            </div>

            <div className="hb-identity-column">
              <LogoUploadCard
                logoDataUrl={config.logoDataUrl}
                monogram={monogram}
                dragging={draggingLogo}
                setDragging={setDraggingLogo}
                onUpload={uploadLogo}
                onRemove={() => setConfig((current) => ({ ...current, logoDataUrl: null }))}
              />

              <ColorPaletteCard
                config={config}
                setConfig={setConfig}
                visualColor={visualColor}
                chooseColor={chooseColor}
                hexDraft={hexDraft}
                editHex={editHex}
                setHexDraft={setHexDraft}
                rgbDraft={rgbDraft}
                editRgb={editRgb}
                setRgbDraft={setRgbDraft}
              />
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
