import { useEffect, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import {
  DEFAULT_CONFIG,
  STORAGE_KEY,
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

function initialConfig(): HubConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? parseHubConfig(JSON.parse(saved)) : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
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
  const [error, setError] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const next: HubLink = {
        id: link?.id ?? crypto.randomUUID(),
        title: title.trim(),
        description: description.trim(),
        url: validateLinkUrl(url),
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
  const [config, setConfig] = useState<HubConfig>(initialConfig);
  const [editing, setEditing] = useState(false);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [addingLink, setAddingLink] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parseHubConfig(config)));
    } catch (cause) {
      if (cause instanceof DOMException)
        setNotice('O navegador não conseguiu guardar as alterações. Exporte uma cópia em JSON.');
    }
  }, [config]);

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
        setNotice('Logo atualizada neste navegador.');
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
      setNotice('Configuração importada neste navegador.');
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
    setNotice('Link salvo neste navegador.');
  }

  function removeLink(id: string) {
    setConfig((current) => ({ ...current, links: current.links.filter((item) => item.id !== id) }));
    setEditingLinkId(null);
    setNotice('Link removido.');
  }

  return (
    <div className="site-shell" style={style}>
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
            className="button button-outline"
            type="button"
            onClick={() => setEditing(!editing)}
            aria-expanded={editing}
            aria-controls="config-panel"
          >
            {editing ? 'Fechar ajustes' : 'Personalizar hub'}
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
                      <span className="card-icon">{String(index + 1).padStart(2, '0')}</span>
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
            <span>Configuração local deste navegador</span>
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
                onClick={() => setEditing(false)}
              >
                ×
              </button>
            </div>
            <p className="panel-intro">
              Ajuste a aparência e os links desta demonstração. Os dados ficam apenas neste
              navegador.
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
                  if (window.confirm('Restaurar a configuração de exemplo neste navegador?')) {
                    setConfig(DEFAULT_CONFIG);
                    setNotice('Exemplo restaurado.');
                  }
                }}
              >
                Restaurar exemplo
              </button>
            </div>
            {notice && (
              <p className="notice" role="status">
                {notice}
              </p>
            )}
          </aside>
        )}
      </main>
    </div>
  );
}
