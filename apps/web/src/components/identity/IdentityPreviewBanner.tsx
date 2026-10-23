import { ServiceLogoPreview } from './LogoUploadCard';
import { DEFAULT_HEADER_TAGLINE, DEFAULT_HOME_EYEBROW, DEFAULT_HOME_TITLE } from '../../config';
import type { AuthenticatedWorkspace } from '../../hooks/useWorkspace';

export function IdentityPreviewBanner({
  config,
  style,
}: Pick<AuthenticatedWorkspace, 'config' | 'style'>) {
  const monogram = (config.companyName || 'S').slice(0, 1).toUpperCase();
  const hasBicolor = Boolean(config.brandPrimaryText?.trim() || config.brandSecondaryText?.trim());

  return (
    <div className="hb-identity-preview" aria-label="Prévia da marca" style={style}>
      <div className="hb-identity-preview-brand">
        <span className="hb-logo">
          {config.logoDataUrl ? <img src={config.logoDataUrl} alt="Prévia da logo" /> : monogram}
        </span>
        <div className="hb-identity-preview-titles">
          <strong>
            {hasBicolor ? (
              <span className="hb-brand-bicolor">
                {config.brandPrimaryText?.trim() && (
                  <span
                    style={
                      config.brandPrimaryColor ? { color: config.brandPrimaryColor } : undefined
                    }
                  >
                    {config.brandPrimaryText.trim()}
                  </span>
                )}
                {config.brandPrimaryText?.trim() && config.brandSecondaryText?.trim() ? ' ' : ''}
                {config.brandSecondaryText?.trim() && (
                  <span
                    style={
                      config.brandSecondaryColor ? { color: config.brandSecondaryColor } : undefined
                    }
                  >
                    {config.brandSecondaryText.trim()}
                  </span>
                )}
              </span>
            ) : (
              config.companyName
            )}
          </strong>
          <small className="hb-preview-tagline">
            {config.headerTagline || DEFAULT_HEADER_TAGLINE}
          </small>
        </div>
      </div>
      <div className="hb-identity-preview-hero">
        <span className="hb-eyebrow">{config.homeEyebrow || DEFAULT_HOME_EYEBROW}</span>
        <b className="hb-identity-preview-headline">{config.homeTitle || DEFAULT_HOME_TITLE}</b>
        <p>{config.subtitle}</p>
      </div>
      <div
        className="logo-theme-previews hb-banner-service-previews"
        aria-label="Prévia dos cards nos temas claro e escuro"
      >
        <ServiceLogoPreview logoDataUrl={config.logoDataUrl} monogram={monogram} />
      </div>
      <div className="hb-identity-preview-meta">
        <span className="hb-badge hb-badge-accent">Prévia em tempo real</span>
        <small>
          {config.companyName} · {new Date().getFullYear()}
        </small>
      </div>
    </div>
  );
}
