import {
  DEFAULT_CONFIG,
  DEFAULT_HEADER_TAGLINE,
  DEFAULT_HOME_EYEBROW,
  DEFAULT_HOME_TITLE,
  rgbToHex,
} from '../../config';
import type { AuthenticatedWorkspace } from '../../hooks/useWorkspace';

export function BrandTextSettingsCard({
  config,
  setConfig,
  visualColor,
}: Pick<AuthenticatedWorkspace, 'config' | 'setConfig' | 'visualColor'>) {
  return (
    <div className="setting-group">
      <h3>Nome da empresa e textos</h3>
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

      <div className="bicolor-brand-box">
        <div className="bicolor-brand-head">
          <span className="setting-label">Nome bicolor na barra de navegação (opcional)</span>
          <small className="setting-help">
            Exemplo: <strong>Rural</strong> em uma cor e <strong>Conecta</strong> em outra. Se ficar
            em branco, usa o Nome da empresa acima.
          </small>
        </div>
        <div className="color-inputs">
          <label>
            Texto parte 1 (navbar)
            <input
              type="text"
              maxLength={40}
              placeholder="Ex: Rural"
              value={config.brandPrimaryText ?? ''}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  brandPrimaryText: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Cor parte 1
            <span className="inline-color-control">
              <input
                type="color"
                aria-label="Seletor cor parte 1"
                value={config.brandPrimaryColor || rgbToHex(visualColor)}
                onChange={(event) =>
                  setConfig((current) => ({
                    ...current,
                    brandPrimaryColor: event.target.value.toLowerCase(),
                  }))
                }
              />
              <input
                type="text"
                aria-label="Cor parte 1 hexadecimal"
                maxLength={7}
                placeholder="#1F568B"
                value={config.brandPrimaryColor ?? ''}
                onChange={(event) =>
                  setConfig((current) => ({
                    ...current,
                    brandPrimaryColor: event.target.value || null,
                  }))
                }
              />
            </span>
          </label>
        </div>
        <div className="color-inputs">
          <label>
            Texto parte 2 (navbar)
            <input
              type="text"
              maxLength={40}
              placeholder="Ex: Conecta"
              value={config.brandSecondaryText ?? ''}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  brandSecondaryText: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Cor parte 2
            <span className="inline-color-control">
              <input
                type="color"
                aria-label="Seletor cor parte 2"
                value={config.brandSecondaryColor || '#102333'}
                onChange={(event) =>
                  setConfig((current) => ({
                    ...current,
                    brandSecondaryColor: event.target.value.toLowerCase(),
                  }))
                }
              />
              <input
                type="text"
                aria-label="Cor parte 2 hexadecimal"
                maxLength={7}
                placeholder="#102333"
                value={config.brandSecondaryColor ?? ''}
                onChange={(event) =>
                  setConfig((current) => ({
                    ...current,
                    brandSecondaryColor: event.target.value || null,
                  }))
                }
              />
            </span>
          </label>
        </div>
      </div>

      <div className="color-inputs">
        <label>
          Selo do cabeçalho (navbar)
          <input
            type="text"
            maxLength={60}
            placeholder={DEFAULT_HEADER_TAGLINE}
            value={config.headerTagline ?? DEFAULT_HEADER_TAGLINE}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                headerTagline: event.target.value,
              }))
            }
          />
        </label>
        <label>
          Selo da tela inicial
          <input
            type="text"
            maxLength={60}
            placeholder={DEFAULT_HOME_EYEBROW}
            value={config.homeEyebrow ?? DEFAULT_HOME_EYEBROW}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                homeEyebrow: event.target.value,
              }))
            }
          />
        </label>
      </div>

      <label style={{ marginTop: '14px' }}>
        Título da tela inicial
        <input
          type="text"
          maxLength={120}
          placeholder={DEFAULT_HOME_TITLE}
          value={config.homeTitle ?? DEFAULT_HOME_TITLE}
          onChange={(event) =>
            setConfig((current) => ({
              ...current,
              homeTitle: event.target.value,
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
  );
}
