import { useState } from 'react';
import type { AuthenticatedWorkspace } from '../hooks/useWorkspace';
import type { ExtensionSettings } from '../types';
import { Icon } from '../icons';
import { ModalDialog } from '../components/ModalDialog';

export function ExtensionModal({
  setShowExtensionGuide,
  setExtensionModal,
  extensionModal,
  extensionState,
  extensionSettings,
  updateExtensionSettings,
  recheckExtension,
  downloadExtensionPackage,
}: Pick<
  AuthenticatedWorkspace,
  | 'setShowExtensionGuide'
  | 'setExtensionModal'
  | 'extensionModal'
  | 'extensionState'
  | 'extensionSettings'
  | 'updateExtensionSettings'
  | 'recheckExtension'
  | 'downloadExtensionPackage'
>) {
  const [notice, setNotice] = useState('');
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const close = () => {
    setShowExtensionGuide(false);
    setExtensionModal(null);
  };
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice('Copiado: ' + value);
    } catch {
      setNotice('Não foi possível copiar. Selecione e copie: ' + value);
    }
  }
  async function save(key: keyof ExtensionSettings, value: boolean) {
    setBusy(true);
    setNotice('');
    try {
      await updateExtensionSettings({ [key]: value });
      setNotice('Opção salva na extensão.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível salvar a opção.');
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    setBusy(true);
    setNotice('');
    try {
      await downloadExtensionPackage();
      setNotice('Pacote baixado. Extraia o ZIP.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível baixar o pacote.');
    } finally {
      setBusy(false);
    }
  }
  const configuredStore = import.meta.env.VITE_CHROME_WEBSTORE_URL?.trim();
  let storeUrl: string | undefined;
  try {
    const url = new URL(configuredStore || '');
    if (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === 'chromewebstore.google.com' ||
        (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore/')))
    )
      storeUrl = url.href;
  } catch {
    /* Offline installation remains available. */
  }
  return (
    <ModalDialog
      titleId="extension-dialog-title"
      chip="Extensão Hublink"
      title="Central da Extensão"
      onClose={close}
    >
      <div className="extension-center extension-center-wide">
        <div className="extension-installation">
          <p className={'extension-connection is-' + extensionState} role="status">
            {extensionState === 'detected'
              ? 'Conectada e pronta'
              : extensionState === 'checking'
                ? 'Verificando conexão…'
                : 'Extensão desconectada'}
          </p>
          {extensionState !== 'detected' && (
            <>
              {storeUrl && !offline ? (
                <div className="extension-store">
                  <a
                    className="button button-primary"
                    href={storeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Icon name="ExternalLink" />
                    Adicionar ao Chrome (1 clique)
                  </a>
                  <button className="text-button" type="button" onClick={() => setOffline(true)}>
                    Instalação offline (.zip)
                  </button>
                </div>
              ) : (
                <>
                  <ol className="extension-steps">
                    <li>
                      <strong>1. Baixar</strong>
                      <button
                        className="button button-primary"
                        type="button"
                        disabled={busy}
                        onClick={() => void download()}
                      >
                        <Icon name="Download" />
                        Baixar extensão (.zip)
                      </button>
                    </li>
                    <li>
                      <strong>2. Extrair e carregar</strong>
                      <span>
                        Extraia o ZIP. No Chrome, ative o modo desenvolvedor e escolha “Carregar sem
                        compactação”.
                      </span>
                      <button
                        className="button"
                        type="button"
                        onClick={() => void copy('chrome://extensions')}
                      >
                        Copiar chrome://extensions
                      </button>
                    </li>
                    <li>
                      <strong>3. Conectar</strong>
                      <span>Verifique a conexão abaixo.</span>
                    </li>
                  </ol>
                  {storeUrl && (
                    <button className="text-button" type="button" onClick={() => setOffline(false)}>
                      Voltar à Chrome Web Store
                    </button>
                  )}
                </>
              )}
            </>
          )}
          <button
            className="button button-primary"
            type="button"
            disabled={extensionState === 'checking'}
            onClick={() =>
              void recheckExtension().then((ready) =>
                setNotice(ready ? 'Conexão confirmada.' : 'Instale ou recarregue a extensão.'),
              )
            }
          >
            <Icon
              name="RefreshCw"
              className={extensionState === 'checking' ? 'lucide extension-spin' : 'lucide'}
            />
            Verificar conexão agora
          </button>
        </div>
        <fieldset className="extension-options" disabled={extensionState !== 'detected' || busy}>
          <legend>Configurações do Chrome</legend>
          {(
            [
              ['openOnStartup', 'Abrir Hublink ao iniciar o Chrome'],
              ['openOnNewTab', 'Abrir Hublink em uma Nova Guia'],
              ['showToastNotifications', 'Avisos de preenchimento assistido'],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={extensionSettings[key]}
                onChange={(event) => void save(key, event.target.checked)}
              />
              {label}
            </label>
          ))}
          {extensionState !== 'detected' && <small>Conecte a extensão para editar.</small>}
        </fieldset>
        {notice && (
          <p className="notice extension-center-notice" role="status" aria-live="polite">
            {notice}
          </p>
        )}
        {extensionModal?.targetUrl && (
          <button
            className="button button-outline extension-center-notice"
            type="button"
            onClick={() => {
              window.open(extensionModal.targetUrl!, '_blank', 'noopener,noreferrer');
              close();
            }}
          >
            Abrir destino mesmo assim (login manual)
          </button>
        )}
      </div>
    </ModalDialog>
  );
}
