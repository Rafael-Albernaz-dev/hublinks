import { useState } from 'react';
import { useServiceFavicon } from '../hooks/useServiceFavicon';
import type { CatalogService, User } from '../types';
export { ModalDialog } from '../components/ModalDialog';

export function CatalogEditor({
  service,
  currentUser,
  onSave,
  onCancel,
  busy,
}: {
  service?: CatalogService;
  currentUser: User;
  onSave: (
    value: Omit<CatalogService, 'id' | 'hasAction' | 'hasCredential'> & {
      username?: string;
      password?: string;
    },
  ) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
}) {
  const [scope, setScope] = useState<'global' | 'personal'>(
    service?.scope ?? (currentUser.role === 'admin' ? 'global' : 'personal'),
  );
  const personal = scope === 'personal' || currentUser.role !== 'admin';
  const [name, setName] = useState(service?.name ?? '');
  const [targetUrl, setTargetUrl] = useState(service?.targetUrl ?? '');
  const [description, setDescription] = useState(service?.description ?? '');
  const [category, setCategory] = useState<CatalogService['category']>(service?.category ?? 'sva');
  const [credentialType, setCredentialType] = useState<CatalogService['credentialType']>(
    service?.credentialType ?? 'none',
  );
  const {
    logoDataUrl,
    setLogoDataUrl,
    manualLogo,
    setManualLogo,
    faviconStatus,
    setFaviconStatus,
    capturedHost,
    faviconMessage,
    setFaviconMessage,
    fetchFaviconForUrl,
  } = useServiceFavicon({ targetUrl, setTargetUrl, initialLogoDataUrl: service?.logoDataUrl });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const monogram = (name.trim() || 'SV').slice(0, 2).toUpperCase();

  return (
    <form
      className="link-editor catalog-editor hublink-modal-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim().length < 2 || name.trim().length > 80 || description.trim().length > 255) {
          setError('Confira o nome e a descrição do card.');
          return;
        }
        if (targetUrl) {
          try {
            const url = new URL(targetUrl);
            if (url.protocol !== 'https:' || !url.hostname || url.username || url.password)
              throw new Error();
          } catch {
            setError('Informe um endereço HTTPS sem usuário ou senha.');
            return;
          }
        }
        if (credentialType === 'shared' && Boolean(username) !== Boolean(password)) {
          setError('Informe usuário e senha juntos.');
          return;
        }
        setError('');
        void onSave({
          scope: personal ? 'personal' : 'global',
          name: name.trim(),
          targetUrl: targetUrl || null,
          description: description.trim() || null,
          category,
          credentialType,
          logoDataUrl,
          ...(credentialType === 'shared' && username && password ? { username, password } : {}),
        });
      }}
    >
      {currentUser.role === 'admin' && !service && (
        <label className="hublink-form-label">
          Escopo
          <select
            className="hublink-input"
            value={scope}
            onChange={(event) => {
              const next = event.target.value as 'global' | 'personal';
              setScope(next);
              if (next === 'personal' && credentialType === 'shared') setCredentialType('none');
            }}
          >
            <option value="global">Padrão da equipe</option>
            <option value="personal">Pessoal (só para mim)</option>
          </select>
        </label>
      )}
      <div className="modal-form-grid">
        <label className="hublink-form-label">
          <span>Nome do serviço/card</span>
          <input
            className="hublink-input"
            required
            minLength={2}
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="hublink-form-label">
          <span>Endereço HTTPS</span>
          <input
            className="hublink-input"
            type="url"
            value={targetUrl}
            onChange={(event) => setTargetUrl(event.target.value)}
            placeholder="https://example.com"
          />
        </label>
      </div>
      <label className="hublink-form-label">
        <span>Descrição curta</span>
        <input
          className="hublink-input"
          maxLength={255}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <div className="modal-form-grid">
        <label className="hublink-form-label">
          <span>Categoria</span>
          <select
            className="hublink-input"
            value={category}
            onChange={(event) => {
              const next = event.target.value as CatalogService['category'];
              setCategory(next);
              if (next === 'sheet') setCredentialType('none');
            }}
          >
            <option value="sva">SVA</option>
            <option value="crm">CRM</option>
            <option value="sistemas">Sistemas</option>
            <option value="sheet">Planilha</option>
            <option value="outros">Outros</option>
          </select>
        </label>
        <label className="hublink-form-label">
          <span>Tipo de Acesso / Cofre</span>
          <select
            className="hublink-input"
            value={credentialType}
            onChange={(event) =>
              setCredentialType(event.target.value as CatalogService['credentialType'])
            }
          >
            <option value="none">Sem login / Sem cofre (Link direto)</option>
            {!personal && category !== 'sheet' && (
              <option value="shared">Cofre Compartilhado (equipe)</option>
            )}
            {category !== 'sheet' && (
              <option value="individual">Cofre Individual (por atendente)</option>
            )}
          </select>
        </label>
      </div>

      <div className="logo-setting">
        <div className="logo-setting-head">
          <div>
            <span className="setting-label">Logo do card</span>
            <small className="logo-resolution-hint">
              Resolução recomendada: <strong>128×128 px</strong> (proporção 1:1) · PNG, JPG ou WebP
              · até 500 KB
            </small>
          </div>
          {faviconStatus === 'captured' && !manualLogo && (
            <span className="hb-badge hb-badge-accent">Favicon automático</span>
          )}
          {manualLogo && logoDataUrl && <span className="hb-badge">Upload manual</span>}
        </div>

        {faviconStatus === 'captured' && logoDataUrl && !manualLogo && (
          <div className="favicon-capture-banner is-captured" role="status" aria-live="polite">
            <span className="favicon-capture-thumb">
              <img src={logoDataUrl} alt={`Favicon capturado de ${capturedHost}`} />
            </span>
            <div className="favicon-capture-info">
              <strong>Favicon capturado de {capturedHost || 'link informado'}</strong>
              <small>
                Ícone obtido automaticamente do endereço HTTPS e aplicado às prévias Light e Dark
                abaixo.
              </small>
            </div>
          </div>
        )}

        {faviconStatus === 'loading' && (
          <div className="favicon-capture-banner is-loading" role="status" aria-live="polite">
            <small>{faviconMessage || 'Capturando favicon do endereço informado...'}</small>
          </div>
        )}

        {faviconStatus === 'failed' && faviconMessage && (
          <div className="favicon-capture-banner is-failed" role="status" aria-live="polite">
            <small>{faviconMessage}</small>
          </div>
        )}

        <div className="logo-theme-previews" aria-label="Prévia da logo nos temas claro e escuro">
          <div className="logo-theme-box logo-theme-light">
            <span className="logo-theme-tag">Light mode</span>
            <span className="logo-preview">
              {logoDataUrl ? (
                <img src={logoDataUrl} alt="Prévia da logo do card" />
              ) : (
                <span>{monogram}</span>
              )}
            </span>
          </div>
          <div className="logo-theme-box logo-theme-dark">
            <span className="logo-theme-tag">Dark mode</span>
            <span className="logo-preview">
              {logoDataUrl ? <img src={logoDataUrl} alt="" /> : <span>{monogram}</span>}
            </span>
          </div>
        </div>
        <div className="logo-dropzone-actions">
          <label className="button button-small">
            Enviar logo
            <input
              className="visually-hidden"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (
                  !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
                  file.size > 500_000
                ) {
                  setError('Escolha uma logo PNG, JPG ou WebP de até 500 KB.');
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                  if (typeof reader.result === 'string') {
                    setManualLogo(true);
                    setFaviconStatus('idle');
                    setFaviconMessage('');
                    setLogoDataUrl(reader.result);
                    setError('');
                  }
                };
                reader.onerror = () => setError('Não foi possível ler a imagem.');
                reader.readAsDataURL(file);
              }}
            />
          </label>
          <button
            type="button"
            className="button button-small button-plain"
            disabled={!targetUrl.trim() || faviconStatus === 'loading'}
            onClick={() => {
              setManualLogo(false);
              void fetchFaviconForUrl(targetUrl, true);
            }}
          >
            {faviconStatus === 'loading' ? 'Capturando...' : 'Capturar favicon do link'}
          </button>
          {logoDataUrl && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setLogoDataUrl(null);
                setManualLogo(false);
                setFaviconStatus('idle');
                setFaviconMessage('');
              }}
            >
              Remover logo do card
            </button>
          )}
        </div>
      </div>

      {credentialType === 'shared' && (
        <div className="catalog-credential-fields">
          {service?.hasCredential && (
            <p className="setting-help" style={{ color: 'var(--success-ink, #00875a)' }}>
              ✓ Credencial compartilhada já cadastrada. Preencha abaixo apenas se desejar alterá-la.
            </p>
          )}
          <label className="hublink-form-label">
            <span>Usuário do serviço</span>
            <input
              className="hublink-input"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder={service?.hasCredential ? '(Manter usuário atual)' : undefined}
              autoComplete="off"
            />
          </label>
          <label className="hublink-form-label">
            <span>Senha do serviço</span>
            <input
              className="hublink-input"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={service?.hasCredential ? '(Manter senha atual)' : undefined}
              autoComplete="new-password"
            />
          </label>
          <button
            type="button"
            className="text-button"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? 'Ocultar senha' : 'Mostrar senha'}
          </button>
        </div>
      )}
      {credentialType === 'individual' && (
        <p className="setting-help">
          Cada atendente cadastra sua própria credencial após entrar no Hub (ou direto ao clicar no
          card).
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="hublink-modal-actions">
        <button type="submit" className="button button-primary" disabled={busy}>
          Salvar card
        </button>
        <button type="button" className="button button-plain" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
