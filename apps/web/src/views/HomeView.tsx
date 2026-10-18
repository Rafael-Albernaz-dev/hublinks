import { SearchBar } from '../components/SearchBar';
import { ServiceCard } from '../components/ServiceCard';
import { pages } from '../components/pages';
import { normalizeSearch } from '../hooks/normalizeSearch';
import type { AuthenticatedWorkspace } from '../hooks/useWorkspace';
import { Icon } from '../icons';
export function HomeView({
  page,
  config,
  currentUser,
  apiState,
  setPage,
  catalog,
  query,
  setQuery,
  catalogError,
  gridRef,
  setCatalogQuery,
  setEditingCatalogId,
  setAddingCatalog,
  setIndividualModal,
  setIndividualUsername,
  setIndividualPassword,
  setIndividualError,
  openVaultService,
  openingServiceId,
}: Pick<
  AuthenticatedWorkspace,
  | 'page'
  | 'config'
  | 'currentUser'
  | 'apiState'
  | 'setPage'
  | 'catalog'
  | 'query'
  | 'setQuery'
  | 'catalogError'
  | 'gridRef'
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
  return (
    <>
      <section hidden={page !== 'inicio'} aria-label="Início">
        <div className="hb-title-row">
          <div>
            <span className="hb-eyebrow">{config.homeEyebrow || 'SEU ESPAÇO DE TRABALHO'}</span>
            <h1>{config.homeTitle || 'Um bom dia começa aqui.'}</h1>
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
            <SearchBar value={query} onChange={setQuery} label="Buscar serviços no Workspace" />
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
            {catalog.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                currentUser={currentUser}
                setPage={setPage}
                query={query}
                setCatalogQuery={setCatalogQuery}
                setEditingCatalogId={setEditingCatalogId}
                setAddingCatalog={setAddingCatalog}
                setIndividualModal={setIndividualModal}
                setIndividualUsername={setIndividualUsername}
                setIndividualPassword={setIndividualPassword}
                setIndividualError={setIndividualError}
                openVaultService={openVaultService}
                openingServiceId={openingServiceId}
              />
            ))}
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
    </>
  );
}
