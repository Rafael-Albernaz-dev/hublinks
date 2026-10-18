import type { WorkspaceModel } from '../hooks/useWorkspace';
export function LoginView({
  login,
  loginEmail,
  setLoginEmail,
  loginPassword,
  setLoginPassword,
  loginError,
  authBusy,
}: Pick<
  WorkspaceModel,
  | 'login'
  | 'loginEmail'
  | 'setLoginEmail'
  | 'loginPassword'
  | 'setLoginPassword'
  | 'loginError'
  | 'authBusy'
>) {
  return (
    <>
      <div className="auth-screen">
        <form className="auth-card" onSubmit={(event) => void login(event)}>
          <span className="auth-mark">H</span>
          <span className="eyebrow">ACESSO AO HUB</span>
          <h1>Bem-vindo ao Hublink</h1>
          <p>Entre com sua conta para acessar os links da equipe.</p>
          <label>
            E-mail
            <input
              autoComplete="username"
              type="email"
              required
              value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
            />
          </label>
          <label>
            Senha
            <input
              autoComplete="current-password"
              type="password"
              required
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
            />
          </label>
          {loginError && (
            <p className="form-error" role="alert">
              {loginError}
            </p>
          )}
          <button className="button button-primary" type="submit" disabled={authBusy}>
            Entrar no Hublink
          </button>
        </form>
      </div>
    </>
  );
}
