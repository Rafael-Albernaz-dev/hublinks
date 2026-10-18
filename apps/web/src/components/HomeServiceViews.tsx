import { useState } from 'react';
import type { ComponentProps, RefObject } from 'react';
import type { CatalogService, HomeLayoutMode } from '../types';
import { ServiceCard } from './ServiceCard';

export const homeFilters = [
  ['all', 'Todos'],
  ['sva', 'SVA'],
  ['crm', 'CRM'],
  ['sheet', 'Planilhas'],
  ['sistemas', 'Sistemas'],
  ['outros', 'Outros'],
  ['shared', 'Compartilhado'],
  ['individual', 'Individual'],
  ['personal', 'Pessoais'],
] as const;
export type HomeFilter = (typeof homeFilters)[number][0];
export function HomeToolbar({
  filter,
  onFilter,
  layout,
  onLayout,
}: {
  filter: HomeFilter;
  onFilter: (value: HomeFilter) => void;
  layout: HomeLayoutMode;
  onLayout: (value: HomeLayoutMode) => void;
}) {
  return (
    <div className="hb-home-filters">
      <div className="hb-filter-pills" role="group" aria-label="Filtrar serviços na tela inicial">
        {homeFilters.map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={filter === value}
            onClick={() => onFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="hb-layout-switcher" role="group" aria-label="Modo de exibição dos serviços">
        {(
          [
            ['grid', 'Grade'],
            ['list', 'Lista'],
            ['carousel', 'Carrossel'],
          ] as const
        ).map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={layout === value}
            onClick={() => onLayout(value)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
type CardProps = Omit<ComponentProps<typeof ServiceCard>, 'service'>;
export function HomeServiceViews({
  services,
  layout,
  onReorder,
  gridRef,
  cardProps,
}: {
  services: CatalogService[];
  layout: HomeLayoutMode;
  onReorder: (source: string, target: string) => void;
  gridRef: RefObject<HTMLDivElement | null>;
  cardProps: CardProps;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);
  const pageCount = Math.ceil(services.length / 3);
  const activeSlide = Math.min(slide, Math.max(0, pageCount - 1));
  const cards = (items: CatalogService[]) =>
    items.map((service) => (
      <ServiceCard
        {...cardProps}
        key={service.id}
        service={service}
        className={
          (layout === 'list' ? 'hb-service-row' : '') +
          (dragging === service.id ? ' is-dragging' : '') +
          (over === service.id ? ' is-drag-over' : '')
        }
        dragProps={
          layout === 'grid'
            ? {
                draggable: true,
                onDragStart: (event) => {
                  setDragging(service.id);
                  event.dataTransfer?.setData('text/plain', service.id);
                  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
                },
                onDragOver: (event) => {
                  event.preventDefault();
                  setOver(service.id);
                },
                onDragEnd: () => {
                  setDragging(null);
                  setOver(null);
                },
                onDrop: (event) => {
                  event.preventDefault();
                  const source = dragging ?? event.dataTransfer?.getData('text/plain');
                  if (source && source !== service.id) onReorder(source, service.id);
                  setDragging(null);
                  setOver(null);
                },
                // Keyboard alternative to dragging: Alt + arrow keys.
                onKeyDown: (event) => {
                  if (
                    !event.altKey ||
                    !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
                  )
                    return;
                  event.preventDefault();
                  const index = services.findIndex((item) => item.id === service.id);
                  const target =
                    services[index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1)];
                  if (target) onReorder(service.id, target.id);
                },
              }
            : undefined
        }
      />
    ));
  if (layout === 'carousel')
    return (
      <div className="hb-carousel" aria-label="Carrossel de serviços">
        <div className="hb-carousel-track">
          {cards(services.slice(activeSlide * 3, activeSlide * 3 + 3))}
        </div>
        {pageCount > 0 && (
          <div className="hb-carousel-controls">
            <button
              type="button"
              aria-label="Slide anterior"
              disabled={activeSlide === 0}
              onClick={() => setSlide(activeSlide - 1)}
            >
              Anterior
            </button>
            <div className="hb-carousel-dots" aria-label="Páginas do carrossel">
              {Array.from({ length: pageCount }, (_, index) => (
                <button
                  type="button"
                  key={index}
                  aria-label={`Ir para página ${index + 1}`}
                  aria-current={activeSlide === index ? 'true' : undefined}
                  onClick={() => setSlide(index)}
                />
              ))}
            </div>
            <button
              type="button"
              aria-label="Próximo slide"
              disabled={activeSlide === pageCount - 1}
              onClick={() => setSlide(activeSlide + 1)}
            >
              Próximo
            </button>
          </div>
        )}
      </div>
    );
  return (
    <div
      className={layout === 'list' ? 'hb-service-list' : 'hb-grid'}
      ref={layout === 'grid' ? gridRef : undefined}
    >
      {cards(services)}
    </div>
  );
}
