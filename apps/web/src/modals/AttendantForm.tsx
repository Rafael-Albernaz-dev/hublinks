import type { AuthenticatedWorkspace } from '../hooks/useWorkspace';
export function AttendantForm({
  createAttendant,
  adminName,
  setAdminName,
  adminEmail,
  setAdminEmail,
  adminPassword,
  setAdminPassword,
  adminRole,
  setAdminRole,
  onSuccess,
  onCancel,
}: Pick<
  AuthenticatedWorkspace,
  | 'createAttendant'
  | 'adminName'
  | 'setAdminName'
  | 'adminEmail'
  | 'setAdminEmail'
  | 'adminPassword'
  | 'setAdminPassword'
  | 'adminRole'
  | 'setAdminRole'
> & {
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  return (
    <form
      className="hublink-modal-form"
      onSubmit={async (event) => {
        const ok = await createAttendant(event);
        if (ok && onSuccess) onSuccess();
      }}
    >
      <label className="hublink-form-label">
        <span>Nome</span>
        <input
          className="hublink-input"
          required
          maxLength={80}
          value={adminName}
          onChange={(event) => setAdminName(event.target.value)}
        />
      </label>
      <label className="hublink-form-label">
        <span>E-mail</span>
        <input
          className="hublink-input"
          required
          type="email"
          value={adminEmail}
          onChange={(event) => setAdminEmail(event.target.value)}
        />
      </label>
      <div className="modal-form-grid">
        <label className="hublink-form-label">
          <span>Cargo / Permissão</span>
          <select
            className="hublink-input"
            value={adminRole}
            onChange={(event) => setAdminRole(event.target.value as 'admin' | 'attendant')}
          >
            <option value="attendant">Usuário</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label className="hublink-form-label">
          <span>Senha inicial</span>
          <input
            className="hublink-input"
            required
            type="password"
            minLength={8}
            value={adminPassword}
            onChange={(event) => setAdminPassword(event.target.value)}
          />
        </label>
      </div>
      <div className="hublink-modal-actions">
        <button className="button button-primary" type="submit">
          Cadastrar usuário
        </button>
        {onCancel && (
          <button className="button button-plain" type="button" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
