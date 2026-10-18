import { ResetPasswordForm } from '../modals/ResetPasswordForm';
import { AttendantForm } from '../modals/AttendantForm';
import type { AuthenticatedWorkspace } from '../hooks/useWorkspace';
import { Icon } from '../icons';
export function TeamView({
  page,
  currentUser,
  createAttendant,
  adminName,
  setAdminName,
  adminEmail,
  setAdminEmail,
  adminPassword,
  setAdminPassword,
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
  | 'adminName'
  | 'setAdminName'
  | 'adminEmail'
  | 'setAdminEmail'
  | 'adminPassword'
  | 'setAdminPassword'
  | 'managedUsers'
  | 'resetId'
  | 'changePassword'
  | 'resetPassword'
  | 'setResetPassword'
  | 'setResetId'
  | 'adminNotice'
>) {
  return (
    <>
      {page === 'equipe' && currentUser.role === 'admin' && (
        <section aria-labelledby="team-title">
          <div className="hb-page-intro">
            <h1 id="team-title">Equipe e permissões</h1>
            <p>Cadastro e gestão de pessoas separados da identidade visual.</p>
          </div>{' '}
          {currentUser.role === 'admin' && (
            <div className="setting-group admin-group">
              <h3>Adicionar pessoa</h3>
              <AttendantForm
                createAttendant={createAttendant}
                adminName={adminName}
                setAdminName={setAdminName}
                adminEmail={adminEmail}
                setAdminEmail={setAdminEmail}
                adminPassword={adminPassword}
                setAdminPassword={setAdminPassword}
              />
              <div className="managed-users">
                {managedUsers.map((user) => (
                  <div className="configured-link" key={user.id}>
                    <Icon name="UserRound" />
                    <strong>{user.displayName}</strong>
                    <span>{user.role === 'admin' ? 'Administrador' : 'Atendente'}</span>
                    <small>{user.email}</small>
                    {user.role !== 'attendant' ? null : resetId === user.id ? (
                      <ResetPasswordForm
                        userId={user.id}
                        changePassword={changePassword}
                        resetPassword={resetPassword}
                        setResetPassword={setResetPassword}
                        setResetId={setResetId}
                      />
                    ) : (
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => setResetId(user.id)}
                      >
                        Redefinir senha
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="notice" aria-live="polite">
                {adminNotice}
              </p>
            </div>
          )}
        </section>
      )}
    </>
  );
}
