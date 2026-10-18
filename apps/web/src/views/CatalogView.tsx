import { SearchBar } from '../components/SearchBar';
import { normalizeSearch } from '../hooks/normalizeSearch';
import type { AuthenticatedWorkspace } from '../hooks/useWorkspace';
import { CatalogEditor } from '../modals/ServiceModal';
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
    </>
  );
}
