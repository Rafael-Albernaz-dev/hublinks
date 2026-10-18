import type { ReactNode } from 'react';

export function LogoUploadCard({
  logoDataUrl,
  monogram,
  dragging,
  setDragging,
  onUpload,
  onRemove,
  title = 'Logo da empresa',
  inputId = 'logo-upload',
  resolutionHint = (
    <>
      {'Resolução recomendada: '}
      <strong>256×256 px</strong>
      {' (símbolo 1:1) ou'} <strong>320×96 px</strong>
      {' (horizontal) · PNG, JPG ou WebP · até 1 MB'}
    </>
  ),
}: {
  logoDataUrl: string | null;
  monogram: string;
  dragging: boolean;
  setDragging: (value: boolean) => void;
  onUpload: (file: File | undefined) => void;
  onRemove: () => void;
  title?: string;
  inputId?: string;
  resolutionHint?: ReactNode;
}) {
  return (
    <div className="setting-group identity-logo-card">
      <div className="logo-setting-head">
        <div>
          <h3>{title}</h3>
          <small className="logo-resolution-hint">{resolutionHint}</small>
        </div>
      </div>
      <div
        className={'logo-dropzone' + (dragging ? ' is-dragging' : '')}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          onUpload(event.dataTransfer.files[0]);
        }}
      >
        <div className="logo-theme-previews" aria-label="Prévia da logo nos modos claro e escuro">
          <div className="logo-theme-box logo-theme-light">
            <span className="logo-theme-tag">Light mode</span>
            <span className="logo-dropzone-preview">
              {logoDataUrl ? <img src={logoDataUrl} alt="Logo enviada" /> : <span>{monogram}</span>}
            </span>
          </div>
          <div className="logo-theme-box logo-theme-dark">
            <span className="logo-theme-tag">Dark mode</span>
            <span className="logo-dropzone-preview">
              {logoDataUrl ? <img src={logoDataUrl} alt="" /> : <span>{monogram}</span>}
            </span>
          </div>
        </div>
        <div className="logo-dropzone-actions">
          <label className="button button-primary" htmlFor={inputId}>
            Enviar nova logo
          </label>
          <input
            id={inputId}
            className="visually-hidden"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              onUpload(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          {logoDataUrl && (
            <button type="button" className="text-button" onClick={onRemove}>
              Remover logo
            </button>
          )}
        </div>
        <small>Arraste uma imagem ou escolha um arquivo. PNG, JPG ou WebP · até 1 MB</small>
      </div>
    </div>
  );
}
