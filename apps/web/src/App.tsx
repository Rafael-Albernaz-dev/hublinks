import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import {
  DEFAULT_CONFIG,
  brandInk,
  brandText,
  hexToRgb,
  parseHubConfig,
  rgbToCss,
  rgbToHex,
  validateLinkUrl,
} from './config';
import type { HubConfig, HubLink, RgbColor } from './config';
import './theme.css';

type User = { id: string; displayName: string; email: string; role: 'admin' | 'attendant' };
type ManagedUser = User & { createdAt: string };

function readUser(value: unknown): User {
  if (typeof value !== 'object' || value === null || !('user' in value))
    throw new Error('Invalid user');
  const user = value.user;
  if (
    typeof user !== 'object' ||
    user === null ||
    !('id' in user) ||
    typeof user.id !== 'string' ||
    !('displayName' in user) ||
    typeof user.displayName !== 'string' ||
    !('email' in user) ||
    typeof user.email !== 'string' ||
    !('role' in user) ||
    (user.role !== 'admin' && user.role !== 'attendant')
  ) {
    throw new Error('Invalid user');
  }
  return { id: user.id, displayName: user.displayName, email: user.email, role: user.role };
}

function LinkEditor({
  link,
  onSave,
  onCancel,
}: {
  link?: HubLink;
  onSave: (link: HubLink) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(link?.title ?? '');
  const [description, setDescription] = useState(link?.description ?? '');
  const [url, setUrl] = useState(link?.url ?? '');
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(link?.logoDataUrl ?? null);
  const [error, setError] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const next: HubLink = {
        id: link?.id ?? crypto.randomUUID(),
        title: title.trim(),
        description: description.trim(),
        url: validateLinkUrl(url),
        logoDataUrl,
      };
      parseHubConfig({ ...DEFAULT_CONFIG, links: [next] });
      onSave(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o link.');
    }
  }

  return (
    <form className="link-editor" onSubmit={submit}>
      <label>
        Nome do link
        <input
          required
          maxLength={70}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Ex.: Portal do cliente"
        />
      </label>
      <label>
        Descrição curta
        <input
          maxLength={140}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Para que serve este acesso?"
        />
      </label>
      <label>
        Endereço HTTPS
        <input
          required
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://exemplo.com"
        />
      </label>
      <div className="logo-setting">
        <span className="setting-label">Logo do card</span>
        <div className="logo-actions">
          {logoDataUrl && (
            <span className="logo-preview">
              <img src={logoDataUrl} alt="Prévia da logo do card" />
            </span>
          )}
          <div>
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
            <small>PNG, JPG ou WebP · até 500 KB</small>
            {logoDataUrl && (
              <button className="text-button" type="button" onClick={() => setLogoDataUrl(null)}>
                Remover logo do card
              </button>
            )}
          </div>
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="button button-primary">
          Salvar link
        </button>
        <button type="button" className="button button-plain" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [adminNotice, setAdminNotice] = useState('');
  const [config, setConfig] = useState<HubConfig>(DEFAULT_CONFIG);
  const [persisted, setPersisted] = useState<HubConfig | null>(null);
  const [apiState, setApiState] = useState<'loading' | 'online' | 'offline'>('loading');
  const [saving, setSaving] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [addingLink, setAddingLink] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function checkAuth() {
      try {
        const response = await fetch('/api/auth/me', { signal: controller.signal });
        if (response.ok) setCurrentUser(readUser(await response.json()));
      } catch {
        // The login screen also handles a temporarily unavailable API.
      } finally {
        if (!controller.signal.aborted) setAuthChecked(true);
      }
    }
    void checkAuth();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/config', { signal: controller.signal });
        if (!response.ok) throw new Error('API unavailable');
        const loaded = parseHubConfig(await response.json());
        if (!controller.signal.aborted) {
          setConfig(loaded);
          setPersisted(loaded);
          setApiState('online');
        }
      } catch {
        if (!controller.signal.aborted) setApiState('offline');
      }
    }
    void load();
    return () => controller.abort();
  }, [currentUser]);

  useEffect(() => {
    if (!editing || currentUser?.role !== 'admin') return;
    void refreshUsers();
  }, [editing, currentUser]);

  async function refreshUsers() {
    try {
      const response = await fetch('/api/admin/users');
      if (response.status === 401) {
        setCurrentUser(null);
        return;
      }
      if (!response.ok) throw new Error('Could not list users');
      const data: unknown = await response.json();
      if (
        typeof data !== 'object' ||
        data === null ||
        !('users' in data) ||
        !Array.isArray(data.users)
      ) {
        throw new Error('Invalid users');
      }
      setManagedUsers(
        data.users.filter(
          (user): user is ManagedUser =>
            typeof user === 'object' &&
            user !== null &&
            'id' in user &&
            typeof user.id === 'string' &&
            'displayName' in user &&
            typeof user.displayName === 'string' &&
            'email' in user &&
            typeof user.email === 'string' &&
            'role' in user &&
            (user.role === 'admin' || user.role === 'attendant') &&
            'createdAt' in user &&
            typeof user.createdAt === 'string',
        ),
      );
    } catch {
      setAdminNotice('Não foi possível carregar os atendentes.');
    }
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setLoginError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      if (!response.ok) throw new Error('Credenciais inválidas ou API indisponível.');
      setCurrentUser(readUser(await response.json()));
      setLoginPassword('');
    } catch {
      setLoginError('Credenciais inválidas ou API indisponível.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function logout() {
    setAuthBusy(true);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Could not log out');
      setCurrentUser(null);
      setConfig(DEFAULT_CONFIG);
      setPersisted(null);
      setApiState('loading');
      setEditing(false);
      setManagedUsers([]);
    } catch {
      setNotice('Não foi possível sair. Tente novamente.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function createAttendant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdminNotice('');
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: adminName,
          email: adminEmail,
          password: adminPassword,
        }),
      });
      if (response.status === 401) {
        setCurrentUser(null);
        return;
      }
      if (!response.ok) throw new Error('Could not create user');
      setAdminName('');
      setAdminEmail('');
      setAdminPassword('');
      setAdminNotice('Atendente cadastrado.');
      await refreshUsers();
    } catch {
      setAdminNotice('Não foi possível cadastrar o atendente. Verifique os dados e o e-mail.');
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    setAdminNotice('');
    try {
      const response = await fetch(`/api/admin/users/${id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword }),
      });
      if (response.status === 401) {
        setCurrentUser(null);
        return;
      }
      if (!response.ok) throw new Error('Could not reset password');
      setResetPassword('');
      setResetId(null);
      setAdminNotice('Senha redefinida. As sessões anteriores foram revogadas.');
    } catch {
      setAdminNotice('Não foi possível redefinir a senha.');
    }
  }

  useEffect(() => {
    if (editing) closeRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closePanel();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [editing]);

  const isDirty = persisted !== null && JSON.stringify(config) !== JSON.stringify(persisted);

  function closePanel() {
    setEditing(false);
    triggerRef.current?.focus();
  }

  async function saveConfig() {
    if (apiState !== 'online' || !isDirty || saving) return;
    let candidate: HubConfig;
    try {
      candidate = parseHubConfig(config);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Configuração inválida.');
      return;
    }
    setSaving(true);
    setNotice('');
    try {
      const response = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(candidate),
      });
      if (!response.ok) throw new Error('A API não conseguiu salvar a configuração.');
      const result = (await response.json()) as { config: unknown };
      setPersisted(parseHubConfig(result.config));
      setNotice('Alterações salvas na API local.');
    } catch {
      setNotice('Não foi possível salvar as alterações na API local.');
    } finally {
      setSaving(false);
    }
  }

  const style = {
    '--brand': rgbToCss(config.color),
    '--brand-ink': brandInk(config.color),
    '--brand-text': brandText(config.color),
  } as CSSProperties;

  function updateColor(channel: keyof RgbColor, value: string) {
    const number = Number(value);
    if (value !== '' && Number.isInteger(number) && number >= 0 && number <= 255) {
      setConfig((current) => ({ ...current, color: { ...current.color, [channel]: number } }));
    }
  }

  function uploadLogo(file: File | undefined) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1_000_000) {
      setNotice('Escolha uma logo PNG, JPG ou WebP de até 1 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setConfig((current) => ({ ...current, logoDataUrl: reader.result as string }));
        setNotice('Logo alterada. Salve as alterações para persistir.');
      }
    };
    reader.onerror = () => setNotice('Não foi possível ler a imagem.');
    reader.readAsDataURL(file);
  }

  function exportConfig() {
    try {
      const blob = new Blob([JSON.stringify(parseHubConfig(config), null, 2)], {
        type: 'application/json',
      });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = 'hublink-config.json';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setNotice('Configuração exportada. Guarde o arquivo em local adequado.');
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Não foi possível exportar.');
    }
  }

  async function importConfig(file: File | undefined) {
    if (!file) return;
    if (file.size > 2_000_000) {
      setNotice('O arquivo de configuração é grande demais.');
      return;
    }
    try {
      setConfig(parseHubConfig(JSON.parse(await file.text())));
      setEditingLinkId(null);
      setAddingLink(false);
      setNotice('Configuração importada. Salve as alterações para persistir.');
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Arquivo de configuração inválido.');
    }
  }

  function saveLink(link: HubLink) {
    setConfig((current) => ({
      ...current,
      links: current.links.some((item) => item.id === link.id)
        ? current.links.map((item) => (item.id === link.id ? link : item))
        : [...current.links, link],
    }));
    setEditingLinkId(null);
    setAddingLink(false);
    setNotice('Link alterado. Salve as alterações para persistir.');
  }

  function removeLink(id: string) {
    setConfig((current) => ({ ...current, links: current.links.filter((item) => item.id !== id) }));
    setEditingLinkId(null);
    setNotice('Link removido.');
  }

  if (!authChecked)
    return (
      <div className="auth-screen">
        <p>Verificando sessão...</p>
      </div>
    );
  if (!currentUser)
    return (
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
    );

  return (
    <div className="site-shell" style={style}>
      {apiState === 'offline' && (
        <div className="api-error" role="alert">
          Não foi possível conectar à API do Hublink. Inicie o servidor local com 'npm run dev:api'
          para carregar e gerenciar a configuração.
        </div>
      )}
      <header className="site-header">
        <a className="brand" href="#inicio" aria-label="Voltar ao início do hub">
          <span className="brand-mark">
            {config.logoDataUrl ? (
              <img src={config.logoDataUrl} alt="" />
            ) : (
              config.companyName.slice(0, 1).toUpperCase()
            )}
          </span>
          <span>
            <strong>{config.companyName || 'Sua empresa'}</strong>
            <small>Hub de links</small>
          </span>
        </a>
        <div className="header-actions">
          <span className="demo-badge">Demonstração local</span>
          <span className="user-badge">
            {currentUser.displayName}{' '}
            <small>{currentUser.role === 'admin' ? 'Admin' : 'Atendente'}</small>
          </span>
          <button
            className="button button-plain"
            type="button"
            disabled={authBusy}
            onClick={() => void logout()}
          >
            Sair
          </button>
          <button
            className="button button-outline"
            type="button"
            ref={triggerRef}
            disabled={apiState !== 'online'}
            onClick={() => (editing ? closePanel() : setEditing(true))}
            aria-expanded={editing}
            aria-controls="config-panel"
          >
            Personalizar hub
          </button>
        </div>
      </header>

      <main id="inicio" className={editing ? 'content-grid with-editor' : 'content-grid'}>
        <div className="content-main">
          <section className="hero" aria-labelledby="hero-title">
            <div className="hero-copy">
              <span className="eyebrow">UM ESPAÇO COM A SUA IDENTIDADE</span>
              <h1 id="hero-title">
                Tudo o que sua equipe precisa, <em>em um só lugar.</em>
              </h1>
              <p>{config.subtitle}</p>
              <div className="hero-bottom">
                <span className="hero-dot" /> Seus links, organizados para o dia a dia.
              </div>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="art-orbit orbit-one" />
              <div className="art-orbit orbit-two" />
              <div className="art-tile tile-one" />
              <div className="art-tile tile-two" />
              <div className="art-center">
                {config.logoDataUrl ? (
                  <img src={config.logoDataUrl} alt="" />
                ) : (
                  config.companyName.slice(0, 1).toUpperCase()
                )}
              </div>
            </div>
          </section>

          <section className="links-section" aria-labelledby="links-heading">
            <div className="section-heading">
              <div>
                <span className="eyebrow">ACESSOS RÁPIDOS</span>
                <h2 id="links-heading">Seus links</h2>
                <p>Escolha um destino para abrir em uma nova aba.</p>
              </div>
              <span className="link-count">
                {config.links.length} {config.links.length === 1 ? 'link' : 'links'}
              </span>
            </div>
            {config.links.length ? (
              <div className="link-grid">
                {config.links.map((link, index) => (
                  <a
                    className="link-card"
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className="card-top">
                      <span className="card-icon">
                        {link.logoDataUrl ? (
                          <img src={link.logoDataUrl} alt="" />
                        ) : (
                          String(index + 1).padStart(2, '0')
                        )}
                      </span>
                      <span className="card-arrow" aria-hidden="true">
                        ↗
                      </span>
                    </span>
                    <span className="card-content">
                      <strong>{link.title}</strong>
                      <span>{link.description || new URL(link.url).hostname}</span>
                    </span>
                    <span className="card-domain">{new URL(link.url).hostname}</span>
                  </a>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">+</div>
                <h3>Comece pelos seus links</h3>
                <p>Adicione os destinos que deseja mostrar nesta demonstração.</p>
                <button
                  type="button"
                  className="button button-primary"
                  disabled={apiState !== 'online'}
                  onClick={() => {
                    setEditing(true);
                    setAddingLink(true);
                  }}
                >
                  Adicionar primeiro link
                </button>
              </div>
            )}
          </section>
          <footer className="site-footer">
            <span>Hublink · modelo configurável</span>
            <span>Configuração nesta API local</span>
          </footer>
        </div>

        {editing && (
          <aside id="config-panel" className="config-panel" aria-label="Personalização do hub">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">PERSONALIZAÇÃO</span>
                <h2>Deixe com a sua cara</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Fechar ajustes"
                ref={closeRef}
                onClick={closePanel}
              >
                ×
              </button>
            </div>
            <p className="panel-intro">
              Ajuste a aparência e os links desta demonstração. Salve para gravar na API local.
            </p>

            <div className="setting-group">
              <h3>Identidade</h3>
              <label>
                Nome da empresa
                <input
                  value={config.companyName}
                  maxLength={60}
                  onChange={(event) =>
                    setConfig((current) => ({ ...current, companyName: event.target.value }))
                  }
                  onBlur={() =>
                    setConfig((current) => ({
                      ...current,
                      companyName: current.companyName.trim() || DEFAULT_CONFIG.companyName,
                    }))
                  }
                />
              </label>
              <label>
                Texto de apresentação
                <textarea
                  value={config.subtitle}
                  maxLength={160}
                  rows={2}
                  onChange={(event) =>
                    setConfig((current) => ({ ...current, subtitle: event.target.value }))
                  }
                />
              </label>
              <div className="logo-setting">
                <span className="setting-label">Logo</span>
                <div className="logo-actions">
                  <span className="logo-preview">
                    {config.logoDataUrl ? (
                      <img src={config.logoDataUrl} alt="Logo atual" />
                    ) : (
                      config.companyName.slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <div>
                    <label className="button button-small" htmlFor="logo-upload">
                      Enviar imagem
                    </label>
                    <input
                      id="logo-upload"
                      className="visually-hidden"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => uploadLogo(event.target.files?.[0])}
                    />
                    <small>PNG, JPG ou WebP · até 1 MB</small>
                    {config.logoDataUrl && (
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => setConfig((current) => ({ ...current, logoDataUrl: null }))}
                      >
                        Remover logo
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="setting-group">
              <h3>
                Cor da marca <span>RGB</span>
              </h3>
              <div className="color-row">
                <label className="color-picker-label" aria-label="Escolher cor">
                  <input
                    type="color"
                    value={rgbToHex(config.color)}
                    onChange={(event) =>
                      setConfig((current) => ({ ...current, color: hexToRgb(event.target.value) }))
                    }
                  />
                </label>
                <div className="rgb-fields">
                  {(['r', 'g', 'b'] as const).map((channel) => (
                    <label key={channel}>
                      {channel.toUpperCase()}
                      <input
                        type="number"
                        min="0"
                        max="255"
                        value={config.color[channel]}
                        onChange={(event) => updateColor(channel, event.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="setting-group">
              <div className="group-title">
                <h3>Links</h3>
                <span>{config.links.length}/30</span>
              </div>
              <p className="setting-help">
                Use apenas links públicos nesta demonstração. O catálogo privado dependerá de login
                no servidor.
              </p>
              <div className="configured-links">
                {config.links.map((link) => (
                  <div className="configured-link" key={link.id}>
                    {editingLinkId === link.id ? (
                      <LinkEditor
                        link={link}
                        onSave={saveLink}
                        onCancel={() => setEditingLinkId(null)}
                      />
                    ) : (
                      <>
                        <div>
                          <strong>{link.title}</strong>
                          <small>{new URL(link.url).hostname}</small>
                        </div>
                        <div className="row-actions">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingLinkId(link.id);
                              setAddingLink(false);
                            }}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => removeLink(link.id)}
                            aria-label={`Remover ${link.title}`}
                          >
                            Remover
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
              {addingLink ? (
                <LinkEditor onSave={saveLink} onCancel={() => setAddingLink(false)} />
              ) : (
                <button
                  type="button"
                  className="button button-add"
                  disabled={config.links.length >= 30}
                  onClick={() => {
                    setAddingLink(true);
                    setEditingLinkId(null);
                  }}
                >
                  + Adicionar link
                </button>
              )}
            </div>

            <div className="setting-group transfer-group">
              <h3>Levar configuração</h3>
              <p className="setting-help">
                Exporte para reutilizar ou importe um arquivo Hublink. O arquivo pode conter a logo
                e os links.
              </p>
              <div className="transfer-actions">
                <button type="button" className="button button-small" onClick={exportConfig}>
                  Exportar JSON
                </button>
                <label htmlFor="config-import" className="button button-small">
                  Importar JSON
                </label>
                <input
                  id="config-import"
                  className="visually-hidden"
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => {
                    void importConfig(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
              </div>
              <button
                type="button"
                className="reset-button"
                onClick={() => {
                  if (window.confirm('Restaurar a configuração de exemplo?')) {
                    setConfig(DEFAULT_CONFIG);
                    setNotice('Exemplo restaurado.');
                  }
                }}
              >
                Restaurar exemplo
              </button>
            </div>
            {currentUser.role === 'admin' && (
              <div className="setting-group admin-group">
                <h3>Gerenciar Atendentes</h3>
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
                <div className="managed-users">
                  {managedUsers
                    .filter((user) => user.role === 'attendant')
                    .map((user) => (
                      <div className="configured-link" key={user.id}>
                        <strong>{user.displayName}</strong>
                        <small>{user.email}</small>
                        {resetId === user.id ? (
                          <form onSubmit={(event) => void changePassword(event, user.id)}>
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
                        ) : (
                          <button
                            className="text-button"
                            type="button"
                            onClick={() => setResetId(user.id)}
                          >
                            Redefinir senha
                          </button>
                        )}
                      </div>
                    ))}
                </div>
                <p className="notice" aria-live="polite">
                  {adminNotice}
                </p>
              </div>
            )}
            <div className="save-actions">
              <button
                type="button"
                className="button button-primary"
                disabled={!isDirty || saving}
                onClick={() => void saveConfig()}
              >
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </button>
              {isDirty && <span>Alterações pendentes</span>}
            </div>
            <p className="notice" aria-live="polite">
              {notice}
            </p>
          </aside>
        )}
      </main>
    </div>
  );
}
