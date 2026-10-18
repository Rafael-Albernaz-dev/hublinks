import { useState } from 'react';
import { SearchBar } from '../components/SearchBar';
import { normalizeSearch } from '../hooks/normalizeSearch';
import type { AuthenticatedWorkspace } from '../hooks/useWorkspace';
import { CatalogEditor, ModalDialog } from '../modals/ServiceModal';
import type { CatalogService } from '../types';

const CATEGORY_LABELS: Record<CatalogService['category'], string> = {
  sva: 'SVA',
  crm: 'CRM',
  sistemas: 'Sistemas',
  sheet: 'Planilha',
  outros: 'Outros',
};

export function CatalogView({
  page,
  catalogQuery,
  setCatalogQuery,
  currentUser,
  setAddingCatalog,
  setEditingCatalogId,
  catalog,
  catalogError,
  addingCatalog,
  vaultBusy,
  saveCatalogService,
  editingCatalogId,
  deleteCatalogService,
  setPage,
}: Pick<
  AuthenticatedWorkspace,
  | 'page'
  | 'catalogQuery'
  | 'setCatalogQuery'
  | 'currentUser'
  | 'setAddingCatalog'
  | 'setEditingCatalogId'
  | 'catalog'
  | 'catalogError'
  | 'addingCatalog'
  | 'vaultBusy'
  | 'saveCatalogService'
  | 'editingCatalogId'
  | 'deleteCatalogService'
  | 'setPage'
>) {
  const [categoryFilter, setCategoryFilter] = useState<'all' | CatalogService['category']>('all');
  const [vaultFilter, setVaultFilter] = useState<'all' | CatalogService['credentialType']>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'configured' | 'pending'>('all');
  const [deletingService, setDeletingService] = useState<CatalogService | null>(null);

  const filteredCatalog = catalog.filter((service) => {
    const matchesSearch = normalizeSearch(
      `${service.name} ${service.category} ${service.description ?? ''} ${service.targetUrl ?? ''}`,
    ).includes(normalizeSearch(catalogQuery));
    if (!matchesSearch) return false;
    if (categoryFilter !== 'all' && service.category !== categoryFilter) return false;
    if (vaultFilter !== 'all' && service.credentialType !== vaultFilter) return false;
    if (statusFilter !== 'all') {
      const isReady =
        Boolean(service.targetUrl) && (service.credentialType === 'none' || service.hasCredential);
      if (statusFilter === 'configured' && !isReady) return false;
      if (statusFilter === 'pending' && isReady) return false;
    }
    return true;
  });

  const editingService = editingCatalogId
    ? catalog.find((item) => item.id === editingCatalogId)
    : undefined;

  return (
    <>
      {page === 'catalogo' && (
        <section aria-labelledby="catalog-management-title" className="catalog-management">
          <div className="hb-page-intro">
            <h1 id="catalog-management-title">Catálogo de Serviços</h1>
            <p>Configuração de destinos, categorias e credenciais dos cards da equipe.</p>
          </div>
          <div className="catalog-toolbar">
            <SearchBar value={catalogQuery} onChange={setCatalogQuery} label="Buscar no catálogo" />
            <div className="hb-filter-group" role="group" aria-label="Filtros do catálogo">
              <select
                className="hb-filter-select"
                aria-label="Filtrar por categoria"
                value={categoryFilter}
                onChange={(event) =>
                  setCategoryFilter(event.target.value as 'all' | CatalogService['category'])
                }
              >
                <option value="all">Todas as categorias</option>
                <option value="sva">SVA</option>
                <option value="crm">CRM</option>
                <option value="sistemas">Sistemas</option>
                <option value="sheet">Planilha</option>
                <option value="outros">Outros</option>
              </select>
              <select
                className="hb-filter-select"
                aria-label="Filtrar por cofre"
                value={vaultFilter}
                onChange={(event) =>
                  setVaultFilter(event.target.value as 'all' | CatalogService['credentialType'])
                }
              >
                <option value="all">Todos os cofres</option>
                <option value="shared">Compartilhado</option>
                <option value="individual">Individual</option>
                <option value="none">Sem cofre</option>
              </select>
              <select
                className="hb-filter-select"
                aria-label="Filtrar por status"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as 'all' | 'configured' | 'pending')
                }
              >
                <option value="all">Todos os status</option>
                <option value="configured">Configurado</option>
                <option value="pending">Pendente</option>
              </select>
            </div>
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
          </div>
          <p className="visually-hidden" role="status" aria-live="polite">
            {filteredCatalog.length} serviços encontrados no catálogo
          </p>
          {catalogError && (
            <p role="alert" className="form-error">
              {catalogError}
            </p>
          )}
          {addingCatalog && (
            <ModalDialog
              titleId="catalog-add-dialog-title"
              chip="Catálogo privado"
              title="Novo serviço"
              description="Configure o nome, endereço HTTPS, logo e política de cofre do novo card."
              icon="Plus"
              onClose={() => setAddingCatalog(false)}
            >
              <CatalogEditor
                currentUser={currentUser}
                busy={vaultBusy}
                onSave={saveCatalogService}
                onCancel={() => setAddingCatalog(false)}
              />
            </ModalDialog>
          )}
          {editingService &&
            ((currentUser.role === 'admin' && !editingService.ownerUserId) ||
              editingService.ownerUserId === currentUser.id) && (
              <ModalDialog
                titleId="catalog-edit-dialog-title"
                chip="Catálogo privado"
                title={`Editar ${editingService.name}`}
                description="Atualize os dados do serviço, destino HTTPS ou credencial compartilhada."
                icon="Edit"
                logoDataUrl={editingService.logoDataUrl}
                onClose={() => setEditingCatalogId(null)}
              >
                <CatalogEditor
                  currentUser={currentUser}
                  service={editingService}
                  busy={vaultBusy}
                  onSave={saveCatalogService}
                  onCancel={() => setEditingCatalogId(null)}
                />
              </ModalDialog>
            )}
          {deletingService &&
            ((currentUser.role === 'admin' && !deletingService.ownerUserId) ||
              deletingService.ownerUserId === currentUser.id) && (
              <ModalDialog
                titleId="catalog-delete-dialog-title"
                chip="Exclusão de serviço"
                title={`Excluir ${deletingService.name}`}
                description={
                  <>
                    Tem certeza que deseja excluir <strong>{deletingService.name}</strong> do
                    catálogo? As credenciais associadas a este serviço também serão removidas.
                  </>
                }
                icon="Trash"
                logoDataUrl={deletingService.logoDataUrl}
                onClose={() => setDeletingService(null)}
              >
                <div className="hublink-modal-actions">
                  <button
                    type="button"
                    className="button button-danger"
                    disabled={vaultBusy}
                    onClick={async () => {
                      const target = deletingService;
                      setDeletingService(null);
                      await deleteCatalogService(target);
                    }}
                  >
                    Confirmar exclusão
                  </button>
                  <button
                    type="button"
                    className="button button-plain"
                    onClick={() => setDeletingService(null)}
                  >
                    Cancelar
                  </button>
                </div>
              </ModalDialog>
            )}

          {filteredCatalog.length > 0 ? (
            <div className="hb-table-wrap">
              <table className="hb-table" aria-label="Tabela de serviços do catálogo">
                <thead>
                  <tr>
                    <th scope="col">Serviço</th>
                    <th scope="col">Categoria</th>
                    <th scope="col">Destino HTTPS</th>
                    <th scope="col">Cofre</th>
                    <th scope="col">Status</th>
                    <th scope="col">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCatalog.map((service) => (
                    <tr className="catalog-management-record" key={service.id}>
                      <td>
                        <div className="hb-table-entity">
                          <span className="hb-logo catalog-record-logo">
                            {service.logoDataUrl ? (
                              <img src={service.logoDataUrl} alt="" />
                            ) : (
                              service.name.slice(0, 2).toUpperCase()
                            )}
                          </span>
                          <div className="catalog-record-details">
                            <strong>{service.name}</strong>
                            <span className="hb-badge">
                              {service.ownerUserId ? 'Pessoal' : 'Padrão da equipe'}
                            </span>
                            {service.description && <small>{service.description}</small>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="hb-badge">
                          {CATEGORY_LABELS[service.category] ?? service.category}
                        </span>
                      </td>
                      <td>
                        <span className={service.targetUrl ? 'hb-table-mono' : 'hb-pending'}>
                          {service.targetUrl
                            ? new URL(service.targetUrl).hostname
                            : 'Sem destino configurado'}
                        </span>
                      </td>
                      <td>
                        <span className="credential-badge">
                          {service.credentialType === 'none'
                            ? 'Sem cofre'
                            : service.credentialType === 'shared'
                              ? 'Compartilhado'
                              : 'Individual'}
                        </span>
                      </td>
                      <td>
                        <span
                          className={
                            'hb-status-pill ' +
                            (service.credentialType === 'none' || service.hasCredential
                              ? 'is-active'
                              : 'is-pending')
                          }
                        >
                          {service.credentialType === 'none'
                            ? 'Link direto'
                            : service.hasCredential
                              ? 'Credencial cadastrada'
                              : 'Acesso pendente'}
                        </span>
                      </td>
                      <td>
                        {((currentUser.role === 'admin' && !service.ownerUserId) ||
                          service.ownerUserId === currentUser.id) && (
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
                              onClick={() => setDeletingService(service)}
                            >
                              Excluir
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="catalog-management-list">
              {!catalog.length && !catalogError && (
                <p className="catalog-empty">Nenhum serviço cadastrado.</p>
              )}
              {catalog.length > 0 && <p className="catalog-empty">Nenhum serviço encontrado.</p>}
            </div>
          )}
          {currentUser.role === 'attendant' && (
            <div className="catalog-attendant-note">
              <p>
                Os serviços da equipe são protegidos. Você pode adicionar e gerenciar seus próprios
                serviços pessoais.
              </p>
              <button type="button" onClick={() => setPage('cofre')}>
                Ir para Acessos
              </button>
            </div>
          )}
        </section>
      )}
    </>
  );
}
