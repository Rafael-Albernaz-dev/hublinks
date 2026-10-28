/** Navigation may enter a child path, but a textual prefix does not authorize a sibling. */
export function matchesAuthorizedLocation(actual: string | undefined, target: string): boolean {
  if (!actual) return false;
  try {
    const current = new URL(actual);
    const approved = new URL(target);
    const childPath = approved.pathname.endsWith('/') ? approved.pathname : `${approved.pathname}/`;
    return (
      current.protocol === 'https:' &&
      !current.username &&
      !current.password &&
      current.origin === approved.origin &&
      (current.pathname === approved.pathname || current.pathname.startsWith(childPath)) &&
      (!approved.search || current.search === approved.search) &&
      (!approved.hash || current.hash === approved.hash)
    );
  } catch {
    return false;
  }
}
