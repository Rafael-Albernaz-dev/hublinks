import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { useWorkspace } from './hooks/useWorkspace';
import { ExtensionModal } from './modals/ExtensionModal';
import { VaultCredentialModal } from './modals/VaultCredentialModal';
import './theme.css';
import { AccessView } from './views/AccessView';
import { CatalogView } from './views/CatalogView';
import { HomeView } from './views/HomeView';
import { IdentityView } from './views/IdentityView';
import { LoginView } from './views/LoginView';
import { TeamView } from './views/TeamView';
export function App() {
  const workspace = useWorkspace();
  if (!workspace.authChecked)
    return (
      <div className="auth-screen">
        <p>Verificando sessão...</p>
      </div>
    );
  if (!workspace.currentUser) return <LoginView {...workspace} />;
  const model = { ...workspace, currentUser: workspace.currentUser };
  const { style, apiState, openingNotice, page, vaultNotice, config } = model;
  return (
    <div className="site-shell" style={style}>
      {model.showExtensionGuide && <ExtensionModal {...model} />}
      {model.individualModal && (
        <VaultCredentialModal {...model} individualModal={model.individualModal} />
      )}
      {apiState === 'offline' && (
        <div className="api-error" role="alert">
          Não foi possível conectar à API do Hublink. Inicie o servidor local com 'npm run dev:api'
          para carregar e gerenciar a configuração.
        </div>
      )}

      <Header {...model} />
      <Navigation {...model} />
      <main className="hb-main" id="inicio">
        <HomeView {...model} />

        <CatalogView {...model} />
        <AccessView {...model} />
        <TeamView {...model} />
        <IdentityView {...model} />
        {openingNotice && (
          <p role="status" className="notice">
            {openingNotice}
          </p>
        )}
        {page !== 'cofre' && vaultNotice && (
          <p role="status" className="notice">
            {vaultNotice}
          </p>
        )}
      </main>
      <footer className="hb-footer">
        {config.companyName} · {new Date().getFullYear()}
      </footer>
    </div>
  );
}
