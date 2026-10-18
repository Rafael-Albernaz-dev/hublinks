import type { AuthenticatedWorkspace } from '../hooks/useWorkspace';
import { Icon } from '../icons';
export function Header({
  setPage,
  config,
  setExtensionModal,
  setShowExtensionGuide,
  extensionState,
  currentUser,
  setTheme,
  theme,
  authBusy,
  logout,
}: Pick<
  AuthenticatedWorkspace,
  | 'setPage'
  | 'config'
  | 'setExtensionModal'
  | 'setShowExtensionGuide'
  | 'extensionState'
  | 'currentUser'
  | 'setTheme'
  | 'theme'
  | 'authBusy'
  | 'logout'
>) {
  return (
    <>
      <header className="hb-header">
        <a
          className="hb-brand"
          href="#inicio"
          onClick={(e) => {
            e.preventDefault();
            setPage('inicio');
          }}
          aria-label="Voltar ao início do hub"
        >
          <span className="hb-monogram">
            {config.logoDataUrl ? (
              <img src={config.logoDataUrl} alt="" />
            ) : (
              config.companyName.slice(0, 1).toUpperCase()
            )}
          </span>
          <span>
            {config.companyName || 'Sua empresa'}
            <small className="hb-brand-sub">HUB DA EQUIPE</small>
          </span>
        </a>
        <button
          type="button"
          className="extension-status"
          onClick={() => {
            setExtensionModal(null);
            setShowExtensionGuide(true);
          }}
        >
          {extensionState === 'detected'
            ? 'Extensão ativa'
            : extensionState === 'checking'
              ? 'Verificando extensão'
              : 'Instalar extensão'}
        </button>
        <div className="header-user">
          <span className="hb-account">
            {currentUser.displayName}
            <small>{currentUser.role === 'admin' ? 'Admin' : 'Atendente'}</small>
          </span>
          <div className="account-actions">
            <button
              className="hb-icon-button"
              type="button"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              aria-label={theme === 'light' ? 'Mudar para tema escuro' : 'Mudar para tema claro'}
              title={theme === 'light' ? 'Tema escuro' : 'Tema claro'}
            >
              <Icon name={theme === 'light' ? 'Moon' : 'Sun'} />
            </button>
            <button
              className="hb-icon-button"
              type="button"
              disabled={authBusy}
              onClick={() => void logout()}
              aria-label="Sair da conta"
              title="Sair"
            >
              <Icon name="LogOut" />
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
