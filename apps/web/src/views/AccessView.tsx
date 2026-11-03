import { useEffect, useState } from 'react';
import { SearchBar } from '../components/SearchBar';
import { normalizeSearch } from '../hooks/normalizeSearch';
import type { AuthenticatedWorkspace } from '../hooks/useWorkspace';
import { Icon } from '../icons';
import { ModalDialog } from '../modals/ServiceModal';

export function AccessView({
  page,
  vaultCredentials,
  currentUser,
  editingVaultKey,
  handleSaveVaultCredential,
  createStandaloneCredential,
  deleteStandaloneCredential,
  revealCredential,
  vaultUsername,
  setVaultUsername,
  vaultPassword,
  setVaultPassword,
  vaultBusy,
  setEditingVaultKey,
  vaultNotice,
}: Pick<
  AuthenticatedWorkspace,
  | 'page'
  | 'vaultCredentials'
  | 'currentUser'
  | 'editingVaultKey'
  | 'handleSaveVaultCredential'
  | 'createStandaloneCredential'
  | 'deleteStandaloneCredential'
  | 'revealCredential'
  | 'vaultUsername'
  | 'setVaultUsername'
  | 'vaultPassword'
  | 'setVaultPassword'
  | 'vaultBusy'
  | 'setEditingVaultKey'
  | 'vaultNotice'
>) {
  const [accessQuery, setAccessQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'shared' | 'individual'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'saved' | 'empty'>('all');
  const [copiedField, setCopiedField] = useState<'user' | 'pass' | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newCredName, setNewCredName] = useState('');
  const [newCredUsername, setNewCredUsername] = useState('');
  const [newCredPassword, setNewCredPassword] = useState('');

  const visibleCredentials = vaultCredentials.filter(
    (c) =>
      c.credentialType !== 'none' &&
      (currentUser.role === 'admin' ||
        c.credentialType === 'shared' ||
        c.ownerUserId === null ||
        c.ownerUserId === currentUser.id),
  );

  const filteredCredentials = visibleCredentials.filter((c) => {
    const ownerLabel =
      c.credentialType === 'shared' ? 'Equipe' : c.ownerName || currentUser.displayName;
    const matchesSearch = normalizeSearch(`${c.serviceName} ${ownerLabel} ${c.category}`).includes(
      normalizeSearch(accessQuery),
    );
    if (!matchesSearch) return false;
    if (typeFilter !== 'all' && c.credentialType !== typeFilter) return false;
    if (statusFilter === 'saved' && !c.credentialId) return false;
    if (statusFilter === 'empty' && Boolean(c.credentialId)) return false;
    return true;
  });

  const activeEditingItem = editingVaultKey
    ? visibleCredentials.find((c) => {
        const key = `${c.serviceId}:${c.credentialType === 'individual' ? (c.ownerUserId ?? currentUser.id) : 'shared'}`;
        return key === editingVaultKey;
      })
    : undefined;

  useEffect(() => {
    if (!activeEditingItem || !activeEditingItem.credentialId) return;
    let active = true;
    void revealCredential(activeEditingItem.serviceId, activeEditingItem.ownerUserId).then(
      (data) => {
        if (active && data) {
          setVaultUsername(data.username);
          setVaultPassword(data.password);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [editingVaultKey]);

  function copyText(text: string, field: 'user' | 'pass') {
    if (!text) return;
    void navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  async function handleAddStandaloneSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newCredName.trim() || !newCredUsername.trim() || !newCredPassword) return;
    const ok = await createStandaloneCredential(
      newCredName.trim(),
      newCredUsername.trim(),
      newCredPassword,
    );
    if (ok) {
      setShowAddModal(false);
      setNewCredName('');
      setNewCredUsername('');
      setNewCredPassword('');
    }
  }

  return (
    <>
      {page === 'cofre' && (
        <section aria-labelledby="access-title">
          <div className="hb-page-intro">
            <h1 id="access-title">Acessos da equipe</h1>
            <p>Credenciais por serviço e responsável. Senhas não aparecem nesta lista.</p>
          </div>
          <div className="catalog-toolbar">
            <SearchBar value={accessQuery} onChange={setAccessQuery} label="Buscar nos acessos" />
            <div className="hb-filter-group" role="group" aria-label="Filtros de acessos">
              <select
                className="hb-filter-select"
                aria-label="Filtrar por tipo de credencial"
                value={typeFilter}
                onChange={(event) =>
                  setTypeFilter(event.target.value as 'all' | 'shared' | 'individual')
                }
              >
                <option value="all">Todos os tipos</option>
                <option value="shared">Compartilhada</option>
                <option value="individual">Individual</option>
              </select>
              <select
                className="hb-filter-select"
                aria-label="Filtrar por status do cofre"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as 'all' | 'saved' | 'empty')
                }
              >
                <option value="all">Todos os status</option>
                <option value="saved">Cifrada no cofre</option>
                <option value="empty">Não cadastrada</option>
              </select>
            </div>
            <button
              type="button"
              className="button button-primary"
              onClick={() => {
                setShowAddModal(true);
                setNewCredName('');
                setNewCredUsername('');
                setNewCredPassword('');
              }}
            >
              <Icon name="Plus" />
              Adicionar credencial
            </button>
          </div>

          {showAddModal && (
            <ModalDialog
              titleId="vault-add-standalone-dialog-title"
              chip="Cofre individual avulso · AES-256-GCM"
              title="Adicionar credencial ao cofre"
              description="Cadastre usuário e senha de outros serviços externos. Esta credencial fica visível exclusivamente para a sua conta e não entra no catálogo geral."
              icon="LockKeyhole"
              onClose={() => setShowAddModal(false)}
            >
              <form className="hublink-modal-form" onSubmit={handleAddStandaloneSubmit}>
                <label className="hublink-form-label">
                  <span>Nome do serviço ou aplicação</span>
                  <input
                    className="hublink-input"
                    required
                    value={newCredName}
                    onChange={(e) => setNewCredName(e.target.value)}
                    placeholder="Ex: Servidor Mikrotik, Portal Parceiro"
                    autoFocus
                  />
                </label>
                <label className="hublink-form-label">
                  <span>Usuário</span>
                  <input
                    className="hublink-input"
                    required
                    value={newCredUsername}
                    onChange={(e) => setNewCredUsername(e.target.value)}
                    placeholder="Ex: admin@servidor"
                  />
                </label>
                <label className="hublink-form-label">
                  <span>Senha</span>
                  <input
                    className="hublink-input"
                    required
                    type="password"
                    value={newCredPassword}
                    onChange={(e) => setNewCredPassword(e.target.value)}
                    placeholder="Senha de acesso"
                  />
                </label>
                <div className="hublink-modal-actions">
                  <button type="submit" className="button button-primary" disabled={vaultBusy}>
                    Salvar no cofre
                  </button>
                  <button
                    type="button"
                    className="button button-plain"
                    onClick={() => setShowAddModal(false)}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </ModalDialog>
          )}

          {activeEditingItem && (
            <ModalDialog
              titleId="vault-manage-dialog-title"
              chip={
                activeEditingItem.inCatalog === false
                  ? 'Cofre individual avulso · AES-256-GCM'
                  : activeEditingItem.credentialType === 'shared'
                    ? 'Cofre compartilhado · AES-256-GCM'
                    : 'Cofre individual · AES-256-GCM'
              }
              title={`${activeEditingItem.credentialId ? 'Gerenciar' : 'Cadastrar'} ${activeEditingItem.serviceName}`}
              description={
                <>
                  Defina ou copie o usuário e a senha para{' '}
                  <strong>{activeEditingItem.serviceName}</strong> (Responsável:{' '}
                  {activeEditingItem.credentialType === 'shared'
                    ? 'Equipe'
                    : activeEditingItem.ownerName || currentUser.displayName}
                  ).
                </>
              }
              icon="LockKeyhole"
              onClose={() => {
                setEditingVaultKey(null);
                setVaultUsername('');
                setVaultPassword('');
              }}
            >
              <form
                className="hublink-modal-form"
                onSubmit={(e) =>
                  void handleSaveVaultCredential(
                    e,
                    activeEditingItem.serviceId,
                    activeEditingItem.ownerUserId,
                  )
                }
              >
                <div className="hublink-form-group">
                  <label htmlFor="vault-username-input" className="hublink-form-label">
                    <span>Usuário do serviço</span>
                  </label>
                  <div className="hb-input-action-row">
                    <input
                      id="vault-username-input"
                      className="hublink-input"
                      required
                      value={vaultUsername}
                      onChange={(e) => setVaultUsername(e.target.value)}
                      placeholder="Ex: operador@sva.local"
                    />
                    <button
                      type="button"
                      className="button button-plain hb-copy-btn"
                      onClick={() => copyText(vaultUsername, 'user')}
                      title="Copiar usuário"
                      aria-label="Copiar usuário"
                      disabled={!vaultUsername}
                    >
                      <Icon name={copiedField === 'user' ? 'Check' : 'Copy'} />
                      <span>{copiedField === 'user' ? 'Copiado!' : 'Copiar'}</span>
                    </button>
                  </div>
                </div>
                <div className="hublink-form-group">
                  <label htmlFor="vault-password-input" className="hublink-form-label">
                    <span>Senha do serviço</span>
                  </label>
                  <div className="hb-input-action-row">
                    <input
                      id="vault-password-input"
                      className="hublink-input"
                      required
                      type="password"
                      value={vaultPassword}
                      onChange={(e) => setVaultPassword(e.target.value)}
                      placeholder="Senha de acesso"
                    />
                    <button
                      type="button"
                      className="button button-plain hb-copy-btn"
                      onClick={() => copyText(vaultPassword, 'pass')}
                      title="Copiar senha"
                      aria-label="Copiar senha"
                      disabled={!vaultPassword}
                    >
                      <Icon name={copiedField === 'pass' ? 'Check' : 'Copy'} />
                      <span>{copiedField === 'pass' ? 'Copiado!' : 'Copiar'}</span>
                    </button>
                  </div>
                </div>
                <div className="hublink-modal-actions">
                  <button type="submit" className="button button-primary" disabled={vaultBusy}>
                    Salvar no cofre
                  </button>
                  {activeEditingItem.inCatalog === false && (
                    <button
                      type="button"
                      className="button button-plain button-danger"
                      onClick={async () => {
                        if (window.confirm('Excluir esta credencial avulsa do cofre?')) {
                          await deleteStandaloneCredential(activeEditingItem.serviceId);
                          setEditingVaultKey(null);
                        }
                      }}
                    >
                      Excluir
                    </button>
                  )}
                  <button
                    type="button"
                    className="button button-plain"
                    onClick={() => {
                      setEditingVaultKey(null);
                      setVaultUsername('');
                      setVaultPassword('');
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </ModalDialog>
          )}

          <div className="setting-group vault-group">
            {filteredCredentials.length > 0 ? (
              <div className="hb-table-wrap">
                <table className="hb-table managed-vault" aria-label="Tabela de acessos da equipe">
                  <thead>
                    <tr>
                      <th scope="col">Serviço</th>
                      <th scope="col">Tipo</th>
                      <th scope="col">Responsável</th>
                      <th scope="col">Status</th>
                      <th scope="col">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCredentials.map((c) => {
                      const key = `${c.serviceId}:${c.credentialType === 'individual' ? (c.ownerUserId ?? currentUser.id) : 'shared'}`;
                      const canManage =
                        c.credentialType === 'shared'
                          ? currentUser.role === 'admin'
                          : currentUser.role === 'admin'
                            ? true
                            : c.ownerUserId === null || c.ownerUserId === currentUser.id;

                      return (
                        <tr className="configured-link" key={key}>
                          <td>
                            <div className="hb-table-entity">
                              <Icon name={c.credentialId ? 'LockKeyhole' : 'KeyRound'} />
                              <strong>{c.serviceName}</strong>
                            </div>
                          </td>
                          <td>
                            <span className="credential-badge">
                              {c.inCatalog === false
                                ? 'Avulsa'
                                : c.credentialType === 'shared'
                                  ? 'Compartilhada'
                                  : 'Individual'}
                            </span>
                          </td>
                          <td>
                            <span>
                              {c.credentialType === 'shared'
                                ? 'Equipe'
                                : c.ownerName || currentUser.displayName}
                            </span>
                          </td>
                          <td>
                            <span
                              className={
                                'hb-status-pill ' + (c.credentialId ? 'is-active' : 'is-pending')
                              }
                            >
                              {c.credentialId ? 'Cifrada no cofre' : 'Não cadastrada'}
                            </span>
                          </td>
                          <td>
                            <div className="row-actions">
                              {canManage && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingVaultKey(key);
                                    setVaultUsername('');
                                    setVaultPassword('');
                                  }}
                                >
                                  {c.credentialId ? 'Gerenciar' : 'Cadastrar'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="catalog-empty">Nenhuma credencial encontrada para os filtros atuais.</p>
            )}
            {vaultNotice && (
              <p className="notice" aria-live="polite">
                {vaultNotice}
              </p>
            )}
          </div>
        </section>
      )}
    </>
  );
}
