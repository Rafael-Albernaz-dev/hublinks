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
    <main className="auth-screen">
      <form
        className="auth-card"
        aria-labelledby="auth-title"
        onSubmit={(event) => void login(event)}
      >
        <div className="auth-brand">
          <img src="/favicon.svg?v=2" width="44" height="44" alt="" aria-hidden="true" />
          <span>
            Hublink
            <small>HUB DA EQUIPE</small>
          </span>
        </div>
        <header className="auth-intro">
          <h1 id="auth-title">Bem-vindo ao Hublink</h1>
          <p>Entre com sua conta para acessar seu Workspace.</p>
        </header>
        <div className="auth-fields">
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
        </div>
        {loginError && (
          <p className="form-error" role="alert">
            {loginError}
          </p>
        )}
        <button className="button button-primary" type="submit" disabled={authBusy}>
          Entrar no Hublink
        </button>
        <p className="auth-caption">Acesso exclusivo para contas da equipe.</p>
      </form>
    </main>
  );
}
