import { issueOpeningTicket } from './useVault';
import { useEffect, useCallback, useRef } from 'react';
import type { CatalogService, ChromeBridge, ExtensionReply, ExtensionSettings } from '../types';
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
    | 'setExtensionSettings'
    | 'showExtensionGuide'
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
    setExtensionSettings,
    showExtensionGuide,
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

  const checkId = useRef(0);
  const recheckExtension = useCallback(async () => {
    const id = ++checkId.current;
    setExtensionState('checking');
    try {
      const reply = await extensionMessage({ type: 'PING' });
      if (id !== checkId.current) return false;
      const ready = reply.status === 'ok';
      setExtensionState(ready ? 'detected' : 'missing');
      if (ready && validSettings(reply.settings)) setExtensionSettings(reply.settings);
      return ready;
    } catch {
      if (id === checkId.current) setExtensionState('missing');
      return false;
    }
  }, [setExtensionState, setExtensionSettings]);
  useEffect(() => {
    const active = () => {
      void recheckExtension();
    };
    window.addEventListener('hublink-extension-active', active);
    active();
    return () => {
      checkId.current++;
      window.removeEventListener('hublink-extension-active', active);
    };
  }, [recheckExtension]);
  useEffect(() => {
    if (!showExtensionGuide) return;
    const interval = window.setInterval(() => {
      void recheckExtension();
    }, 4000);
    return () => window.clearInterval(interval);
  }, [showExtensionGuide, recheckExtension]);
  async function updateExtensionSettings(patch: Partial<ExtensionSettings>) {
    const reply = await extensionMessage({ type: 'UPDATE_EXTENSION_SETTINGS', settings: patch });
    if (reply.status !== 'ok' || !validSettings(reply.settings))
      throw new Error('Não foi possível salvar. Recarregue a extensão e verifique a conexão.');
    setExtensionSettings(reply.settings);
    setExtensionState('detected');
  }
  async function downloadExtensionPackage() {
    const response = await fetch('/api/extension/package', { cache: 'no-store' });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(
        body.error ?? 'Não foi possível baixar o pacote. Entre novamente e tente baixar.',
      );
    }
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'hublink-chrome-extension.zip';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
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
  return { openVaultService, recheckExtension, updateExtensionSettings, downloadExtensionPackage };
}

function validSettings(value: unknown): value is ExtensionSettings {
  if (!value || typeof value !== 'object') return false;
  const settings = value as Record<string, unknown>;
  return ['openOnStartup', 'openOnNewTab', 'showToastNotifications'].every(
    (key) => typeof settings[key] === 'boolean',
  );
}
