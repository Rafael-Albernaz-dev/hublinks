import type { AuthenticatedWorkspace } from '../hooks/useWorkspace';
export function ResetPasswordForm({
  userId,
  changePassword,
  resetPassword,
  setResetPassword,
  setResetId,
}: { userId: string } & Pick<
  AuthenticatedWorkspace,
  'changePassword' | 'resetPassword' | 'setResetPassword' | 'setResetId'
>) {
  return (
    <form className="hublink-modal-form" onSubmit={(event) => void changePassword(event, userId)}>
      <label className="hublink-form-label">
        <span>Nova senha</span>
        <input
          className="hublink-input"
          required
          type="password"
          minLength={8}
          value={resetPassword}
          onChange={(event) => setResetPassword(event.target.value)}
        />
      </label>
      <div className="hublink-modal-actions">
        <button className="button button-primary" type="submit">
          Salvar nova senha
        </button>
        <button
          className="button button-plain"
          type="button"
          onClick={() => {
            setResetId(null);
            setResetPassword('');
          }}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
