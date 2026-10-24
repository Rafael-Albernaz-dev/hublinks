import { pages } from '../components/pages';
import type { AuthenticatedWorkspace } from '../hooks/useWorkspace';
import { Icon } from '../icons';
export function Navigation({
  page,
  currentUser,
  apiState,
  setPage,
}: Pick<AuthenticatedWorkspace, 'page' | 'currentUser' | 'apiState' | 'setPage'>) {
  return (
    <>
      <nav className="hb-nav" aria-label="Telas do Workspace">
        {pages.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={page === item.id ? 'page' : undefined}
            disabled={
              ((item.id === 'equipe' || item.id === 'auditoria') && currentUser.role !== 'admin') ||
              (item.id === 'identidade' && apiState !== 'online')
            }
            onClick={() => setPage(item.id)}
          >
            <Icon name={item.icon} />
            {item.label}
          </button>
        ))}
      </nav>
    </>
  );
}
