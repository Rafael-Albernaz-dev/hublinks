import type { AuthenticatedWorkspace } from '../hooks/useWorkspace';
export function AttendantForm({
  createAttendant,
  adminName,
  setAdminName,
  adminEmail,
  setAdminEmail,
  adminPassword,
  setAdminPassword,
}: Pick<
  AuthenticatedWorkspace,
  | 'createAttendant'
  | 'adminName'
  | 'setAdminName'
  | 'adminEmail'
  | 'setAdminEmail'
  | 'adminPassword'
  | 'setAdminPassword'
>) {
  return (
    <form onSubmit={(event) => void createAttendant(event)}>
      <label>
        Nome
        <input
          required
          maxLength={80}
          value={adminName}
          onChange={(event) => setAdminName(event.target.value)}
        />
      </label>
      <label>
        E-mail
        <input
          required
          type="email"
          value={adminEmail}
          onChange={(event) => setAdminEmail(event.target.value)}
        />
      </label>
      <label>
        Senha inicial
        <input
          required
          type="password"
          minLength={8}
          value={adminPassword}
          onChange={(event) => setAdminPassword(event.target.value)}
        />
      </label>
      <button className="button button-small" type="submit">
        Cadastrar atendente
      </button>
    </form>
  );
}
