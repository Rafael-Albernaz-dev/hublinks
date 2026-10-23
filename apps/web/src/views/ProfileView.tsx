import { useRef, useState, type FormEvent } from 'react';
import type { AuthenticatedWorkspace } from '../hooks/useWorkspace';

export function ProfileView({
  currentUser,
  updateProfile,
  setPage,
}: Pick<AuthenticatedWorkspace, 'currentUser' | 'updateProfile' | 'setPage'>) {
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [email, setEmail] = useState(currentUser.email);
  const [avatar, setAvatar] = useState(currentUser.avatar ?? null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [notice, setNotice] = useState('');
  const readerId = useRef(0);
  async function upload(file?: File) {
    const id = ++readerId.current;
    setNotice('');
    if (!file) return;
    if (
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      setNotice('Escolha uma imagem PNG, JPEG ou WebP de até 2 MB.');
      return;
    }
    setReading(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
        reader.readAsDataURL(file);
      });
      await new Promise<void>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Imagem inválida.'));
        image.src = data;
      });
      if (id === readerId.current) setAvatar(data);
    } catch (error) {
      if (id === readerId.current)
        setNotice(error instanceof Error ? error.message : 'Imagem inválida.');
    } finally {
      if (id === readerId.current) setReading(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setNotice('');
    if (newPassword !== confirmation) {
      setNotice('A confirmação da nova senha não confere.');
      return;
    }
    setBusy(true);
    try {
      await updateProfile({
        displayName,
        email,
        avatar,
        ...(newPassword ? { currentPassword, newPassword } : {}),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      setNotice('Perfil atualizado com sucesso.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível salvar o perfil.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="profile-view" aria-labelledby="profile-title">
      <div>
        <span className="hb-eyebrow">SUA CONTA</span>
        <h1 id="profile-title">Meu Perfil</h1>
        <p>Atualize seus dados e a segurança da sua conta.</p>
      </div>
      <form onSubmit={(event) => void save(event)}>
        <fieldset className="profile-fields" disabled={busy}>
          <div className="profile-card">
            <h2>Identidade pessoal</h2>
            <div className="profile-avatar-row">
              <span className="hb-user-avatar profile-avatar">
                {avatar ? (
                  <img src={avatar} alt="Prévia do perfil" />
                ) : (
                  displayName.trim().slice(0, 2).toUpperCase()
                )}
              </span>
              <div className="profile-upload">
                <label>
                  Foto do perfil
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => {
                      void upload(event.target.files?.[0]);
                      event.target.value = '';
                    }}
                  />
                </label>
                <small>PNG, JPEG ou WebP · até 2 MB</small>
                <button
                  type="button"
                  onClick={() => {
                    readerId.current++;
                    setReading(false);
                    setAvatar(null);
                  }}
                >
                  Remover foto
                </button>
              </div>
            </div>
            <label>
              Nome de exibição
              <input
                required
                maxLength={80}
                autoComplete="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
            <label>
              E-mail
              <input
                required
                type="email"
                maxLength={255}
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <span className="profile-role">
              {currentUser.role === 'admin' ? 'Administrador' : 'Atendente'}
            </span>
          </div>
          <div className="profile-card">
            <h2>Alterar senha</h2>
            <p>Preencha apenas se quiser trocar sua senha.</p>
            <label>
              Senha atual
              <input
                type="password"
                autoComplete="current-password"
                maxLength={1024}
                required={!!newPassword}
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </label>
            <label>
              Nova senha
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={1024}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                aria-describedby="password-requirement"
              />
            </label>
            <small id="password-requirement">
              {newPassword.length >= 8 ? '✓ ' : ''}Mínimo de 8 caracteres
            </small>
            <label>
              Confirmar nova senha
              <input
                type="password"
                autoComplete="new-password"
                required={!!newPassword}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
          </div>
        </fieldset>
        <p className="profile-feedback" role="status" aria-live="polite">
          {notice}
        </p>
        <div className="form-actions">
          <button className="button button-primary" type="submit" disabled={busy || reading}>
            {busy ? 'Salvando...' : reading ? 'Carregando foto...' : 'Salvar alterações'}
          </button>
          <button type="button" disabled={busy} onClick={() => setPage('inicio')}>
            Voltar ao Início
          </button>
        </div>
      </form>
    </section>
  );
}
