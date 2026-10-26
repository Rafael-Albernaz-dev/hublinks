export function deploymentOrigin(value) {
  if (value === undefined || value === '') return '';
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.origin !== value || url.hostname.includes('*'))
    throw new Error('HUB_EXTENSION_ORIGIN must be one exact HTTPS origin without a path');
  return url.origin;
}

export function configureManifest(manifest, origin) {
  const result = structuredClone(manifest);
  if (!origin) return result;
  const matches = [`${origin}/*`];
  result.name = 'Hublink';
  result.description = 'Acessos Hublink com preenchimento assistido e confirmação humana.';
  result.externally_connectable.matches = matches;
  result.content_scripts = result.content_scripts.map((script) => ({ ...script, matches }));
  // The approved HTTPS permission already covers the API; remove local HTTP access.
  result.host_permissions = result.host_permissions.filter(
    (host) => host !== 'http://127.0.0.1:3177/*',
  );
  return result;
}
