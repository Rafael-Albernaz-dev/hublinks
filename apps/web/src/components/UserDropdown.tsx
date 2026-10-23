import { useEffect, useRef, useState } from 'react';
import type { AuthenticatedWorkspace } from '../hooks/useWorkspace';
import { Icon } from '../icons';

export function UserDropdown({
  currentUser,
  setPage,
  setExtensionModal,
  setShowExtensionGuide,
  theme,
  setTheme,
  authBusy,
  logout,
}: Pick<
  AuthenticatedWorkspace,
  | 'currentUser'
  | 'setPage'
  | 'setExtensionModal'
  | 'setShowExtensionGuide'
  | 'theme'
  | 'setTheme'
  | 'authBusy'
  | 'logout'
>) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const focusLast = useRef(false);
  useEffect(() => {
    if (!open) return;
    const items = root.current?.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]:not(:disabled)',
    );
    if (items?.length) items[focusLast.current ? items.length - 1 : 0]?.focus();
    focusLast.current = false;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <div
      className="hb-user-dropdown"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          close();
        }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          if (!open) {
            focusLast.current = event.key === 'ArrowUp' || event.key === 'End';
            setOpen(true);
            return;
          }
          const items = Array.from(
            root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ??
              [],
          );
          const index = items.indexOf(document.activeElement as HTMLButtonElement);
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? items.length - 1
                : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
          items[next]?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        className="hb-user-trigger"
        type="button"
        aria-label={'Menu do usuário: ' + currentUser.displayName}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="user-menu"
        onClick={() => setOpen(!open)}
      >
        <span className="hb-user-avatar">
          {currentUser.avatar ? (
            <img src={currentUser.avatar} alt="" />
          ) : (
            currentUser.displayName
              .trim()
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0])
              .join('')
              .toUpperCase()
          )}
        </span>
        <span className="hb-user-name">{currentUser.displayName}</span>
        <Icon name="ChevronDown" />
      </button>
      {open && (
        <div className="hb-user-dropdown-menu" id="user-menu" role="menu" aria-label="Conta">
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              close();
              setPage('perfil');
            }}
          >
            <Icon name="UserRound" />
            Meu Perfil
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              close();
              setExtensionModal(null);
              setShowExtensionGuide(true);
            }}
          >
            <Icon name="Sparkles" />
            Central da Extensão
          </button>
          <button
            role="menuitem"
            type="button"
            aria-label={theme === 'light' ? 'Mudar para tema escuro' : 'Mudar para tema claro'}
            onClick={() => {
              setTheme(theme === 'light' ? 'dark' : 'light');
              close();
            }}
          >
            <Icon name={theme === 'light' ? 'Moon' : 'Sun'} />
            {theme === 'light' ? 'Tema Escuro' : 'Tema Claro'}
          </button>
          <div className="dropdown-divider" role="separator" />
          <button
            className="is-danger"
            role="menuitem"
            type="button"
            disabled={authBusy}
            onClick={() => {
              close();
              void logout();
            }}
          >
            <Icon name="LogOut" />
            Sair da conta
          </button>
        </div>
      )}
    </div>
  );
}
