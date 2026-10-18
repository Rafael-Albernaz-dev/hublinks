import { useEffect } from 'react';
import type { WorkspaceState } from './useWorkspaceState';
export function useCatalogEntry({
  catalog,
  entered,
  gridRef,
  page,
}: Pick<WorkspaceState, 'catalog' | 'entered' | 'gridRef' | 'page'>) {
  useEffect(() => {
    if (!catalog.length || entered.current || !gridRef.current) return;
    entered.current = true;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    Array.from(gridRef.current.children).forEach((node, index) => {
      if (node instanceof HTMLElement && node.animate)
        node.animate(
          [
            { opacity: 0, transform: 'translateY(9px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          {
            duration: 220,
            delay: Math.min(index, 5) * 35,
            easing: 'cubic-bezier(.2,.7,.2,1)',
            fill: 'backwards',
          },
        );
    });
  }, [catalog, page]);
}
