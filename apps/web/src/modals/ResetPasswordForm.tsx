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
    <form onSubmit={(event) => void changePassword(event, userId)}>
      <label>
        Nova senha
        <input
          required
          type="password"
          minLength={8}
          value={resetPassword}
          onChange={(event) => setResetPassword(event.target.value)}
        />
      </label>
      <button className="button button-small" type="submit">
        Salvar nova senha
      </button>
      <button
        className="button button-small"
        type="button"
        onClick={() => {
          setResetId(null);
          setResetPassword('');
        }}
      >
        Cancelar
      </button>
    </form>
  );
}
