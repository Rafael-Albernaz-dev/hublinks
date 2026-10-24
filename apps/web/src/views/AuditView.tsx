import { useEffect, useState } from 'react';

type AuditEvent = {
  id: string;
  actorEmail: string | null;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  ip: string | null;
  createdAt: string;
};

export function AuditView() {
  const [filters, setFilters] = useState({ action: '', userId: '', from: '', to: '' });
  const [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0);
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<{ events: AuditEvent[]; total: number }>({
    events: [],
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setResult({ events: [], total: 0 });
    void fetch(`/api/admin/audit?limit=50&offset=${offset}${query}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Não foi possível carregar a auditoria.');
        const data = (await response.json()) as { events: AuditEvent[]; total: number };
        if (!controller.signal.aborted) setResult(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Não foi possível carregar a auditoria.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [offset, query, revision]);
  return (
    <section aria-labelledby="audit-title">
      <div className="hb-page-intro">
        <h1 id="audit-title">Logs de auditoria</h1>
        <p>Histórico de acessos, autenticações e operações sensíveis do sistema.</p>
      </div>
      <form
        className="catalog-toolbar audit-filters"
        onSubmit={(event) => {
          event.preventDefault();
          const params = new URLSearchParams();
          for (const [key, value] of Object.entries(filters)) {
            if (value)
              params.set(
                key,
                key === 'from' || key === 'to' ? new Date(value).toISOString() : value,
              );
          }
          setOffset(0);
          setQuery(`&${params.toString()}`);
          setRevision((value) => value + 1);
        }}
      >
        <label>
          Ação
          <input
            value={filters.action}
            maxLength={50}
            placeholder="login"
            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
          />
        </label>
        <label>
          ID do usuário
          <input
            value={filters.userId}
            onChange={(e) => setFilters({ ...filters, userId: e.target.value })}
          />
        </label>
        <label>
          De
          <input
            type="datetime-local"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          />
        </label>
        <label>
          Até
          <input
            type="datetime-local"
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
          />
        </label>
        <button type="submit">Filtrar auditoria</button>
      </form>
      <p role="status">{loading ? 'Carregando auditoria…' : error || `${result.total} eventos`}</p>
      <div className="hb-table-wrap" aria-busy={loading}>
        <table className="hb-table" aria-label="Logs de auditoria">
          <thead>
            <tr>
              {['Data / Hora', 'Ação', 'Usuário / Ator', 'Alvo', 'Endereço IP'].map((label) => (
                <th scope="col" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.events.map((event) => (
              <tr key={event.id}>
                <td>
                  <time dateTime={event.createdAt}>
                    {new Date(event.createdAt).toLocaleString('pt-BR')}
                  </time>
                </td>
                <td>
                  <span
                    className={
                      event.action.includes('failed')
                        ? 'hb-status-pill is-pending'
                        : 'hb-badge hb-badge-accent'
                    }
                  >
                    {event.action}
                  </span>
                </td>
                <td>{event.actorEmail ?? event.actorUserId ?? 'Sistema'}</td>
                <td>
                  {event.targetType}
                  {event.targetId ? ` · ${event.targetId}` : ''}
                </td>
                <td>{event.ip ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && !error && result.events.length === 0 && <p>Nenhum evento encontrado.</p>}
      <div className="catalog-toolbar">
        <button
          type="button"
          disabled={loading || offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 50))}
        >
          Anterior
        </button>
        <span>Página {Math.floor(offset / 50) + 1}</span>
        <button
          type="button"
          disabled={loading || !!error || offset + 50 >= result.total}
          onClick={() => setOffset(offset + 50)}
        >
          Próxima
        </button>
      </div>
    </section>
  );
}
