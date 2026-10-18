import { issueOpeningTicket } from './useVault';
import { useEffect } from 'react';
import type { CatalogService, ChromeBridge, ExtensionReply } from '../types';
import type { WorkspaceState } from './useWorkspaceState';
function extensionMessage(message: unknown): Promise<ExtensionReply> {
  return new Promise((resolve, reject) => {
    const runtime = (window as Window & { chrome?: ChromeBridge }).chrome?.runtime;
    const extensionId =
      (import.meta.env.VITE_HUB_EXTENSION_ID as string | undefined) ||
      'nhodfnpljikjfeoihaimabljdenmfbio';
    if (!runtime || !extensionId || !/^[a-p]{32}$/.test(extensionId))
      return reject(new Error('Extension unavailable'));
    const timeout = window.setTimeout(() => reject(new Error('Extension timeout')), 1500);
    try {
      runtime.sendMessage(extensionId, message, (reply) => {
        window.clearTimeout(timeout);
        if (runtime.lastError || !reply) reject(new Error('Extension unavailable'));
        else resolve(reply);
      });
    } catch (error) {
      window.clearTimeout(timeout);
      reject(error);
    }
  });
}
export function useExtensionBridge(
  state: Pick<
    WorkspaceState,
    | 'setExtensionState'
    | 'openingServiceId'
    | 'setOpeningNotice'
    | 'setIndividualModal'
    | 'setIndividualUsername'
    | 'setIndividualPassword'
    | 'setIndividualError'
    | 'setExtensionModal'
    | 'setShowExtensionGuide'
    | 'setOpeningServiceId'
    | 'extensionState'
  >,
) {
  const {
    setExtensionState,
    openingServiceId,
    setOpeningNotice,
    setIndividualModal,
    setIndividualUsername,
    setIndividualPassword,
    setIndividualError,
    setExtensionModal,
    setShowExtensionGuide,
    setOpeningServiceId,
    extensionState,
  } = state;

  useEffect(() => {
    let current = true;
    const onExtensionActive = () => {
      if (current) setExtensionState('detected');
    };
    window.addEventListener('hublink-extension-active', onExtensionActive);
    if (document.documentElement.getAttribute('data-hublink-extension') === 'active')
      onExtensionActive();
    void extensionMessage({ type: 'PING' })
      .then((reply) => {
        if (current) setExtensionState(reply.status === 'ok' ? 'detected' : 'missing');
      })
      .catch(() => {
        if (current && document.documentElement.getAttribute('data-hublink-extension') !== 'active')
          setExtensionState('missing');
      });
    return () => {
      current = false;
      window.removeEventListener('hublink-extension-active', onExtensionActive);
    };
  }, []);
  async function openVaultService(service: CatalogService) {
    if (!service.targetUrl || openingServiceId) return;
    setOpeningNotice('');

    if (service.credentialType === 'individual' && !service.hasCredential) {
      setIndividualModal(service);
      setIndividualUsername('');
      setIndividualPassword('');
      setIndividualError('');
      return;
    }

    // DOM markers can be spoofed by the page; confirm the bridge before issuing a ticket.
    const extensionReady = await extensionMessage({ type: 'PING' })
      .then((reply) => reply.status === 'ok')
      .catch(() => false);
    if (!extensionReady) {
      setExtensionState('missing');
      setExtensionModal(service);
      setShowExtensionGuide(true);
      return;
    }
    setOpeningServiceId(service.id);
    try {
      const response = await issueOpeningTicket(service.id);
      if (!response.ok) {
        if (service.credentialType === 'individual' && response.status === 404) {
          setIndividualModal(service);
          setIndividualUsername('');
          setIndividualPassword('');
          setIndividualError('');
          return;
        }
        const errData = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(
          errData.error || 'Não foi possível emitir o bilhete. Verifique sua credencial.',
        );
      }
      const data = (await response.json()) as {
        ticket: string;
        serviceId: string;
        targetUrl: string;
      };
      if (data.serviceId !== service.id || data.targetUrl !== service.targetUrl)
        throw new Error('Resposta de bilhete inválida.');
      const reply = await extensionMessage({ type: 'OPEN_SERVICE', ...data });
      if (reply.status !== 'opened') throw new Error('A extensão não conseguiu abrir o destino.');
      setOpeningNotice('Destino aberto com preenchimento assistido.');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Falha ao abrir destino.';
      setOpeningNotice(msg);
      if (
        extensionState !== 'detected' ||
        msg.includes('extensão') ||
        msg.includes('Extension') ||
        msg.includes('bilhete')
      ) {
        setExtensionModal(service);
        setShowExtensionGuide(true);
      }
    } finally {
      setOpeningServiceId(null);
    }
  }
  return { openVaultService };
}
