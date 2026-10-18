import { Icon } from '../icons';
export function SearchBar({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <label className="hb-search">
      <Icon name="Search" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        placeholder="Buscar serviço"
      />
    </label>
  );
}
