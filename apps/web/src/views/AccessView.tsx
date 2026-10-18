import type { AuthenticatedWorkspace } from '../hooks/useWorkspace';
import { Icon } from '../icons';
export function AccessView({
  page,
  vaultCredentials,
  currentUser,
  editingVaultKey,
  handleSaveVaultCredential,
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
  | 'vaultUsername'
  | 'setVaultUsername'
  | 'vaultPassword'
  | 'setVaultPassword'
  | 'vaultBusy'
  | 'setEditingVaultKey'
  | 'vaultNotice'
>) {
  return (
    <>
      {page === 'cofre' && (
        <section aria-labelledby="access-title">
          <div className="hb-page-intro">
            <h1 id="access-title">Acessos da equipe</h1>
            <p>Credenciais por serviço e responsável. Senhas não aparecem nesta lista.</p>
          </div>{' '}
          <div className="setting-group vault-group">
            <div className="managed-vault">
              {vaultCredentials
                .filter(
                  (c) =>
                    c.credentialType !== 'none' &&
                    (currentUser.role === 'admin' ||
                      c.credentialType === 'shared' ||
                      c.ownerUserId === null ||
                      c.ownerUserId === currentUser.id),
                )
                .map((c) => {
                  const key = `${c.serviceId}:${c.credentialType === 'individual' ? (c.ownerUserId ?? currentUser.id) : 'shared'}`;
                  const isEditingThis = editingVaultKey === key;
                  const canManage =
                    c.credentialType === 'shared'
                      ? currentUser.role === 'admin'
                      : currentUser.role === 'admin'
                        ? true
                        : c.ownerUserId === null || c.ownerUserId === currentUser.id;

                  return (
                    <div className="configured-link" key={key}>
                      <div>
                        <Icon name={c.credentialId ? 'LockKeyhole' : 'KeyRound'} />
                        <strong>{c.serviceName}</strong>
                        <span className="credential-badge">
                          {c.credentialType === 'shared' ? 'Compartilhada' : 'Individual'}
                        </span>
                        <small>
                          Responsável:{' '}
                          {c.credentialType === 'shared'
                            ? 'Equipe'
                            : c.ownerName || currentUser.displayName}
                        </small>
                        <small>{c.credentialId ? 'Cifrada no cofre' : 'Não cadastrada'}</small>
                      </div>
                      {isEditingThis ? (
                        <form
                          onSubmit={(e) =>
                            void handleSaveVaultCredential(e, c.serviceId, c.ownerUserId)
                          }
                        >
                          <label>
                            Usuário do serviço
                            <input
                              required
                              value={vaultUsername}
                              onChange={(e) => setVaultUsername(e.target.value)}
                              placeholder="Ex: operador@sva.local"
                            />
                          </label>
                          <label>
                            Senha do serviço
                            <input
                              required
                              type="password"
                              value={vaultPassword}
                              onChange={(e) => setVaultPassword(e.target.value)}
                              placeholder="Senha de acesso"
                            />
                          </label>
                          <div className="form-actions">
                            <button
                              type="submit"
                              className="button button-small"
                              disabled={vaultBusy}
                            >
                              Salvar no cofre
                            </button>
                            <button
                              type="button"
                              className="button button-small button-plain"
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
                      ) : (
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
                      )}
                    </div>
                  );
                })}
            </div>
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
