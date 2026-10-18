import { useState } from 'react';
import type { CatalogService } from '../types';
export function CatalogEditor({
  service,
  onSave,
  onCancel,
  busy,
}: {
  service?: CatalogService;
  onSave: (
    value: Omit<CatalogService, 'id' | 'hasAction' | 'hasCredential'> & {
      username?: string;
      password?: string;
    },
  ) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
}) {
  const [name, setName] = useState(service?.name ?? '');
  const [targetUrl, setTargetUrl] = useState(service?.targetUrl ?? '');
  const [description, setDescription] = useState(service?.description ?? '');
  const [category, setCategory] = useState<CatalogService['category']>(service?.category ?? 'sva');
  const [credentialType, setCredentialType] = useState<CatalogService['credentialType']>(
    service?.credentialType ?? 'none',
  );
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(service?.logoDataUrl ?? null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  return (
    <form
      className="link-editor catalog-editor"
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
      <label>
        Nome do serviço/card
        <input
          required
          minLength={2}
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label>
        Endereço HTTPS
        <input
          type="url"
          value={targetUrl}
          onChange={(event) => setTargetUrl(event.target.value)}
          placeholder="https://example.com"
        />
      </label>
      <label>
        Descrição curta
        <input
          maxLength={255}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <div className="logo-setting">
        <span className="setting-label">Logo do card</span>
        {logoDataUrl && (
          <span className="logo-preview">
            <img src={logoDataUrl} alt="Prévia da logo do card" />
          </span>
        )}
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
                  setLogoDataUrl(reader.result);
                  setError('');
                }
              };
              reader.onerror = () => setError('Não foi possível ler a imagem.');
              reader.readAsDataURL(file);
            }}
          />
        </label>
        {logoDataUrl && (
          <button type="button" className="text-button" onClick={() => setLogoDataUrl(null)}>
            Remover logo do card
          </button>
        )}
        <small>PNG, JPG ou WebP · até 500 KB</small>
      </div>
      <label>
        Categoria
        <select
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
      <label>
        Tipo de Acesso / Cofre
        <select
          value={credentialType}
          onChange={(event) =>
            setCredentialType(event.target.value as CatalogService['credentialType'])
          }
        >
          <option value="none">Sem login / Sem cofre (Link direto)</option>
          {category !== 'sheet' && <option value="shared">Cofre Compartilhado (equipe)</option>}
          {category !== 'sheet' && (
            <option value="individual">Cofre Individual (por atendente)</option>
          )}
        </select>
      </label>
      {credentialType === 'shared' && (
        <div className="catalog-credential-fields">
          {service?.hasCredential && (
            <p className="setting-help" style={{ color: 'var(--success-ink, #00875a)' }}>
              ✓ Credencial compartilhada já cadastrada. Preencha abaixo apenas se desejar alterá-la.
            </p>
          )}
          <label>
            Usuário do serviço
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder={service?.hasCredential ? '(Manter usuário atual)' : undefined}
              autoComplete="off"
            />
          </label>
          <label>
            Senha do serviço
            <input
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
      <div className="form-actions">
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
