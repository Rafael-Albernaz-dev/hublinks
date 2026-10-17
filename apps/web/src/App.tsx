import { createElement, useEffect, useRef, useState } from 'react';
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

/* SVG geometry from the approved Lucide 1.17.0 bundle.
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

---

The following Lucide icons are derived from the Feather project:

airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out

The MIT License (MIT) (for the icons listed above)

Copyright (c) 2013-present Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
const iconNodes = {
  LayoutDashboard: [
    ['rect', { width: '7', height: '9', x: '3', y: '3', rx: '1' }],
    ['rect', { width: '7', height: '5', x: '14', y: '3', rx: '1' }],
    ['rect', { width: '7', height: '9', x: '14', y: '12', rx: '1' }],
    ['rect', { width: '7', height: '5', x: '3', y: '16', rx: '1' }],
  ],
  Grid2x2: [
    ['path', { d: 'M12 3v18' }],
    ['path', { d: 'M3 12h18' }],
    ['rect', { x: '3', y: '3', width: '18', height: '18', rx: '2' }],
  ],
  KeyRound: [
    [
      'path',
      {
        d: 'M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z',
      },
    ],
    ['circle', { cx: '16.5', cy: '7.5', r: '.5', fill: 'currentColor' }],
  ],
  Users: [
    ['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }],
    ['path', { d: 'M16 3.128a4 4 0 0 1 0 7.744' }],
    ['path', { d: 'M22 21v-2a4 4 0 0 0-3-3.87' }],
    ['circle', { cx: '9', cy: '7', r: '4' }],
  ],
  Palette: [
    [
      'path',
      {
        d: 'M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z',
      },
    ],
    ['circle', { cx: '13.5', cy: '6.5', r: '.5', fill: 'currentColor' }],
    ['circle', { cx: '17.5', cy: '10.5', r: '.5', fill: 'currentColor' }],
    ['circle', { cx: '6.5', cy: '12.5', r: '.5', fill: 'currentColor' }],
    ['circle', { cx: '8.5', cy: '7.5', r: '.5', fill: 'currentColor' }],
  ],
  Search: [
    ['path', { d: 'm21 21-4.34-4.34' }],
    ['circle', { cx: '11', cy: '11', r: '8' }],
  ],
  ArrowUpRight: [
    ['path', { d: 'M7 7h10v10' }],
    ['path', { d: 'M7 17 17 7' }],
  ],
  Settings2: [
    ['path', { d: 'M14 17H5' }],
    ['path', { d: 'M19 7h-9' }],
    ['circle', { cx: '17', cy: '17', r: '3' }],
    ['circle', { cx: '7', cy: '7', r: '3' }],
  ],
  LockKeyhole: [
    ['circle', { cx: '12', cy: '16', r: '1' }],
    ['rect', { x: '3', y: '10', width: '18', height: '12', rx: '2' }],
    ['path', { d: 'M7 10V7a5 5 0 0 1 10 0v3' }],
  ],
  Link: [
    ['path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }],
    ['path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }],
  ],
  UserRound: [
    ['circle', { cx: '12', cy: '8', r: '5' }],
    ['path', { d: 'M20 21a8 8 0 0 0-16 0' }],
  ],
  Sun: [
    ['circle', { cx: '12', cy: '12', r: '4' }],
    ['path', { d: 'M12 2v2' }],
    ['path', { d: 'M12 20v2' }],
    ['path', { d: 'm4.93 4.93 1.41 1.41' }],
    ['path', { d: 'm17.66 17.66 1.41 1.41' }],
    ['path', { d: 'M2 12h2' }],
    ['path', { d: 'M20 12h2' }],
    ['path', { d: 'm6.34 17.66-1.41 1.41' }],
    ['path', { d: 'm19.07 4.93-1.41 1.41' }],
  ],
  Moon: [
    [
      'path',
      {
        d: 'M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401',
      },
    ],
  ],
  LogOut: [
    ['path', { d: 'm16 17 5-5-5-5' }],
    ['path', { d: 'M21 12H9' }],
    ['path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }],
  ],
} as const;
function Icon({ name }: { name: keyof typeof iconNodes }) {
  return (
    <svg
      className="lucide"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {iconNodes[name].map(([tag, props], index) => createElement(tag, { ...props, key: index }))}
    </svg>
  );
}
const pages = [
  { id: 'inicio', label: 'Início', icon: 'LayoutDashboard' },
  { id: 'catalogo', label: 'Catálogo', icon: 'Grid2x2' },
  { id: 'cofre', label: 'Acessos', icon: 'KeyRound' },
  { id: 'equipe', label: 'Equipe', icon: 'Users' },
  { id: 'identidade', label: 'Identidade', icon: 'Palette' },
] as const;
type Page = (typeof pages)[number]['id'];
const WORKSPACE_PURPLE: RgbColor = { r: 113, g: 55, b: 209 };
const colorEquals = (a: RgbColor, b: RgbColor) => a.r === b.r && a.g === b.g && a.b === b.b;
const rgbField = (color: RgbColor) => [color.r, color.g, color.b].join(', ');
function parseRgbField(input: string): RgbColor | null {
  const value = input.trim();
  const channelText = /^rgb\([^)]+\)$/i.test(value) ? value.slice(4, -1) : value;
  const match = /^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/.exec(channelText);
  if (!match || match.slice(1).some((part) => Number(part) > 255)) return null;
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
}
function parseHexField(input: string): RgbColor | null {
  return /^#?[\da-f]{6}$/i.test(input.trim())
    ? hexToRgb(input.trim().startsWith('#') ? input.trim() : '#' + input.trim())
    : null;
}

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}
function initialTheme(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem('hublink-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* Storage may be disabled. */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
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
  const [page, setPage] = useState<Page>('inicio');
  const [query, setQuery] = useState('');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [colorChosen, setColorChosen] = useState(false);
  const [hexDraft, setHexDraft] = useState('#7137D1');
  const [rgbDraft, setRgbDraft] = useState('113, 55, 209');
  const [draggingLogo, setDraggingLogo] = useState(false);
  const [theme, setTheme] = useState(initialTheme);
  const gridRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const entered = useRef(false);
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
          setColorChosen(false);
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
    if (page !== 'equipe' || currentUser?.role !== 'admin') return;
    void refreshUsers();
  }, [page, currentUser]);

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
      setColorChosen(false);
      setPersisted(null);
      setApiState('loading');
      setPage('inicio');
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
    if (page !== 'cofre' || !currentUser) return;
    void loadVaultCredentials();
  }, [page, currentUser]);

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

  useEffect(() => {
    if (!showExtensionGuide && !individualModal) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button, a[href], input, select, textarea, [tabindex="0"]',
        ) ?? [],
      ).filter((node) => !node.hasAttribute('disabled'));
    focusable()[0]?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setShowExtensionGuide(false);
        setExtensionModal(null);
        setIndividualModal(null);
        setIndividualUsername('');
        setIndividualPassword('');
        setIndividualError('');
      }
      if (event.key === 'Tab') {
        const nodes = focusable();
        const next = event.shiftKey ? nodes.at(-1) : nodes[0];
        if (
          (event.shiftKey && document.activeElement === nodes[0]) ||
          (!event.shiftKey && document.activeElement === nodes.at(-1))
        ) {
          event.preventDefault();
          next?.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [showExtensionGuide, individualModal]);

  useEffect(() => {
    if (currentUser) return;
    setPage('inicio');
    setManagedUsers([]);
    setVaultCredentials([]);
    setEditingVaultKey(null);
    setVaultUsername('');
    setVaultPassword('');
    setAdminPassword('');
    setResetPassword('');
    setIndividualModal(null);
    setIndividualUsername('');
    setIndividualPassword('');
  }, [currentUser]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('hublink-theme', theme);
    } catch {
      /* Storage may be disabled. */
    }
  }, [theme]);
  useEffect(() => {
    if (!catalog.length || entered.current || !gridRef.current) return;
    entered.current = true;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    Array.from(gridRef.current.children).forEach((node, index) => {
      if (node instanceof HTMLElement && node.animate)
        node.animate(
          [
            { opacity: 0, transform: 'translateY(9px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          {
            duration: 220,
            delay: Math.min(index, 5) * 35,
            easing: 'cubic-bezier(.2,.7,.2,1)',
            fill: 'backwards',
          },
        );
    });
  }, [catalog, page]);
  const isDirty = persisted !== null && JSON.stringify(config) !== JSON.stringify(persisted);

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

  const isLegacyDefault = colorEquals(config.color, DEFAULT_CONFIG.color) && !colorChosen;
  const visualColor = isLegacyDefault ? WORKSPACE_PURPLE : config.color;
  const customAccent = !colorEquals(visualColor, WORKSPACE_PURPLE) ? rgbToCss(visualColor) : null;
  const style = {
    '--brand': rgbToCss(visualColor),
    '--brand-ink': brandInk(visualColor),
    '--brand-text': brandText(visualColor),
    ...(customAccent
      ? {
          '--hb-accent': customAccent,
          '--hb-on': brandInk(visualColor),
          '--hb-monogram': brandInk(visualColor),
          '--hb-soft': 'color-mix(in srgb, ' + customAccent + ' 15%, var(--hb-panel))',
        }
      : {}),
  } as CSSProperties;
  useEffect(() => {
    setHexDraft(rgbToHex(visualColor).toUpperCase());
    setRgbDraft(rgbField(visualColor));
  }, [visualColor.r, visualColor.g, visualColor.b]);
  function chooseColor(color: RgbColor) {
    setColorChosen(true);
    setConfig((current) => ({ ...current, color }));
  }
  function editHex(value: string) {
    setHexDraft(value);
    const parsed = parseHexField(value);
    if (parsed) chooseColor(parsed);
  }
  function editRgb(value: string) {
    setRgbDraft(value);
    const parsed = parseRgbField(value);
    if (parsed) chooseColor(parsed);
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
            ref={dialogRef}
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

      <header className="hb-header">
        <a
          className="hb-brand"
          href="#inicio"
          onClick={(e) => {
            e.preventDefault();
            setPage('inicio');
          }}
          aria-label="Voltar ao início do hub"
        >
          <span className="hb-monogram">
            {config.logoDataUrl ? (
              <img src={config.logoDataUrl} alt="" />
            ) : (
              config.companyName.slice(0, 1).toUpperCase()
            )}
          </span>
          <span>
            {config.companyName || 'Sua empresa'}
            <small className="hb-brand-sub">HUB DA EQUIPE</small>
          </span>
        </a>
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
        <div className="header-user">
          <span className="hb-account">
            {currentUser.displayName}
            <small>{currentUser.role === 'admin' ? 'Admin' : 'Atendente'}</small>
          </span>
          <div className="account-actions">
            <button
              className="hb-icon-button"
              type="button"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              aria-label={theme === 'light' ? 'Mudar para tema escuro' : 'Mudar para tema claro'}
              title={theme === 'light' ? 'Tema escuro' : 'Tema claro'}
            >
              <Icon name={theme === 'light' ? 'Moon' : 'Sun'} />
            </button>
            <button
              className="hb-icon-button"
              type="button"
              disabled={authBusy}
              onClick={() => void logout()}
              aria-label="Sair da conta"
              title="Sair"
            >
              <Icon name="LogOut" />
            </button>
          </div>
        </div>
      </header>
      <nav className="hb-nav" aria-label="Telas do Workspace">
        {pages.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={page === item.id ? 'page' : undefined}
            disabled={
              (item.id === 'equipe' || item.id === 'identidade') &&
              (currentUser.role !== 'admin' || (item.id === 'identidade' && apiState !== 'online'))
            }
            onClick={() => setPage(item.id)}
          >
            <Icon name={item.icon} />
            {item.label}
          </button>
        ))}
      </nav>
      <main className="hb-main" id="inicio">
        <section hidden={page !== 'inicio'} aria-label="Início">
          <div className="hb-title-row">
            <div>
              <span className="hb-eyebrow">SEU ESPAÇO DE TRABALHO</span>
              <h1>Um bom dia começa aqui.</h1>
              <p>{config.subtitle || 'Serviços, consultas e acessos da equipe.'}</p>
            </div>
          </div>
          <div className="hb-shortcuts">
            {pages.slice(1).map((item, index) => (
              <button
                key={item.id}
                type="button"
                className="hb-shortcut"
                disabled={
                  (item.id === 'equipe' || item.id === 'identidade') &&
                  (currentUser.role !== 'admin' ||
                    (item.id === 'identidade' && apiState !== 'online'))
                }
                onClick={() => setPage(item.id)}
              >
                <Icon name={item.icon} />
                <span>
                  <b>{item.label}</b>
                  <small>
                    {
                      [
                        catalog.length + ' serviços',
                        'Individuais e equipe',
                        'Pessoas e permissões',
                        'Marca e aparência',
                      ][index]
                    }
                  </small>
                </span>
              </button>
            ))}
          </div>
        </section>
        {page === 'inicio' && (
          <section aria-label="Serviços">
            <div className="hb-section-head">
              <h2>Seus serviços</h2>
              <label className="hb-search">
                <Icon name="Search" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Buscar serviços no Workspace"
                  placeholder="Buscar serviço"
                />
              </label>
            </div>
            <p className="visually-hidden" role="status" aria-live="polite">
              {
                catalog.filter((service) =>
                  normalizeSearch(service.name + ' ' + service.category).includes(
                    normalizeSearch(query),
                  ),
                ).length
              }{' '}
              serviços encontrados
            </p>
            {catalogError && (
              <p role="alert" className="form-error">
                {catalogError}
              </p>
            )}
            <div className="hb-grid" ref={gridRef}>
              {catalog.map((service) => {
                const missing = !service.hasAction || !service.targetUrl;
                const pending = service.credentialType === 'individual' && !service.hasCredential;
                const action = missing
                  ? currentUser.role === 'admin'
                    ? 'Configurar'
                    : 'Sem destino'
                  : pending
                    ? 'Cadastrar'
                    : 'Abrir';
                const state = missing
                  ? 'Sem destino'
                  : pending
                    ? 'Acesso pendente'
                    : service.credentialType === 'none'
                      ? 'Link direto'
                      : service.credentialType === 'shared'
                        ? 'Compartilhado'
                        : 'Individual';
                const icon = missing
                  ? 'Settings2'
                  : pending
                    ? 'KeyRound'
                    : service.credentialType === 'none'
                      ? 'Link'
                      : 'LockKeyhole';
                return (
                  <a
                    key={service.id}
                    hidden={
                      !normalizeSearch(service.name + ' ' + service.category).includes(
                        normalizeSearch(query),
                      )
                    }
                    className="hb-service"
                    href={missing ? undefined : service.targetUrl!}
                    role={missing || pending ? 'button' : undefined}
                    tabIndex={missing ? (currentUser.role === 'admin' ? 0 : -1) : undefined}
                    aria-disabled={missing && currentUser.role !== 'admin'}
                    aria-label={action + ' ' + service.name}
                    target="_blank"
                    rel="noopener noreferrer"
                    onKeyDown={(e) => {
                      if ((missing || pending) && e.key === ' ') {
                        e.preventDefault();
                        e.currentTarget.click();
                      }
                      if (missing && e.key === 'Enter') {
                        e.preventDefault();
                        e.currentTarget.click();
                      }
                    }}
                    onClick={(e) => {
                      if (missing) {
                        e.preventDefault();
                        if (currentUser.role === 'admin') {
                          setPage('catalogo');
                          setCatalogQuery('');
                          setEditingCatalogId(service.id);
                          setAddingCatalog(false);
                        }
                        return;
                      }
                      if (pending) {
                        e.preventDefault();
                        setIndividualModal(service);
                        setIndividualUsername('');
                        setIndividualPassword('');
                        setIndividualError('');
                        return;
                      }
                      if (service.credentialType !== 'none') {
                        e.preventDefault();
                        void openVaultService(service);
                      }
                    }}
                  >
                    <span className="hb-service-head">
                      <span className="hb-logo">
                        {service.logoDataUrl ? (
                          <img src={service.logoDataUrl} alt="" />
                        ) : (
                          service.name.slice(0, 2).toUpperCase()
                        )}
                      </span>
                      <Icon name={missing ? 'Settings2' : 'ArrowUpRight'} />
                    </span>
                    <strong className="hb-service-name">{service.name}</strong>
                    <span className="hb-service-desc">
                      {service.description ||
                        (missing ? 'Destino ainda não configurado' : 'Acesso da equipe')}
                    </span>
                    <span className="hb-service-bottom">
                      <span className={'hb-state' + (pending && !missing ? ' hb-pending' : '')}>
                        <Icon name={icon} />
                        {state}
                      </span>
                      <span className="hb-service-action">
                        {openingServiceId === service.id ? 'Abrindo…' : action}
                        <Icon name="ArrowUpRight" />
                      </span>
                    </span>
                  </a>
                );
              })}
            </div>
            {!catalog.length && !catalogError && (
              <div className="empty-state">
                <h3>Catálogo vazio</h3>
                <p>O administrador pode adicionar cards na tela Catálogo.</p>
              </div>
            )}
            {catalog.length > 0 &&
              !catalog.some((service) =>
                normalizeSearch(service.name + ' ' + service.category).includes(
                  normalizeSearch(query),
                ),
              ) && <p>Nenhum serviço encontrado.</p>}
          </section>
        )}
        {page === 'catalogo' && (
          <section aria-labelledby="catalog-management-title" className="catalog-management">
            <div className="hb-page-intro">
              <h1 id="catalog-management-title">Catálogo de Serviços</h1>
              <p>Configuração de destinos, categorias e credenciais dos cards da equipe.</p>
            </div>
            <div className="catalog-toolbar">
              <label className="hb-search">
                <Icon name="Search" />
                <input
                  aria-label="Buscar no catálogo"
                  placeholder="Buscar serviço"
                  value={catalogQuery}
                  onChange={(event) => setCatalogQuery(event.target.value)}
                />
              </label>
              {currentUser.role === 'admin' && (
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => {
                    setAddingCatalog(true);
                    setEditingCatalogId(null);
                  }}
                >
                  + Adicionar serviço
                </button>
              )}
            </div>
            <p className="visually-hidden" role="status" aria-live="polite">
              {
                catalog.filter((service) =>
                  normalizeSearch(service.name + ' ' + service.category).includes(
                    normalizeSearch(catalogQuery),
                  ),
                ).length
              }{' '}
              serviços encontrados no catálogo
            </p>
            {catalogError && (
              <p role="alert" className="form-error">
                {catalogError}
              </p>
            )}
            {addingCatalog && currentUser.role === 'admin' && (
              <div className="catalog-form-panel">
                <h2>Novo serviço</h2>
                <CatalogEditor
                  busy={vaultBusy}
                  onSave={saveCatalogService}
                  onCancel={() => setAddingCatalog(false)}
                />
              </div>
            )}
            <div className="catalog-management-list">
              {catalog
                .filter((service) =>
                  normalizeSearch(service.name + ' ' + service.category).includes(
                    normalizeSearch(catalogQuery),
                  ),
                )
                .map((service) => (
                  <div className="catalog-management-record" key={service.id}>
                    {editingCatalogId === service.id && currentUser.role === 'admin' ? (
                      <div className="catalog-form-panel">
                        <h2>Editar {service.name}</h2>
                        <CatalogEditor
                          service={service}
                          busy={vaultBusy}
                          onSave={saveCatalogService}
                          onCancel={() => setEditingCatalogId(null)}
                        />
                      </div>
                    ) : (
                      <>
                        <span className="hb-logo catalog-record-logo">
                          {service.logoDataUrl ? (
                            <img src={service.logoDataUrl} alt="" />
                          ) : (
                            service.name.slice(0, 2).toUpperCase()
                          )}
                        </span>
                        <div className="catalog-record-details">
                          <strong>{service.name}</strong>
                          <small>Categoria: {service.category}</small>
                          <span className={service.targetUrl ? '' : 'hb-pending'}>
                            {service.targetUrl
                              ? new URL(service.targetUrl).hostname
                              : 'Sem destino configurado'}
                          </span>
                        </div>
                        <div className="catalog-record-status">
                          <span>
                            {service.credentialType === 'none'
                              ? 'Sem cofre'
                              : service.credentialType === 'shared'
                                ? 'Compartilhado'
                                : 'Individual'}
                          </span>
                          <small>
                            {service.credentialType === 'none'
                              ? 'Link direto'
                              : service.hasCredential
                                ? 'Credencial cadastrada'
                                : 'Acesso pendente'}
                          </small>
                        </div>
                        {currentUser.role === 'admin' && (
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
                        )}
                      </>
                    )}
                  </div>
                ))}
              {!catalog.length && !catalogError && (
                <p className="catalog-empty">Nenhum serviço cadastrado.</p>
              )}
              {catalog.length > 0 &&
                !catalog.some((service) =>
                  normalizeSearch(service.name + ' ' + service.category).includes(
                    normalizeSearch(catalogQuery),
                  ),
                ) && <p className="catalog-empty">Nenhum serviço encontrado.</p>}
            </div>
            {currentUser.role === 'attendant' && (
              <div className="catalog-attendant-note">
                <p>
                  O catálogo é gerenciado pelos administradores. Seus acessos individuais ficam na
                  tela Acessos.
                </p>
                <button type="button" onClick={() => setPage('cofre')}>
                  Ir para Acessos
                </button>
              </div>
            )}
          </section>
        )}
        {page === 'cofre' && (
          <section aria-labelledby="access-title">
            <div className="hb-page-intro">
              <h1 id="access-title">Acessos da equipe</h1>
              <p>Credenciais por serviço e responsável. Senhas não aparecem nesta lista.</p>
            </div>{' '}
            <div className="setting-group vault-group">
              <div className="managed-vault">
                {vaultCredentials
                  .filter(
                    (c) =>
                      c.credentialType !== 'none' &&
                      (currentUser.role === 'admin' ||
                        c.credentialType === 'shared' ||
                        c.ownerUserId === null ||
                        c.ownerUserId === currentUser.id),
                  )
                  .map((c) => {
                    const key = `${c.serviceId}:${c.credentialType === 'individual' ? (c.ownerUserId ?? currentUser.id) : 'shared'}`;
                    const isEditingThis = editingVaultKey === key;
                    const canManage =
                      c.credentialType === 'shared'
                        ? currentUser.role === 'admin'
                        : currentUser.role === 'admin'
                          ? true
                          : c.ownerUserId === null || c.ownerUserId === currentUser.id;

                    return (
                      <div className="configured-link" key={key}>
                        <div>
                          <Icon name={c.credentialId ? 'LockKeyhole' : 'KeyRound'} />
                          <strong>{c.serviceName}</strong>
                          <span className="credential-badge">
                            {c.credentialType === 'shared' ? 'Compartilhada' : 'Individual'}
                          </span>
                          <small>
                            Responsável:{' '}
                            {c.credentialType === 'shared'
                              ? 'Equipe'
                              : c.ownerName || currentUser.displayName}
                          </small>
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
                                {c.credentialId ? 'Gerenciar' : 'Cadastrar'}
                              </button>
                            )}
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
          </section>
        )}
        {page === 'equipe' && currentUser.role === 'admin' && (
          <section aria-labelledby="team-title">
            <div className="hb-page-intro">
              <h1 id="team-title">Equipe e permissões</h1>
              <p>Cadastro e gestão de pessoas separados da identidade visual.</p>
            </div>{' '}
            {currentUser.role === 'admin' && (
              <div className="setting-group admin-group">
                <h3>Adicionar pessoa</h3>
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
                  {managedUsers.map((user) => (
                    <div className="configured-link" key={user.id}>
                      <Icon name="UserRound" />
                      <strong>{user.displayName}</strong>
                      <span>{user.role === 'admin' ? 'Administrador' : 'Atendente'}</span>
                      <small>{user.email}</small>
                      {user.role !== 'attendant' ? null : resetId === user.id ? (
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
          </section>
        )}
        {page === 'identidade' && currentUser.role === 'admin' && (
          <section aria-labelledby="identity-title">
            <div className="hb-page-intro">
              <h1 id="identity-title">Identidade do seu hub</h1>
              <p>Uma marca horizontal para o cabeçalho. Um símbolo para espaços compactos.</p>
            </div>
            <div className="hb-identity-grid">
              <div className="hb-identity-preview" aria-label="Prévia da marca" style={style}>
                <span className="logo-preview">
                  {config.logoDataUrl ? (
                    <img src={config.logoDataUrl} alt="Prévia da logo" />
                  ) : (
                    config.companyName.slice(0, 1).toUpperCase()
                  )}
                </span>
                <strong>{config.companyName}</strong>
                <p>{config.subtitle}</p>
              </div>
              <div>
                {' '}
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
                </div>
                <div className="setting-group identity-logo-card">
                  <h3>Logo da empresa</h3>
                  <div
                    className={'logo-dropzone' + (draggingLogo ? ' is-dragging' : '')}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDraggingLogo(true);
                    }}
                    onDragLeave={() => setDraggingLogo(false)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDraggingLogo(false);
                      uploadLogo(event.dataTransfer.files[0]);
                    }}
                  >
                    <span className="logo-dropzone-preview">
                      {config.logoDataUrl ? (
                        <img src={config.logoDataUrl} alt="Logo enviada" />
                      ) : (
                        <span>{config.companyName.slice(0, 1).toUpperCase()}</span>
                      )}
                    </span>
                    <div className="logo-dropzone-actions">
                      <label className="button button-primary" htmlFor="logo-upload">
                        Enviar nova logo
                      </label>
                      <input
                        id="logo-upload"
                        className="visually-hidden"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(event) => {
                          uploadLogo(event.target.files?.[0]);
                          event.target.value = '';
                        }}
                      />
                      {config.logoDataUrl && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            setConfig((current) => ({ ...current, logoDataUrl: null }))
                          }
                        >
                          Remover logo
                        </button>
                      )}
                    </div>
                    <small>
                      Arraste uma imagem ou escolha um arquivo. PNG, JPG ou WebP · até 1 MB
                    </small>
                  </div>
                </div>
                <div className="setting-group identity-color-card">
                  <h3>Cor da marca</h3>
                  <div
                    className="color-showcase"
                    style={{ background: rgbToCss(visualColor), color: brandInk(visualColor) }}
                  >
                    <strong>Hublink</strong>
                    <span>Prévia de contraste</span>
                    <label className="color-picker-label">
                      <span>Escolher cor</span>
                      <input
                        type="color"
                        aria-label="Seletor visual de cor"
                        value={rgbToHex(visualColor)}
                        onChange={(event) => chooseColor(hexToRgb(event.target.value))}
                      />
                    </label>
                  </div>
                  <div className="color-inputs">
                    <label>
                      Hexadecimal
                      <input
                        aria-label="Hexadecimal"
                        type="text"
                        spellCheck={false}
                        maxLength={7}
                        value={hexDraft}
                        aria-invalid={hexDraft.length > 0 && !parseHexField(hexDraft)}
                        onChange={(event) => editHex(event.target.value)}
                        onBlur={() => setHexDraft(rgbToHex(visualColor).toUpperCase())}
                        placeholder="#7137D1"
                      />
                    </label>
                    <label>
                      RGB
                      <input
                        aria-label="RGB"
                        type="text"
                        value={rgbDraft}
                        aria-invalid={rgbDraft.length > 0 && !parseRgbField(rgbDraft)}
                        onChange={(event) => editRgb(event.target.value)}
                        onBlur={() => setRgbDraft(rgbField(visualColor))}
                        placeholder="113, 55, 209"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    className="reset-color"
                    onClick={() => chooseColor(WORKSPACE_PURPLE)}
                  >
                    Restaurar roxo padrão
                  </button>
                </div>
                <div className="setting-group transfer-group">
                  <h3>Levar configuração</h3>
                  <p className="setting-help">
                    Exporte para reutilizar ou importe um arquivo Hublink. O arquivo pode conter a
                    logo e os links.
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
                        setColorChosen(false);
                        setNotice('Exemplo restaurado.');
                      }
                    }}
                  >
                    Restaurar exemplo
                  </button>
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
              </div>
            </div>
          </section>
        )}
        {openingNotice && (
          <p role="status" className="notice">
            {openingNotice}
          </p>
        )}
        {page !== 'cofre' && vaultNotice && (
          <p role="status" className="notice">
            {vaultNotice}
          </p>
        )}
      </main>
      <footer className="hb-footer">
        {config.companyName} · Hublink<span>Serviços e acessos da equipe</span>
      </footer>
    </div>
  );
}
