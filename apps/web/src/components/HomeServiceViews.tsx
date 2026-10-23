import { useEffect, useState } from 'react';
import type { ComponentProps, CSSProperties, RefObject } from 'react';
import type { CatalogService, HomeLayoutMode } from '../types';
import { Icon } from '../icons';
import { ServiceCard } from './ServiceCard';

export const homeCategories = [
  ['all', 'Todas as categorias'],
  ['sva', 'SVAs'],
  ['crm', 'CRM'],
  ['sheet', 'Planilhas'],
  ['sistemas', 'Sistemas'],
  ['outros', 'Outros'],
] as const;
export const homeAccess = [
  ['all', 'Todos os acessos'],
  ['shared', 'Compartilhados'],
  ['individual', 'Individuais'],
  ['personal', 'Meus serviços (Pessoais)'],
] as const;
export type HomeCategory = (typeof homeCategories)[number][0];
export type HomeAccess = (typeof homeAccess)[number][0];
export const homeLayouts = [
  ['grid', 'Grade', 'LayoutGrid'],
  ['list', 'Lista', 'List'],
  ['carousel', 'Carrossel', 'Layers'],
  ['compact', 'Compacto', 'LayoutDashboard'],
  ['sections', 'Seções', 'Columns3'],
] as const;
export function HomeToolbar({
  category,
  onCategory,
  access,
  onAccess,
  layout,
  onLayout,
}: {
  category: HomeCategory;
  onCategory: (value: HomeCategory) => void;
  access: HomeAccess;
  onAccess: (value: HomeAccess) => void;
  layout: HomeLayoutMode;
  onLayout: (value: HomeLayoutMode) => void;
}) {
  return (
    <div className="hb-home-filters">
      <div className="hb-home-selects">
        <label>
          <span className="visually-hidden">Categoria dos serviços</span>
          <select value={category} onChange={(e) => onCategory(e.target.value as HomeCategory)}>
            {homeCategories.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="visually-hidden">Tipo de acesso</span>
          <select value={access} onChange={(e) => onAccess(e.target.value as HomeAccess)}>
            {homeAccess.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="hb-layout-switcher" role="group" aria-label="Modo de exibição dos serviços">
        {homeLayouts.map(([value, label, icon]) => (
          <button
            type="button"
            key={value}
            aria-pressed={layout === value}
            aria-label={label}
            title={label}
            onClick={() => onLayout(value)}
          >
            <Icon name={icon} />
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
  const [cycle, setCycle] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media?.matches ?? false);
    media?.addEventListener?.('change', update);
    return () => media?.removeEventListener?.('change', update);
  }, []);
  const pageCount = Math.ceil(services.length / 3);
  const activeSlide = Math.min(slide, Math.max(0, pageCount - 1));
  const isPaused = hovered || focused || paused || reduced;
  const go = (index: number) => {
    setSlide((index + pageCount) % pageCount);
    setCycle((value) => value + 1);
  };
  const cards = (items: CatalogService[]) =>
    items.map((service) => (
      <ServiceCard
        {...cardProps}
        key={service.id}
        service={service}
        showCategory={layout === 'list'}
        className={
          (layout === 'list' ? 'hb-service-row' : '') +
          (dragging === service.id ? ' is-dragging' : '') +
          (over === service.id ? ' is-drag-over' : '')
        }
        dragProps={
          layout !== 'carousel'
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
                  if (dragging && dragging !== service.id) onReorder(dragging, service.id);
                  setDragging(null);
                  setOver(null);
                },
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
      <div
        className="hb-carousel"
        role="region"
        aria-roledescription="carrossel"
        aria-label="Carrossel de serviços"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
        }}
      >
        <div className="hb-carousel-window">
          <div
            className="hb-carousel-track"
            style={
              {
                '--carousel-from': `${-activeSlide * 100}%`,
                '--carousel-to': `${-(activeSlide + 1) * 100}%`,
                animationName:
                  pageCount > 1 && !reduced
                    ? cycle % 2
                      ? 'carousel-cycle-b'
                      : 'carousel-cycle-a'
                    : 'none',
                animationPlayState: isPaused ? 'paused' : 'running',
              } as CSSProperties
            }
            onAnimationEnd={(event) => {
              if (event.target === event.currentTarget) go(activeSlide + 1);
            }}
          >
            {Array.from({ length: pageCount + (pageCount > 1 ? 1 : 0) }, (_, index) => (
              <div
                className="hb-carousel-page"
                key={index}
                inert={index !== activeSlide}
                aria-hidden={index !== activeSlide}
              >
                {cards(services.slice((index % pageCount) * 3, (index % pageCount) * 3 + 3))}
              </div>
            ))}
          </div>
        </div>
        {pageCount > 0 && (
          <div className="hb-carousel-controls">
            <button
              type="button"
              aria-label="Slide anterior"
              title="Slide anterior"
              onClick={() => go(activeSlide - 1)}
            >
              <Icon name="ChevronLeft" />
            </button>
            <div className="hb-carousel-dots" aria-label="Páginas do carrossel">
              {Array.from({ length: pageCount }, (_, index) => (
                <button
                  type="button"
                  key={index}
                  aria-label={`Ir para página ${index + 1}`}
                  aria-current={activeSlide === index ? 'true' : undefined}
                  onClick={() => go(index)}
                />
              ))}
            </div>
            <button
              type="button"
              aria-label="Próximo slide"
              title="Próximo slide"
              onClick={() => go(activeSlide + 1)}
            >
              <Icon name="ChevronRight" />
            </button>
            {pageCount > 1 && !reduced && (
              <button
                type="button"
                aria-label={paused ? 'Retomar carrossel' : 'Pausar carrossel'}
                title={paused ? 'Retomar carrossel' : 'Pausar carrossel'}
                aria-pressed={paused}
                onClick={() => setPaused(!paused)}
              >
                <Icon name={paused ? 'Play' : 'Pause'} />
              </button>
            )}
          </div>
        )}
      </div>
    );
  if (layout === 'sections')
    return (
      <div className="hb-service-sections">
        {homeCategories.slice(1).map(([category, label]) => {
          const items = services.filter((service) => service.category === category);
          return (
            items.length > 0 && (
              <section key={category} aria-label={label}>
                <h3>
                  {label} <span className="hb-section-count">{items.length}</span>
                </h3>
                <div className="hb-grid">{cards(items)}</div>
              </section>
            )
          );
        })}
      </div>
    );
  return (
    <div
      className={
        layout === 'list' ? 'hb-service-list' : layout === 'compact' ? 'hb-compact-grid' : 'hb-grid'
      }
      ref={layout === 'grid' ? gridRef : undefined}
    >
      {cards(services)}
    </div>
  );
}
