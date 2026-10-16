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
} from './config';
import type { HubConfig, RgbColor } from './config';
import './theme.css';

type User = { id: string; displayName: string; email: string; role: 'admin' | 'attendant' };
type ManagedUser = User & { createdAt: string };
type CatalogService = {
  id: string;
  name: string;
  description: string | null;
  category: 'sva' | 'crm' | 'sheet' | 'sistemas' | 'outros';
  credentialType: 'shared' | 'individual' | 'none';
  targetUrl: string | null;
  hasAction: boolean;
  logoDataUrl: string | null;
  hasCredential: boolean;
};
type VaultCredentialMeta = {
  serviceId: string;
  serviceName: string;
  category: string;
  credentialType: 'shared' | 'individual' | 'none';
  credentialId: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  keyVersion: number | null;
  updatedAt: string | null;
};

type ExtensionReply = { status?: string; version?: string; autofill?: boolean };
type ChromeBridge = {
  runtime?: {
    lastError?: { message?: string };
    sendMessage: (id: string, message: unknown, callback: (reply?: ExtensionReply) => void) => void;
  };
};

function extensionMessage(message: unknown): Promise<ExtensionReply> {
  return new Promise((resolve, reject) => {
    const runtime = (window as Window & { chrome?: ChromeBridge }).chrome?.runtime;
    const extensionId =
      (import.meta.env.VITE_HUB_EXTENSION_ID as string | undefined) ||
      'nhodfnpljikjfeoihaimabljdenmfbio';
    if (!runtime || !extensionId || !/^[a-p]{32}$/.test(extensionId))
      return reject(new Error('Extension unavailable'));
    const timeout = window.setTimeout(() => reject(new Error('Extension timeout')), 1500);
    try {
      runtime.sendMessage(extensionId, message, (reply) => {
        window.clearTimeout(timeout);
        if (runtime.lastError || !reply) reject(new Error('Extension unavailable'));
        else resolve(reply);
      });
    } catch (error) {
      window.clearTimeout(timeout);
      reject(error);
    }
  });
}

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

