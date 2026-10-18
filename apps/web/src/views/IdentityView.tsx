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
          <div className="hb-layout-switcher" role="group" aria-label="Preferências da Home">
            <label>
              Organização da Home
              <select
                value={
                  currentUser.role === 'admin'
                    ? (config.homeLayout ?? 'grid')
                    : preferences.homeLayout
                }
                onChange={(event) =>
                  currentUser.role === 'admin'
                    ? setConfig((current) => ({
                        ...current,
                        homeLayout: event.target.value as 'grid' | 'list' | 'carousel',
                      }))
                    : void updatePreferences({
                        homeLayout: event.target.value as 'grid' | 'list' | 'carousel',
                      }).catch(() => setNotice('Não foi possível salvar suas preferências.'))
                }
              >
                <option value="grid">Grade</option>
                <option value="list">Lista</option>
                <option value="carousel">Carrossel</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={
                  currentUser.role === 'admin'
                    ? (config.showShortcutCards ?? true)
                    : preferences.showShortcutCards
                }
                onChange={(event) =>
                  currentUser.role === 'admin'
                    ? setConfig((current) => ({
                        ...current,
                        showShortcutCards: event.target.checked,
                      }))
                    : void updatePreferences({ showShortcutCards: event.target.checked }).catch(
                        () => setNotice('Não foi possível salvar suas preferências.'),
                      )
                }
              />
              Mostrar atalhos
            </label>
          </div>
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
