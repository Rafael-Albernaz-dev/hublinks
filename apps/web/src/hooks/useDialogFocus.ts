import { useEffect } from 'react';
import type { WorkspaceState } from './useWorkspaceState';
export function useDialogFocus({
  showExtensionGuide,
  individualModal,
  dialogRef,
  setShowExtensionGuide,
  setExtensionModal,
  setIndividualModal,
  setIndividualUsername,
  setIndividualPassword,
  setIndividualError,
}: Pick<
  WorkspaceState,
  | 'showExtensionGuide'
  | 'individualModal'
  | 'dialogRef'
  | 'setShowExtensionGuide'
  | 'setExtensionModal'
  | 'setIndividualModal'
  | 'setIndividualUsername'
  | 'setIndividualPassword'
  | 'setIndividualError'
>) {
  useEffect(() => {
    if (showExtensionGuide || !individualModal) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button, a[href], input, select, textarea, [tabindex="0"]',
        ) ?? [],
      ).filter((node) => !node.hasAttribute('disabled'));
    focusable()[0]?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setShowExtensionGuide(false);
        setExtensionModal(null);
        setIndividualModal(null);
        setIndividualUsername('');
        setIndividualPassword('');
        setIndividualError('');
      }
      if (event.key === 'Tab') {
        const nodes = focusable();
        const next = event.shiftKey ? nodes.at(-1) : nodes[0];
        if (
          (event.shiftKey && document.activeElement === nodes[0]) ||
          (!event.shiftKey && document.activeElement === nodes.at(-1))
        ) {
          event.preventDefault();
          next?.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [showExtensionGuide, individualModal]);
}
