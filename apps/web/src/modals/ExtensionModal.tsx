import type { AuthenticatedWorkspace } from '../hooks/useWorkspace';
export function ExtensionModal({
  dialogRef,
  setShowExtensionGuide,
  setExtensionModal,
  extensionModal,
}: Pick<
  AuthenticatedWorkspace,
  'dialogRef' | 'setShowExtensionGuide' | 'setExtensionModal' | 'extensionModal'
>) {
  return (
    <>
      <div className="extension-overlay" role="presentation">
        <div
          className="extension-dialog"
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="extension-dialog-title"
        >
          <button
            type="button"
            className="extension-close"
            aria-label="Fechar"
            onClick={() => {
              setShowExtensionGuide(false);
              setExtensionModal(null);
            }}
          >
            ×
          </button>
          <h2 id="extension-dialog-title">Extensão do Hublink necessária</h2>
          <p>
            Para preencher as credenciais deste sistema automaticamente, instale a extensão do
            Chrome.
          </p>
          <p>
            Em Chrome, abra <code>chrome://extensions</code>, ative o modo do desenvolvedor, escolha
            “Carregar sem compactação” e selecione <code>apps/extension/dist</code>. Depois
            recarregue o Hub.
          </p>
          <a
            className="button button-primary"
            href="chrome://extensions"
            target="_blank"
            rel="noopener noreferrer"
          >
            Como instalar / Baixar extensão
          </a>
          {extensionModal?.targetUrl && (
            <button
              type="button"
              className="button button-outline"
              onClick={() => {
                window.open(extensionModal.targetUrl!, '_blank', 'noopener,noreferrer');
                setShowExtensionGuide(false);
                setExtensionModal(null);
              }}
            >
              Abrir destino mesmo assim (login manual)
            </button>
          )}
        </div>
      </div>
    </>
  );
}
