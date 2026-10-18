import type { HTMLAttributes } from 'react';
import type { AuthenticatedWorkspace } from '../hooks/useWorkspace';
import type { CatalogService } from '../types';
import { Icon } from '../icons';
import { normalizeSearch } from '../hooks/normalizeSearch';
export function ServiceCard({
  service,
  className = '',
  dragProps,
  currentUser,
  setPage,
  query,
  setCatalogQuery,
  setEditingCatalogId,
  setAddingCatalog,
  setIndividualModal,
  setIndividualUsername,
  setIndividualPassword,
  setIndividualError,
  openVaultService,
  openingServiceId,
}: {
  service: CatalogService;
  className?: string;
  dragProps?: HTMLAttributes<HTMLAnchorElement>;
} & Pick<
  AuthenticatedWorkspace,
  | 'currentUser'
  | 'setPage'
  | 'query'
  | 'setCatalogQuery'
  | 'setEditingCatalogId'
  | 'setAddingCatalog'
  | 'setIndividualModal'
  | 'setIndividualUsername'
  | 'setIndividualPassword'
  | 'setIndividualError'
  | 'openVaultService'
  | 'openingServiceId'
>) {
  const canManage =
    (currentUser.role === 'admin' && !service.ownerUserId) ||
    service.ownerUserId === currentUser.id;
  const missing = !service.hasAction || !service.targetUrl;
  const pending = service.credentialType === 'individual' && !service.hasCredential;
  const action = missing
    ? canManage
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
        !normalizeSearch(service.name + ' ' + service.category).includes(normalizeSearch(query))
      }
      className={'hb-service ' + className}
      {...dragProps}
      href={missing ? undefined : service.targetUrl!}
      role={missing || pending ? 'button' : undefined}
      tabIndex={missing ? (canManage ? 0 : -1) : undefined}
      aria-disabled={missing && !canManage}
      aria-label={action + ' ' + service.name}
      target="_blank"
      rel="noopener noreferrer"
      onKeyDown={(e) => {
        dragProps?.onKeyDown?.(e);
        if (e.defaultPrevented) return;
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
          if (canManage) {
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
        {service.description || (missing ? 'Destino ainda não configurado' : 'Acesso da equipe')}
      </span>
      <span className="hb-badge">
        {
          { sva: 'SVA', crm: 'CRM', sheet: 'Planilha', sistemas: 'Sistemas', outros: 'Outros' }[
            service.category
          ]
        }
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
}
