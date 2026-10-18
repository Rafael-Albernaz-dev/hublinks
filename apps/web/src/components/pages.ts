export const pages = [
  { id: 'inicio', label: 'Início', icon: 'LayoutDashboard' },
  { id: 'catalogo', label: 'Catálogo', icon: 'Grid2x2' },
  { id: 'cofre', label: 'Acessos', icon: 'KeyRound' },
  { id: 'equipe', label: 'Equipe', icon: 'Users' },
  { id: 'identidade', label: 'Identidade', icon: 'Palette' },
] as const;
export type Page = (typeof pages)[number]['id'];