function CatalogEditor({
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
  const [vaultCredentials, setVaultCredentials] = useState<VaultCredentialMeta[]>([]);
  const [editingVaultKey, setEditingVaultKey] = useState<string | null>(null);
  const [vaultUsername, setVaultUsername] = useState('');
  const [vaultPassword, setVaultPassword] = useState('');
  const [revealedCreds, setRevealedCreds] = useState<
    Record<string, { username: string; password: string }>
  >({});
  const [vaultNotice, setVaultNotice] = useState('');
  const [vaultBusy, setVaultBusy] = useState(false);
  const [catalog, setCatalog] = useState<CatalogService[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [extensionState, setExtensionState] = useState<'checking' | 'detected' | 'missing'>(
    document.documentElement.getAttribute('data-hublink-extension') === 'active'
      ? 'detected'
      : 'checking',
  );
  const [extensionModal, setExtensionModal] = useState<CatalogService | null>(null);
  const [showExtensionGuide, setShowExtensionGuide] = useState(false);
  const [openingServiceId, setOpeningServiceId] = useState<string | null>(null);
  const [openingNotice, setOpeningNotice] = useState('');
  const [individualModal, setIndividualModal] = useState<CatalogService | null>(null);
  const [individualUsername, setIndividualUsername] = useState('');
  const [individualPassword, setIndividualPassword] = useState('');
  const [individualShowPassword, setIndividualShowPassword] = useState(false);
  const [individualError, setIndividualError] = useState('');
  const [individualSaving, setIndividualSaving] = useState(false);
  const [editingCatalogId, setEditingCatalogId] = useState<string | null>(null);
  const [addingCatalog, setAddingCatalog] = useState(false);
  const [config, setConfig] = useState<HubConfig>(DEFAULT_CONFIG);
  const [persisted, setPersisted] = useState<HubConfig | null>(null);
  const [apiState, setApiState] = useState<'loading' | 'online' | 'offline'>('loading');
  const [saving, setSaving] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
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
    let current = true;
    const onExtensionActive = () => {
      if (current) setExtensionState('detected');
    };
    window.addEventListener('hublink-extension-active', onExtensionActive);
    if (document.documentElement.getAttribute('data-hublink-extension') === 'active')
      onExtensionActive();
    void extensionMessage({ type: 'PING' })
      .then((reply) => {
        if (current) setExtensionState(reply.status === 'ok' ? 'detected' : 'missing');
      })
      .catch(() => {
        if (current && document.documentElement.getAttribute('data-hublink-extension') !== 'active')
          setExtensionState('missing');
      });
    return () => {
      current = false;
      window.removeEventListener('hublink-extension-active', onExtensionActive);
    };
  }, []);

  async function openVaultService(service: CatalogService) {
    if (!service.targetUrl || openingServiceId) return;
    setOpeningNotice('');

    if (service.credentialType === 'individual' && !service.hasCredential) {
      setIndividualModal(service);
      setIndividualUsername('');
      setIndividualPassword('');
      setIndividualError('');
      return;
    }

    // DOM markers can be spoofed by the page; confirm the bridge before issuing a ticket.
    const extensionReady = await extensionMessage({ type: 'PING' })
      .then((reply) => reply.status === 'ok')
      .catch(() => false);
    if (!extensionReady) {
      setExtensionState('missing');
      setExtensionModal(service);
      setShowExtensionGuide(true);
      return;
    }
    setOpeningServiceId(service.id);
    try {
      const response = await fetch('/api/vault/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId: service.id }),
      });
      if (!response.ok) {
        if (service.credentialType === 'individual' && response.status === 404) {
          setIndividualModal(service);
          setIndividualUsername('');
          setIndividualPassword('');
          setIndividualError('');
          return;
        }
        const errData = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(
          errData.error || 'Não foi possível emitir o bilhete. Verifique sua credencial.',
        );
      }
      const data = (await response.json()) as {
        ticket: string;
        serviceId: string;
        targetUrl: string;
      };
      if (data.serviceId !== service.id || data.targetUrl !== service.targetUrl)
        throw new Error('Resposta de bilhete inválida.');
      const reply = await extensionMessage({ type: 'OPEN_SERVICE', ...data });
      if (reply.status !== 'opened') throw new Error('A extensão não conseguiu abrir o destino.');
      setOpeningNotice('Destino aberto com preenchimento assistido.');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Falha ao abrir destino.';
      setOpeningNotice(msg);
      if (
        extensionState !== 'detected' ||
        msg.includes('extensão') ||
        msg.includes('Extension') ||
        msg.includes('bilhete')
      ) {
        setExtensionModal(service);
        setShowExtensionGuide(true);
      }
    } finally {
      setOpeningServiceId(null);
    }
  }

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
    if (!currentUser) {
      setCatalog([]);
      return;
    }
    void loadCatalog();
  }, [currentUser]);

  async function loadCatalog() {
    try {
      const response = await fetch('/api/catalog');
      if (response.status === 401) {
        setCurrentUser(null);
        return;
      }
      if (!response.ok) throw new Error('Falha ao carregar o catálogo privado.');
      const result = (await response.json()) as { services: CatalogService[] };
      if (!Array.isArray(result.services)) throw new Error('Catálogo inválido.');
      setCatalog(result.services);
      setCatalogError('');
    } catch (cause) {
      setCatalogError(cause instanceof Error ? cause.message : 'Falha ao carregar o catálogo.');
    }
  }

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

  async function loadVaultCredentials(): Promise<boolean> {
    try {
      const response = await fetch('/api/vault/credentials');
      if (response.status === 401) {
        setCurrentUser(null);
        return false;
      }
      if (!response.ok) throw new Error('Could not load vault credentials');
      const data = (await response.json()) as { credentials: VaultCredentialMeta[] };
      setVaultCredentials(data.credentials || []);
      return true;
    } catch {
      setVaultNotice('Não foi possível carregar as credenciais do cofre.');
      return false;
    }
  }

  useEffect(() => {
    if (!editing || !currentUser) return;
    void loadVaultCredentials();
  }, [editing, currentUser]);

  async function saveCatalogService(
    input: Omit<CatalogService, 'id' | 'hasAction' | 'hasCredential'> & {
      username?: string;
      password?: string;
    },
  ) {
    if (currentUser?.role !== 'admin' || vaultBusy) return;
    setVaultBusy(true);
    setVaultNotice('');
    try {
      const response = await fetch(
        editingCatalogId ? `/api/catalog/services/${editingCatalogId}` : '/api/catalog/services',
        {
          method: editingCatalogId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        },
      );
      if (response.status === 401) {
        setCurrentUser(null);
        return;
      }
      if (!response.ok) {
        const error = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(error.error || 'Não foi possível salvar o card.');
      }
      setEditingCatalogId(null);
      setAddingCatalog(false);
      await loadCatalog();
      await loadVaultCredentials();
      setVaultNotice('Card salvo no catálogo privado.');
    } catch (cause) {
      setVaultNotice(cause instanceof Error ? cause.message : 'Não foi possível salvar o card.');
    } finally {
      setVaultBusy(false);
    }
  }

  async function deleteCatalogService(service: CatalogService) {
    if (currentUser?.role !== 'admin' || vaultBusy || !window.confirm(`Excluir ${service.name}?`))
      return;
    setVaultBusy(true);
    try {
      const response = await fetch(`/api/catalog/services/${service.id}`, { method: 'DELETE' });
      if (response.status === 401) {
        setCurrentUser(null);
        return;
      }
      if (!response.ok) throw new Error('Não foi possível excluir o card.');
      await loadCatalog();
      await loadVaultCredentials();
      setVaultNotice('Card excluído.');
    } catch (cause) {
      setVaultNotice(cause instanceof Error ? cause.message : 'Não foi possível excluir o card.');
    } finally {
      setVaultBusy(false);
    }
  }

  async function handleSaveVaultCredential(
    event: FormEvent<HTMLFormElement>,
    serviceId: string,
    ownerUserId: string | null,
  ) {
    event.preventDefault();
    setVaultBusy(true);
    setVaultNotice('');
    try {
      const response = await fetch(`/api/vault/credentials/${serviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: vaultUsername,
          password: vaultPassword,
          ...(ownerUserId ? { ownerUserId } : {}),
        }),
      });
      if (response.status === 401) {
        setCurrentUser(null);
        return;
      }
      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || 'Erro ao salvar credencial.');
      }
      setVaultUsername('');
      setVaultPassword('');
      setEditingVaultKey(null);
      setVaultNotice('Credencial salva com sucesso e enquadrada em AES-256-GCM.');
      await loadVaultCredentials();
      await loadCatalog();
    } catch (cause) {
      setVaultNotice(
        cause instanceof Error ? cause.message : 'Não foi possível salvar a credencial.',
      );
    } finally {
      setVaultBusy(false);
    }
  }

  async function toggleRevealCredential(serviceId: string, ownerUserId: string | null) {
    const key = `${serviceId}:${ownerUserId ?? 'shared'}`;
    if (revealedCreds[key]) {
      setRevealedCreds((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    setVaultBusy(true);
    setVaultNotice('');
    try {
      const response = await fetch(`/api/vault/credentials/${serviceId}/reveal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerUserId }),
      });
      if (response.status === 401) {
        setCurrentUser(null);
        return;
      }
      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || 'Erro ao revelar credencial.');
      }
      const data = (await response.json()) as { username: string; password: string };
      setRevealedCreds((prev) => ({ ...prev, [key]: data }));
    } catch (cause) {
      setVaultNotice(
        cause instanceof Error ? cause.message : 'Não foi possível revelar a credencial.',
      );
    } finally {
      setVaultBusy(false);
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
      setNotice('Configuração importada. Salve as alterações para persistir.');
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Arquivo de configuração inválido.');
    }
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
      {showExtensionGuide && (
        <div className="extension-overlay" role="presentation">
          <div
            className="extension-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="extension-dialog-title"
          >
            <button
              type="button"
              className="extension-close"
              aria-label="Fechar"
              onClick={() => {
                setShowExtensionGuide(false);
                setExtensionModal(null);
              }}
            >
              ×
            </button>
            <h2 id="extension-dialog-title">Extensão do Hublink necessária</h2>
            <p>
              Para preencher as credenciais deste sistema automaticamente, instale a extensão do
              Chrome.
            </p>
            <p>
              Em Chrome, abra <code>chrome://extensions</code>, ative o modo do desenvolvedor,
              escolha “Carregar sem compactação” e selecione <code>apps/extension/dist</code>.
              Depois recarregue o Hub.
            </p>
            <a
              className="button button-primary"
              href="chrome://extensions"
              target="_blank"
              rel="noopener noreferrer"
            >
              Como instalar / Baixar extensão
            </a>
            {extensionModal?.targetUrl && (
              <button
                type="button"
                className="button button-outline"
                onClick={() => {
                  window.open(extensionModal.targetUrl!, '_blank', 'noopener,noreferrer');
                  setShowExtensionGuide(false);
                  setExtensionModal(null);
                }}
              >
                Abrir destino mesmo assim (login manual)
              </button>
            )}
          </div>
        </div>
      )}
      {individualModal && (
        <div className="hublink-modal-overlay" role="presentation">
          <div
            className="hublink-modal-card"
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
                  '🔑'
                )}
              </div>
              <div>
                <span className="hublink-modal-chip">Cofre individual · AES-256-GCM</span>
                <h2 id="individual-dialog-title">Configurar Acesso Pessoal</h2>
              </div>
            </div>
            <p className="hublink-modal-desc">
              Informe seu usuário e senha individuais para acessar{' '}
              <strong>{individualModal.name}</strong>. Eles serão guardados com segurança no seu
              cofre pessoal e preenchidos automaticamente na abertura.
            </p>
            <form
              className="hublink-modal-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!individualUsername.trim() || !individualPassword) {
                  setIndividualError('Informe usuário e senha.');
                  return;
                }
                setIndividualSaving(true);
                setIndividualError('');
                try {
                  const res = await fetch(`/api/vault/credentials/${individualModal.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      username: individualUsername.trim(),
                      password: individualPassword,
                    }),
                  });
                  if (!res.ok) {
                    const err = (await res.json().catch(() => ({}))) as { error?: string };
                    throw new Error(err.error || 'Erro ao salvar credencial.');
                  }
                  setCatalog((prev) =>
                    prev.map((s) =>
                      s.id === individualModal.id ? { ...s, hasCredential: true } : s,
                    ),
                  );
                  const target = { ...individualModal, hasCredential: true };
                  setIndividualModal(null);
                  setIndividualUsername('');
                  setIndividualPassword('');
                  void openVaultService(target);
                } catch (err) {
                  setIndividualError(err instanceof Error ? err.message : 'Erro ao salvar.');
                } finally {
                  setIndividualSaving(false);
                }
              }}
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
      )}
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
          <button
            type="button"
            className="extension-status"
            onClick={() => {
              setExtensionModal(null);
              setShowExtensionGuide(true);
            }}
          >
            {extensionState === 'detected'
              ? 'Extensão ativa'
              : extensionState === 'checking'
                ? 'Verificando extensão'
                : 'Instalar extensão'}
          </button>
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
                {catalog.length} {catalog.length === 1 ? 'acesso' : 'acessos'}
              </span>
            </div>
            {catalogError && (
              <p role="alert" className="form-error">
                {catalogError}
              </p>
            )}
            {openingNotice && (
              <p role="status" className="notice">
                {openingNotice}
              </p>
            )}
            {catalog.length ? (
              <div className="link-grid">
                {catalog.map((service, index) => (
                  <div className="catalog-card" key={service.id}>
                    <a
                      className={`link-card${!service.hasAction || !service.targetUrl ? ' link-card-disabled' : ''}`}
                      href={service.hasAction ? (service.targetUrl ?? undefined) : undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={
                        !service.hasAction || !service.targetUrl ? 'Em configuração' : undefined
                      }
                      aria-disabled={!service.hasAction || !service.targetUrl}
                      onClick={(event) => {
                        if (
                          service.credentialType === 'none' ||
                          !service.hasAction ||
                          !service.targetUrl
                        )
                          return;
                        event.preventDefault();
                        void openVaultService(service);
                      }}
                    >
                      <span className="card-top">
                        <span className="card-icon">
                          {service.logoDataUrl ? (
                            <img src={service.logoDataUrl} alt="" />
                          ) : (
                            String(index + 1).padStart(2, '0')
                          )}
                        </span>
                        <span className="card-arrow" aria-hidden="true">
                          ↗
                        </span>
                      </span>
                      <span className="card-content">
                        <strong>{service.name}</strong>
                        <span>
                          {service.description ||
                            (service.targetUrl
                              ? new URL(service.targetUrl).hostname
                              : 'Em configuração')}
                        </span>
                      </span>
                      <span className="credential-badge">
                        {service.credentialType === 'none'
                          ? 'Sem cofre'
                          : service.credentialType === 'shared'
                            ? 'Compartilhado'
                            : 'Individual'}
                      </span>
                      {service.credentialType === 'individual' && !service.hasCredential && (
                        <span className="credential-badge credential-pending">Senha pendente</span>
                      )}
                    </a>
                    {service.credentialType === 'individual' && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => {
                          setIndividualModal(service);
                          setIndividualUsername('');
                          setIndividualPassword('');
                          setIndividualError('');
                        }}
                      >
                        Cadastrar/Alterar minha senha
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">+</div>
                <h3>Catálogo vazio</h3>
                <p>O administrador pode adicionar cards no painel de personalização.</p>
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
              Ajuste a aparência e gerencie o catálogo privado da equipe.
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

            <div className="setting-group catalog-group">
              <div className="group-title">
                <h3>Catálogo e Cofre de Acessos</h3>
                <span>{catalog.length}</span>
              </div>
              {currentUser.role === 'admin' && (
                <>
                  <div className="configured-links">
                    {catalog.map((service) => (
                      <div className="configured-link" key={service.id}>
                        {editingCatalogId === service.id ? (
                          <CatalogEditor
                            key={service.id}
                            service={service}
                            busy={vaultBusy}
                            onSave={saveCatalogService}
                            onCancel={() => setEditingCatalogId(null)}
                          />
                        ) : (
                          <>
                            <div>
                              <strong>{service.name}</strong>
                              <small>
                                {service.credentialType === 'none'
                                  ? 'Sem cofre'
                                  : service.credentialType === 'shared'
                                    ? 'Compartilhado'
                                    : 'Individual'}{' '}
                                ·{' '}
                                {service.hasCredential
                                  ? 'Credencial cadastrada'
                                  : 'Sem credencial para esta sessão'}
                              </small>
                            </div>
                            <div className="row-actions">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCatalogId(service.id);
                                  setAddingCatalog(false);
                                }}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                disabled={vaultBusy}
                                onClick={() => void deleteCatalogService(service)}
                              >
                                Excluir
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                  {addingCatalog ? (
                    <CatalogEditor
                      busy={vaultBusy}
                      onSave={saveCatalogService}
                      onCancel={() => setAddingCatalog(false)}
                    />
                  ) : (
                    <button
                      type="button"
                      className="button button-add"
                      onClick={() => {
                        setAddingCatalog(true);
                        setEditingCatalogId(null);
                      }}
                    >
                      + Adicionar card
                    </button>
                  )}
                </>
              )}
              {currentUser.role === 'attendant' && (
                <p className="setting-help">
                  Credenciais individuais podem ser cadastradas abaixo.
                </p>
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
            <div className="setting-group vault-group">
              <h3>Cofre de Credenciais (SVA)</h3>
              <p className="setting-help">
                Credenciais cifradas reversivelmente com AES-256-GCM. Compartilhadas são
                administradas pela equipe; individuais pertencem a cada atendente.
              </p>
              <div className="managed-vault">
                {vaultCredentials.map((c) => {
                  const key = `${c.serviceId}:${c.credentialType === 'individual' ? (c.ownerUserId ?? currentUser.id) : 'shared'}`;
                  const isEditingThis = editingVaultKey === key;
                  const isRevealed = Boolean(revealedCreds[key]);
                  const canManage =
                    c.credentialType === 'shared'
                      ? currentUser.role === 'admin'
                      : currentUser.role === 'admin'
                        ? true
                        : c.ownerUserId === null || c.ownerUserId === currentUser.id;
                  const canReveal =
                    currentUser.role === 'admin' ||
                    (c.credentialType === 'individual' && c.ownerUserId === currentUser.id);

                  return (
                    <div className="configured-link" key={key}>
                      <div>
                        <strong>{c.serviceName}</strong>
                        <span className="credential-badge">
                          {c.credentialType === 'shared' ? 'Compartilhada' : 'Individual'}
                        </span>
                        {c.ownerName && <small>Atendente: {c.ownerName}</small>}
                        <small>{c.credentialId ? 'Cifrada no cofre' : 'Não cadastrada'}</small>
                      </div>
                      {isEditingThis ? (
                        <form
                          onSubmit={(e) =>
                            void handleSaveVaultCredential(e, c.serviceId, c.ownerUserId)
                          }
                        >
                          <label>
                            Usuário do serviço
                            <input
                              required
                              value={vaultUsername}
                              onChange={(e) => setVaultUsername(e.target.value)}
                              placeholder="Ex: operador@sva.local"
                            />
                          </label>
                          <label>
                            Senha do serviço
                            <input
                              required
                              type="password"
                              value={vaultPassword}
                              onChange={(e) => setVaultPassword(e.target.value)}
                              placeholder="Senha de acesso"
                            />
                          </label>
                          <div className="form-actions">
                            <button
                              type="submit"
                              className="button button-small"
                              disabled={vaultBusy}
                            >
                              Salvar no cofre
                            </button>
                            <button
                              type="button"
                              className="button button-small button-plain"
                              onClick={() => {
                                setEditingVaultKey(null);
                                setVaultUsername('');
                                setVaultPassword('');
                              }}
                            >
                              Cancelar
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="row-actions">
                          {canManage && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingVaultKey(key);
                                setVaultUsername('');
                                setVaultPassword('');
                              }}
                            >
                              {c.credentialId ? 'Alterar' : 'Cadastrar'}
                            </button>
                          )}
                          {c.credentialId && canReveal && (
                            <button
                              type="button"
                              disabled={vaultBusy}
                              onClick={() =>
                                void toggleRevealCredential(c.serviceId, c.ownerUserId)
                              }
                            >
                              {isRevealed ? 'Ocultar' : 'Revelar'}
                            </button>
                          )}
                        </div>
                      )}
                      {isRevealed && revealedCreds[key] && (
                        <div className="vault-revealed">
                          <div>
                            <strong>Usuário:</strong> {revealedCreds[key].username}
                          </div>
                          <div>
                            <strong>Senha:</strong> {revealedCreds[key].password}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {vaultNotice && (
                <p className="notice" aria-live="polite">
                  {vaultNotice}
                </p>
              )}
            </div>
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
