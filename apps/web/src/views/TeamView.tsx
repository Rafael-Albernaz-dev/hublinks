import { useState } from 'react';
import { AuditView } from './AuditView';
import { SearchBar } from '../components/SearchBar';
import { normalizeSearch } from '../hooks/normalizeSearch';
import type { AuthenticatedWorkspace } from '../hooks/useWorkspace';
import { Icon } from '../icons';
import { AttendantForm } from '../modals/AttendantForm';
import { ResetPasswordForm } from '../modals/ResetPasswordForm';
import { ModalDialog } from '../modals/ServiceModal';
import type { ManagedUser } from '../types';

export function TeamView({
  page,
  currentUser,
  createAttendant,
  updateManagedUser,
  adminName,
  setAdminName,
  adminEmail,
  setAdminEmail,
  adminPassword,
  setAdminPassword,
  adminRole,
  setAdminRole,
  managedUsers,
  resetId,
  changePassword,
  resetPassword,
  setResetPassword,
  setResetId,
  adminNotice,
}: Pick<
  AuthenticatedWorkspace,
  | 'page'
  | 'currentUser'
  | 'createAttendant'
  | 'updateManagedUser'
  | 'adminName'
  | 'setAdminName'
  | 'adminEmail'
  | 'setAdminEmail'
  | 'adminPassword'
  | 'setAdminPassword'
  | 'adminRole'
  | 'setAdminRole'
  | 'managedUsers'
  | 'resetId'
  | 'changePassword'
  | 'resetPassword'
  | 'setResetPassword'
  | 'setResetId'
  | 'adminNotice'
>) {
  const [teamQuery, setTeamQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'attendant'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [addingUser, setAddingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'attendant'>('attendant');
  const [editActive, setEditActive] = useState(true);

  const filteredUsers = managedUsers.filter((user) => {
    const isActive = user.active !== false;
    const roleLabel = user.role === 'admin' ? 'Admin Administrador' : 'Usuário';
    const matchesSearch = normalizeSearch(
      `${user.displayName} ${user.email} ${roleLabel}`,
    ).includes(normalizeSearch(teamQuery));
    if (!matchesSearch) return false;
    if (roleFilter !== 'all' && user.role !== roleFilter) return false;
    if (statusFilter === 'active' && !isActive) return false;
    if (statusFilter === 'inactive' && isActive) return false;
    return true;
  });

  const resetUser = resetId ? managedUsers.find((u) => u.id === resetId) : undefined;

  return (
    <>
      {page === 'equipe' && currentUser.role === 'admin' && (
        <section aria-labelledby="team-title">
          <div className="hb-page-intro">
            <h1 id="team-title">Equipe e permissões</h1>
            <p>Cadastro, cargos (Admin e Usuário) e status de acesso da equipe.</p>
          </div>
          <div className="catalog-toolbar">
            <SearchBar value={teamQuery} onChange={setTeamQuery} label="Buscar na equipe" />
            <div className="hb-filter-group" role="group" aria-label="Filtros da equipe">
              <select
                className="hb-filter-select"
                aria-label="Filtrar por cargo"
                value={roleFilter}
                onChange={(event) =>
                  setRoleFilter(event.target.value as 'all' | 'admin' | 'attendant')
                }
              >
                <option value="all">Todos os cargos</option>
                <option value="admin">Admin</option>
                <option value="attendant">Usuário</option>
              </select>
              <select
                className="hb-filter-select"
                aria-label="Filtrar por status do usuário"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as 'all' | 'active' | 'inactive')
                }
              >
                <option value="all">Todos os status</option>
                <option value="active">Ativo</option>
                <option value="inactive">Desativado</option>
              </select>
            </div>
            <button
              type="button"
              className="button button-primary"
              onClick={() => {
                setAdminName('');
                setAdminEmail('');
                setAdminPassword('');
                setAdminRole('attendant');
                setAddingUser(true);
              }}
            >
              + Adicionar usuário
            </button>
          </div>

          {addingUser && (
            <ModalDialog
              titleId="team-add-user-dialog"
              chip="Equipe e permissões"
              title="Novo usuário"
              description="Cadastre uma nova pessoa na equipe e escolha o nível de permissão (Admin ou Usuário)."
              icon="Users"
              onClose={() => setAddingUser(false)}
            >
              <AttendantForm
                createAttendant={createAttendant}
                adminName={adminName}
                setAdminName={setAdminName}
                adminEmail={adminEmail}
                setAdminEmail={setAdminEmail}
                adminPassword={adminPassword}
                setAdminPassword={setAdminPassword}
                adminRole={adminRole}
                setAdminRole={setAdminRole}
                onSuccess={() => setAddingUser(false)}
                onCancel={() => setAddingUser(false)}
              />
            </ModalDialog>
          )}

          {editingUser && (
            <ModalDialog
              titleId="team-edit-user-dialog"
              chip="Gestão de usuário"
              title={`Editar ${editingUser.displayName}`}
              description="Altere nome, e-mail, cargo (Admin ou Usuário) ou status de acesso ao Hub."
              icon="Edit"
              onClose={() => setEditingUser(null)}
            >
              <form
                className="hublink-modal-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const ok = await updateManagedUser(editingUser.id, {
                    displayName: editName,
                    email: editEmail,
                    role: editRole,
                    active: editActive,
                  });
                  if (ok) setEditingUser(null);
                }}
              >
                <label className="hublink-form-label">
                  <span>Nome</span>
                  <input
                    className="hublink-input"
                    required
                    maxLength={80}
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                  />
                </label>
                <label className="hublink-form-label">
                  <span>E-mail</span>
                  <input
                    className="hublink-input"
                    required
                    type="email"
                    value={editEmail}
                    onChange={(event) => setEditEmail(event.target.value)}
                  />
                </label>
                <div className="modal-form-grid">
                  <label className="hublink-form-label">
                    <span>Cargo / Permissão</span>
                    <select
                      className="hublink-input"
                      value={editRole}
                      disabled={editingUser.id === currentUser.id}
                      onChange={(event) => setEditRole(event.target.value as 'admin' | 'attendant')}
                    >
                      <option value="attendant">Usuário</option>
                      <option value="admin">Admin</option>
                    </select>
                  </label>
                  <label className="hublink-form-label">
                    <span>Status da conta</span>
                    <select
                      className="hublink-input"
                      value={editActive ? 'active' : 'inactive'}
                      disabled={editingUser.id === currentUser.id}
                      onChange={(event) => setEditActive(event.target.value === 'active')}
                    >
                      <option value="active">Ativo</option>
                      <option value="inactive">Desativado</option>
                    </select>
                  </label>
                </div>
                <div className="hublink-modal-actions">
                  <button type="submit" className="button button-primary">
                    Salvar alterações
                  </button>
                  <button
                    type="button"
                    className="button button-plain"
                    onClick={() => setEditingUser(null)}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </ModalDialog>
          )}

          {resetUser && (
            <ModalDialog
              titleId="team-reset-password-dialog"
              chip="Segurança da conta"
              title={`Redefinir senha de ${resetUser.displayName}`}
              description="Ao salvar uma nova senha, todas as sessões ativas deste usuário serão revogadas imediatamente."
              icon="KeyRound"
              onClose={() => {
                setResetId(null);
                setResetPassword('');
              }}
            >
              <ResetPasswordForm
                userId={resetUser.id}
                changePassword={changePassword}
                resetPassword={resetPassword}
                setResetPassword={setResetPassword}
                setResetId={setResetId}
              />
            </ModalDialog>
          )}

          <div className="setting-group admin-group">
            {filteredUsers.length > 0 ? (
              <div className="hb-table-wrap">
                <table className="hb-table managed-users" aria-label="Tabela de membros da equipe">
                  <thead>
                    <tr>
                      <th scope="col">Usuário</th>
                      <th scope="col">E-mail</th>
                      <th scope="col">Cargo</th>
                      <th scope="col">Status</th>
                      <th scope="col">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => {
                      const isActive = user.active !== false;
                      const isSelf = user.id === currentUser.id;
                      return (
                        <tr className="configured-link" key={user.id}>
                          <td>
                            <div className="hb-table-entity">
                              <Icon name="UserRound" />
                              <strong>{user.displayName}</strong>
                            </div>
                          </td>
                          <td>
                            <span className="hb-table-mono">{user.email}</span>
                          </td>
                          <td>
                            <span
                              className={
                                'hb-badge ' + (user.role === 'admin' ? 'hb-badge-accent' : '')
                              }
                            >
                              {user.role === 'admin' ? 'Admin' : 'Usuário'}
                            </span>
                          </td>
                          <td>
                            <span
                              className={
                                'hb-status-pill ' + (isActive ? 'is-active' : 'is-pending')
                              }
                            >
                              {isActive ? 'Ativo' : 'Desativado'}
                            </span>
                          </td>
                          <td>
                            <div className="row-actions">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingUser(user);
                                  setEditName(user.displayName);
                                  setEditEmail(user.email);
                                  setEditRole(user.role);
                                  setEditActive(isActive);
                                }}
                              >
                                Editar
                              </button>
                              {!isSelf && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void updateManagedUser(user.id, {
                                      displayName: user.displayName,
                                      email: user.email,
                                      role: user.role,
                                      active: !isActive,
                                    })
                                  }
                                >
                                  {isActive ? 'Desativar' : 'Ativar'}
                                </button>
                              )}
                              <button type="button" onClick={() => setResetId(user.id)}>
                                Redefinir senha
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="catalog-empty">Nenhum usuário encontrado para os filtros atuais.</p>
            )}
            <p className="notice" aria-live="polite">
              {adminNotice}
            </p>
          </div>
          <AuditView />
        </section>
      )}
    </>
  );
}
