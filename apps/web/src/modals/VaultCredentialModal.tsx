import type { AuthenticatedWorkspace } from '../hooks/useWorkspace';
import { Icon } from '../icons';
export function VaultCredentialModal({
  dialogRef,
  setIndividualModal,
  setIndividualUsername,
  setIndividualPassword,
  setIndividualError,
  individualModal,
  individualUsername,
  individualPassword,
  individualShowPassword,
  setIndividualShowPassword,
  individualError,
  individualSaving,
  saveIndividualCredential,
}: Pick<
  AuthenticatedWorkspace,
  | 'dialogRef'
  | 'setIndividualModal'
  | 'setIndividualUsername'
  | 'setIndividualPassword'
  | 'setIndividualError'
  | 'individualModal'
  | 'individualUsername'
  | 'individualPassword'
  | 'individualShowPassword'
  | 'setIndividualShowPassword'
  | 'individualError'
  | 'individualSaving'
  | 'saveIndividualCredential'
> & { individualModal: NonNullable<AuthenticatedWorkspace['individualModal']> }) {
  return (
    <>
      <div className="hublink-modal-overlay" role="presentation">
        <div
          className="hublink-modal-card"
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="individual-dialog-title"
        >
          <button
            type="button"
            className="hublink-modal-close"
            aria-label="Fechar"
            onClick={() => {
              setIndividualModal(null);
              setIndividualUsername('');
              setIndividualPassword('');
              setIndividualError('');
            }}
          >
            ×
          </button>
          <div className="hublink-modal-header">
            <div className="hublink-modal-icon" aria-hidden="true">
              {individualModal.logoDataUrl ? (
                <img src={individualModal.logoDataUrl} alt="" />
              ) : (
                <Icon name="KeyRound" />
              )}
            </div>
            <div>
              <span className="hublink-modal-chip">Cofre individual · AES-256-GCM</span>
              <h2 id="individual-dialog-title">Configurar Acesso Pessoal</h2>
            </div>
          </div>
          <p className="hublink-modal-desc">
            Informe seu usuário e senha individuais para acessar{' '}
            <strong>{individualModal.name}</strong>. Eles serão guardados com segurança no seu cofre
            pessoal e preenchidos automaticamente na abertura.
          </p>
          <form
            className="hublink-modal-form"
            onSubmit={(event) => void saveIndividualCredential(event)}
          >
            <label className="hublink-form-label">
              <span>Usuário / Identificador</span>
              <input
                className="hublink-input"
                required
                value={individualUsername}
                onChange={(e) => setIndividualUsername(e.target.value)}
                placeholder="Seu usuário de acesso"
                autoComplete="username"
              />
            </label>
            <label className="hublink-form-label">
              <span>Senha</span>
              <span className="hublink-password-wrapper">
                <input
                  className="hublink-input"
                  required
                  type={individualShowPassword ? 'text' : 'password'}
                  value={individualPassword}
                  onChange={(e) => setIndividualPassword(e.target.value)}
                  placeholder="Sua senha de acesso"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="hublink-password-toggle"
                  onClick={() => setIndividualShowPassword(!individualShowPassword)}
                  aria-label={individualShowPassword ? 'Ocultar senha' : 'Ver senha'}
                >
                  {individualShowPassword ? 'Ocultar' : 'Ver'}
                </button>
              </span>
            </label>
            {individualError && (
              <p className="form-error" role="alert">
                {individualError}
              </p>
            )}
            <div className="hublink-modal-actions">
              <button
                type="submit"
                className="button button-primary hublink-submit-btn"
                disabled={individualSaving}
              >
                {individualSaving ? 'Salvando...' : 'Salvar e Acessar Sistema ↗'}
              </button>
              <button
                type="button"
                className="button button-plain"
                onClick={() => {
                  setIndividualModal(null);
                  setIndividualUsername('');
                  setIndividualPassword('');
                  setIndividualError('');
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
