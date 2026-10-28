import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useRef, useState } from 'react';

export function useServiceFavicon({
  targetUrl,
  setTargetUrl,
  initialLogoDataUrl,
}: {
  targetUrl: string;
  setTargetUrl: Dispatch<SetStateAction<string>>;
  initialLogoDataUrl?: string | null;
}) {
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(initialLogoDataUrl ?? null);
  const [manualLogo, setManualLogo] = useState<boolean>(Boolean(initialLogoDataUrl));
  const [faviconStatus, setFaviconStatus] = useState<'idle' | 'loading' | 'captured' | 'failed'>(
    'idle',
  );
  const [capturedHost, setCapturedHost] = useState<string>('');
  const [faviconMessage, setFaviconMessage] = useState<string>('');
  const latestUrl = useRef(targetUrl);
  latestUrl.current = targetUrl;
  const attemptId = useRef(0);
  async function fetchFaviconForUrl(rawUrl: string, isManualTrigger = false) {
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      if (isManualTrigger) {
        setFaviconStatus('failed');
        setFaviconMessage('Informe um endereço HTTPS válido antes de capturar o favicon.');
      }
      return;
    }
    const candidateUrl =
      trimmed.startsWith('https://') || trimmed.startsWith('http://')
        ? trimmed
        : `https://${trimmed}`;
    let parsed: URL;
    try {
      parsed = new URL(candidateUrl);
      if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
        if (isManualTrigger) {
          setFaviconStatus('failed');
          setFaviconMessage('O endereço precisa usar HTTPS público para capturar o favicon.');
        }
        return;
      }
    } catch {
      if (isManualTrigger) {
        setFaviconStatus('failed');
        setFaviconMessage('Endereço HTTPS inválido para captura de favicon.');
      }
      return;
    }
    if (isManualTrigger && candidateUrl !== trimmed) {
      setTargetUrl(parsed.href);
      latestUrl.current = parsed.href;
    }
    const id = ++attemptId.current;
    const requestedUrl = latestUrl.current;
    setFaviconStatus('loading');
    setFaviconMessage(`Buscando favicon de ${parsed.hostname}...`);
    try {
      const response = await fetch(`/api/catalog/favicon?url=${encodeURIComponent(parsed.origin)}`);
      if (id !== attemptId.current || latestUrl.current !== requestedUrl) return;
      if (!response.ok) {
        setFaviconStatus(isManualTrigger ? 'failed' : 'idle');
        setFaviconMessage(
          isManualTrigger ? 'Não foi possível consultar o favicon para este endereço.' : '',
        );
        return;
      }
      const data = (await response.json()) as { logoDataUrl?: string | null; host?: string };
      if (id !== attemptId.current || latestUrl.current !== requestedUrl) return;
      if (typeof data.logoDataUrl === 'string' && data.logoDataUrl.startsWith('data:image/')) {
        setLogoDataUrl(data.logoDataUrl);
        setCapturedHost(data.host || parsed.hostname);
        setFaviconStatus('captured');
        setFaviconMessage(`Favicon capturado de ${data.host || parsed.hostname}`);
      } else {
        setFaviconStatus(isManualTrigger ? 'failed' : 'idle');
        setFaviconMessage(
          isManualTrigger
            ? `Nenhum favicon público encontrado em ${parsed.hostname}. Você pode enviar uma logo manualmente.`
            : '',
        );
      }
    } catch {
      if (id !== attemptId.current || latestUrl.current !== requestedUrl) return;
      setFaviconStatus(isManualTrigger ? 'failed' : 'idle');
      setFaviconMessage(
        isManualTrigger ? 'Erro ao buscar o favicon. Envie uma logo manualmente.' : '',
      );
    }
  }

  useEffect(() => {
    if (manualLogo || !targetUrl.trim()) return;
    let parsed: URL;
    try {
      parsed = new URL(targetUrl.trim());
      if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
        return;
      }
    } catch {
      return;
    }
    const timer = window.setTimeout(() => {
      void fetchFaviconForUrl(parsed.href, false);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [targetUrl, manualLogo]);

  return {
    logoDataUrl,
    setLogoDataUrl,
    manualLogo,
    setManualLogo,
    faviconStatus,
    setFaviconStatus,
    capturedHost,
    faviconMessage,
    setFaviconMessage,
    fetchFaviconForUrl,
  };
}
