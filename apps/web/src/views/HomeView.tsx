import { SearchBar } from '../components/SearchBar';
import { useState } from 'react';
import { HomeServiceViews, HomeToolbar } from '../components/HomeServiceViews';
import type { HomeCategory, HomeAccess } from '../components/HomeServiceViews';
import { pages } from '../components/pages';
import { normalizeSearch } from '../hooks/normalizeSearch';
import type { AuthenticatedWorkspace } from '../hooks/useWorkspace';
import { Icon } from '../icons';
export function HomeView({
  preferences,
  updatePreferences,
  setNotice,
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
  | 'preferences'
  | 'updatePreferences'
  | 'setNotice'
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
  const [preferenceError, setPreferenceError] = useState('');
  const [category, setCategory] = useState<HomeCategory>('all');
  const [access, setAccess] = useState<HomeAccess>('all');
  const [draggingShortcut, setDraggingShortcut] = useState<string | null>(null);
  const shortcuts = [...pages.slice(1)].sort((a, b) => {
    const rank = (id: string) => {
      const index = preferences.shortcutOrder.indexOf(id);
      return index < 0 ? preferences.shortcutOrder.length : index;
    };
    return rank(a.id) - rank(b.id);
  });
  const ordered = [...catalog].sort((a, b) => {
    const rank = (id: string) => {
      const index = preferences.cardOrder.indexOf(id);
      return index < 0 ? preferences.cardOrder.length : index;
    };
    return rank(a.id) - rank(b.id);
  });
  const filtered = ordered.filter(
    (service) =>
      normalizeSearch(service.name + ' ' + service.category).includes(normalizeSearch(query)) &&
      (category === 'all' || service.category === category) &&
      (access === 'all' ||
        (access === 'personal'
          ? service.ownerUserId === currentUser.id
          : service.credentialType === access)),
  );
  const save = (patch: Parameters<typeof updatePreferences>[0]) => {
    setPreferenceError('');
    void updatePreferences(patch).catch(() => {
      setPreferenceError('Não foi possível salvar suas preferências.');
      setNotice('Não foi possível salvar suas preferências.');
    });
  };
  function reorder(source: string, target: string) {
    const ids = ordered.map((service) => service.id);
    const from = ids.indexOf(source),
      to = ids.indexOf(target);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, source);
    save({ cardOrder: ids.slice(0, 100) });
  }
  function reorderShortcut(source: string, target: string) {
    const ids = shortcuts.map((item) => item.id as string);
    const from = ids.indexOf(source),
      to = ids.indexOf(target);
    if (from < 0 || to < 0 || from === to) return;
    ids.splice(from, 1);
    ids.splice(to, 0, source);
    save({ shortcutOrder: ids });
  }
  return (
    <>
      <section hidden={page !== 'inicio'} aria-label="Início">
        <div className="hb-title-row">
          <div>
            <span className="hb-eyebrow">{config.homeEyebrow || 'SEU ESPAÇO DE TRABALHO'}</span>
            <h1>{config.homeTitle || 'Um bom dia começa aqui.'}</h1>
            <p>{config.subtitle || 'Serviços, consultas e acessos da equipe.'}</p>
          </div>
          <button
            type="button"
            className="hb-icon-action"
            aria-label={preferences.showShortcutCards ? 'Ocultar atalhos' : 'Mostrar atalhos'}
            title={preferences.showShortcutCards ? 'Ocultar atalhos' : 'Mostrar atalhos'}
            aria-pressed={preferences.showShortcutCards}
            onClick={() => save({ showShortcutCards: !preferences.showShortcutCards })}
          >
            <Icon name={preferences.showShortcutCards ? 'EyeOff' : 'Eye'} />
          </button>
        </div>
        {preferences.showShortcutCards && (
          <div
            className={
              'hb-shortcuts' + (preferences.shortcutStyle === 'chips' ? ' hb-shortcut-chips' : '')
            }
          >
            {shortcuts.map((item) => (
              <button
                key={item.id}
                type="button"
                className={'hb-shortcut' + (draggingShortcut === item.id ? ' is-dragging' : '')}
                draggable
                onDragStart={(event) => {
                  setDraggingShortcut(item.id);
                  event.dataTransfer?.setData('text/plain', item.id);
                  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggingShortcut) reorderShortcut(draggingShortcut, item.id);
                  setDraggingShortcut(null);
                }}
                onDragEnd={() => setDraggingShortcut(null)}
                onKeyDown={(event) => {
                  if (
                    !event.altKey ||
                    !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
                  )
                    return;
                  event.preventDefault();
                  const index = shortcuts.findIndex((shortcut) => shortcut.id === item.id);
                  const target =
                    shortcuts[index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1)];
                  if (target) reorderShortcut(item.id, target.id);
                }}
                disabled={
                  (item.id === 'equipe' && currentUser.role !== 'admin') ||
                  (item.id === 'identidade' && apiState !== 'online')
                }
                onClick={() => setPage(item.id)}
              >
                <Icon name={item.icon} />
                <span>
                  <b>{item.label}</b>
                  <small>
                    {
                      {
                        inicio: '',
                        catalogo: catalog.length + ' serviços',
                        cofre: 'Individuais e equipe',
                        equipe: 'Pessoas e permissões',
                        identidade: 'Marca e aparência',
                      }[item.id]
                    }
                  </small>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
      {page === 'inicio' && (
        <section aria-label="Serviços">
          <div className="hb-section-head">
            <h2>Seus serviços</h2>
            <SearchBar value={query} onChange={setQuery} label="Buscar serviços no Workspace" />
          </div>
          <HomeToolbar
            category={category}
            onCategory={setCategory}
            access={access}
            onAccess={setAccess}
            layout={preferences.homeLayout}
            onLayout={(homeLayout) => save({ homeLayout })}
          />
          <p className="visually-hidden" role="status" aria-live="polite">
            {filtered.length} serviços encontrados
          </p>
          {preferenceError && (
            <p role="alert" className="form-error">
              {preferenceError}
            </p>
          )}
          {catalogError && (
            <p role="alert" className="form-error">
              {catalogError}
            </p>
          )}
          <HomeServiceViews
            key={category + access + query + preferences.homeLayout}
            services={filtered}
            layout={preferences.homeLayout}
            onReorder={reorder}
            gridRef={gridRef}
            cardProps={{
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
            }}
          />
          {!catalog.length && !catalogError && (
            <div className="empty-state">
              <h3>Catálogo vazio</h3>
              <p>O administrador pode adicionar cards na tela Catálogo.</p>
            </div>
          )}
          {catalog.length > 0 && !filtered.length && <p>Nenhum serviço encontrado.</p>}
        </section>
      )}
    </>
  );
}
