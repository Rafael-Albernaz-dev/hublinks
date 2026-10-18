import { useState } from 'react';
import type { AuthenticatedWorkspace } from '../hooks/useWorkspace';
import type { ExtensionSettings } from '../types';
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
      setNotice('Pacote baixado. Extraia o ZIP antes de carregar a pasta no Chrome.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível baixar o pacote.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <ModalDialog
      titleId="extension-dialog-title"
      chip="Extensão Hublink"
      title="Central da Extensão & Inicialização no Chrome"
      description="Instale, conecte e escolha como abrir seu Workspace neste navegador."
      onClose={close}
    >
      <div className="extension-center">
        <p className={'extension-connection is-' + extensionState} role="status">
          {extensionState === 'detected'
            ? 'Extensão conectada ao Workspace.'
            : extensionState === 'checking'
              ? 'Verificando conexão com a extensão…'
              : 'Extensão não conectada. Siga os passos para instalar ou recarregar.'}
        </p>
        {extensionState !== 'detected' && (
          <>
            <ol className="extension-steps">
              <li>
                <strong>1. Baixe e extraia</strong>
                <span>Salve o pacote e extraia os arquivos em uma pasta permanente.</span>
              </li>
              <li>
                <strong>2. Carregue no Chrome</strong>
                <span>
                  Abra <code>chrome://extensions</code>, ative o Modo do desenvolvedor e use
                  “Carregar sem compactação”. Selecione a pasta extraída que contém manifest.json.
                </span>
              </li>
              <li>
                <strong>3. Conecte ao Hub</strong>
                <span>Recarregue a extensão após atualizações e verifique a conexão abaixo.</span>
              </li>
            </ol>
            <button
              className="button button-primary"
              type="button"
              disabled={busy}
              onClick={() => void download()}
            >
              Baixar pacote da extensão (.zip)
            </button>
            <div className="extension-copy-actions">
              <button
                className="button"
                type="button"
                onClick={() => void copy('chrome://extensions')}
              >
                Copiar endereço chrome://extensions
              </button>
              <button
                className="button"
                type="button"
                onClick={() => void copy('apps/extension/dist')}
              >
                Copiar caminho local (apps/extension/dist)
              </button>
            </div>
            <small>
              O caminho local é relativo ao projeto. Para instalar o download, escolha a pasta que
              você extraiu.
            </small>
          </>
        )}
        <button
          className="button"
          type="button"
          disabled={extensionState === 'checking'}
          onClick={() =>
            void recheckExtension().then((ready) =>
              setNotice(
                ready
                  ? 'Conexão confirmada.'
                  : 'Conexão indisponível. Instale ou recarregue a extensão.',
              ),
            )
          }
        >
          Verificar conexão agora
        </button>
        <fieldset className="extension-options" disabled={extensionState !== 'detected' || busy}>
          <legend>Hublink ao iniciar o Chrome</legend>
          {(
            [
              ['openOnStartup', 'Abrir o Hublink automaticamente ao iniciar o Chrome'],
              ['openOnNewTab', 'Abrir o Hublink ao criar uma Nova Guia'],
              ['showToastNotifications', 'Mostrar avisos visuais de preenchimento assistido'],
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
        </fieldset>
        <p className="setting-help">
          As opções são deste perfil do Chrome. Inicialização e Nova Guia ficam desativadas até você
          ativá-las. CAPTCHA, 2FA e envio do formulário continuam manuais.
        </p>
        <p className="notice" role="status" aria-live="polite">
          {notice}
        </p>
        {extensionModal?.targetUrl && (
          <button
            className="button button-outline"
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
