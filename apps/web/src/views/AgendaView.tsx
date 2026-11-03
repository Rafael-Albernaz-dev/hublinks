import { useEffect, useState } from 'react';
import type { AgendaCard, AgendaColumnId, User } from '../types';
import { Icon } from '../icons';

const COLUMNS: { id: AgendaColumnId; label: string; icon: 'List' | 'Layers' | 'Check' }[] = [
  { id: 'todo', label: 'A Fazer', icon: 'List' },
  { id: 'in_progress', label: 'Em Progresso', icon: 'Layers' },
  { id: 'done', label: 'Concluído', icon: 'Check' },
];

export function AgendaView({ currentUser }: { currentUser: User }) {
  const [cards, setCards] = useState<AgendaCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingCardId, setSavingCardId] = useState<string | null>(null);
  const [newTitles, setNewTitles] = useState<Record<AgendaColumnId, string>>({
    todo: '',
    in_progress: '',
    done: '',
  });

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch('/api/agenda');
        if (!res.ok) throw new Error('Não foi possível carregar a agenda.');
        const data = (await res.json()) as { cards: AgendaCard[] };
        if (active) setCards(data.cards || []);
      } catch (err) {
        if (active) setNotice(err instanceof Error ? err.message : 'Erro ao carregar.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [currentUser.id]);

  async function handleAddCard(colId: AgendaColumnId) {
    const title = newTitles[colId]?.trim();
    if (!title) return;

    try {
      const res = await fetch('/api/agenda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, columnId: colId }),
      });
      if (!res.ok) throw new Error('Falha ao adicionar card.');
      const newCard = (await res.json()) as AgendaCard;
      setCards((prev) => (prev.some((c) => c.id === newCard.id) ? prev : [...prev, newCard]));
      setNewTitles((prev) => ({ ...prev, [colId]: '' }));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erro ao adicionar card.');
    }
  }

  async function handleAutoSaveTitle(cardId: string, originalTitle: string, newTitle: string) {
    const trimmed = newTitle.trim();
    if (!trimmed || trimmed === originalTitle) return;

    setSavingCardId(cardId);
    try {
      const res = await fetch(`/api/agenda/${cardId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      });
      if (!res.ok) throw new Error('Falha no salvamento automático.');
      const updated = (await res.json()) as AgendaCard;
      setCards((prev) => prev.map((c) => (c.id === cardId ? updated : c)));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erro ao salvar alteração.');
    } finally {
      setTimeout(() => setSavingCardId(null), 800);
    }
  }

  async function handleMoveColumn(card: AgendaCard, targetCol: AgendaColumnId) {
    setSavingCardId(card.id);
    // Optimistic UI update
    setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, columnId: targetCol } : c)));

    try {
      const res = await fetch(`/api/agenda/${card.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId: targetCol }),
      });
      if (!res.ok) throw new Error('Falha ao mover card.');
      const updated = (await res.json()) as AgendaCard;
      setCards((prev) => prev.map((c) => (c.id === card.id ? updated : c)));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erro ao mover card.');
      // Rollback
      setCards((prev) =>
        prev.map((c) => (c.id === card.id ? { ...c, columnId: card.columnId } : c)),
      );
    } finally {
      setTimeout(() => setSavingCardId(null), 500);
    }
  }

  async function handleDeleteCard(cardId: string) {
    try {
      const res = await fetch(`/api/agenda/${cardId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Falha ao excluir card.');
      setCards((prev) => prev.filter((c) => c.id !== cardId));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Erro ao excluir card.');
    }
  }

  return (
    <section aria-labelledby="agenda-title">
      <div className="hb-page-intro">
        <h1 id="agenda-title">Minha Agenda</h1>
        <p>
          Quadro Kanban pessoal com salvamento automático. Somente você tem acesso a estas tarefas.
        </p>
      </div>

      {notice && (
        <p className="notice" role="status" aria-live="polite">
          {notice}
        </p>
      )}

      {loading ? (
        <p>Carregando sua agenda...</p>
      ) : (
        <div className="hb-kanban-board" role="region" aria-label="Quadro de tarefas">
          {COLUMNS.map((col, colIdx) => {
            const colCards = cards.filter((c) => c.columnId === col.id);
            const prevCol = colIdx > 0 ? (COLUMNS[colIdx - 1]?.id ?? null) : null;
            const nextCol = colIdx < COLUMNS.length - 1 ? (COLUMNS[colIdx + 1]?.id ?? null) : null;

            return (
              <div key={col.id} className="hb-kanban-column" data-column={col.id}>
                <div className="hb-kanban-column-header">
                  <span className="hb-kanban-column-title">
                    <Icon name={col.icon} />
                    {col.label}
                  </span>
                  <span className="hb-kanban-count-pill" aria-label={`${colCards.length} tarefas`}>
                    {colCards.length}
                  </span>
                </div>

                <div className="hb-kanban-card-list">
                  {colCards.length === 0 ? (
                    <p className="catalog-empty" style={{ margin: '16px 0', fontSize: '12px' }}>
                      Nenhum item nesta coluna.
                    </p>
                  ) : (
                    colCards.map((card) => (
                      <KanbanCardItem
                        key={card.id}
                        card={card}
                        isSaving={savingCardId === card.id}
                        onBlurSave={handleAutoSaveTitle}
                        prevCol={prevCol}
                        nextCol={nextCol}
                        onMove={handleMoveColumn}
                        onDelete={handleDeleteCard}
                      />
                    ))
                  )}
                </div>

                <form
                  className="hb-kanban-add-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleAddCard(col.id);
                  }}
                >
                  <input
                    className="hb-kanban-add-input"
                    type="text"
                    placeholder={`Nova tarefa em ${col.label.toLowerCase()}...`}
                    value={newTitles[col.id] || ''}
                    onChange={(e) =>
                      setNewTitles((prev) => ({ ...prev, [col.id]: e.target.value }))
                    }
                    aria-label={`Nova tarefa em ${col.label}`}
                  />
                  <button
                    type="submit"
                    className="hb-kanban-add-btn"
                    disabled={!newTitles[col.id]?.trim()}
                    aria-label={`Adicionar tarefa em ${col.label}`}
                  >
                    <Icon name="Plus" />
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function KanbanCardItem({
  card,
  isSaving,
  onBlurSave,
  prevCol,
  nextCol,
  onMove,
  onDelete,
}: {
  card: AgendaCard;
  isSaving: boolean;
  onBlurSave: (cardId: string, original: string, updated: string) => void;
  prevCol: AgendaColumnId | null;
  nextCol: AgendaColumnId | null;
  onMove: (card: AgendaCard, target: AgendaColumnId) => void;
  onDelete: (cardId: string) => void;
}) {
  const [localTitle, setLocalTitle] = useState(card.title);

  useEffect(() => {
    setLocalTitle(card.title);
  }, [card.title]);

  return (
    <div className="hb-kanban-card" data-card-id={card.id}>
      <textarea
        className="hb-kanban-card-input"
        value={localTitle}
        onChange={(e) => setLocalTitle(e.target.value)}
        onBlur={() => onBlurSave(card.id, card.title, localTitle)}
        aria-label="Conteúdo da tarefa"
        rows={2}
      />
      <div className="hb-kanban-card-footer">
        <span className="hb-kanban-autosave-indicator">
          {isSaving ? 'Salvando...' : 'Auto-save'}
        </span>
        <div className="hb-kanban-card-actions">
          {prevCol && (
            <button
              type="button"
              className="hb-kanban-action-btn"
              onClick={() => onMove(card, prevCol)}
              title="Mover para coluna anterior"
              aria-label="Mover para coluna anterior"
            >
              <Icon name="ChevronLeft" />
            </button>
          )}
          {nextCol && (
            <button
              type="button"
              className="hb-kanban-action-btn"
              onClick={() => onMove(card, nextCol)}
              title="Mover para próxima coluna"
              aria-label="Mover para próxima coluna"
            >
              <Icon name="ChevronRight" />
            </button>
          )}
          <button
            type="button"
            className="hb-kanban-action-btn"
            onClick={() => onDelete(card.id)}
            title="Excluir tarefa"
            aria-label="Excluir tarefa"
          >
            <Icon name="Trash" />
          </button>
        </div>
      </div>
    </div>
  );
}
