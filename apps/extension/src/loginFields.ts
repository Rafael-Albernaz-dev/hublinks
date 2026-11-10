/** Find one unambiguous login, including div layouts and open shadow roots. */
export function parentElement(element: Element): Element | null {
  const root = element.getRootNode();
  return element.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
}

export function usable(input: HTMLInputElement): boolean {
  if (!input.isConnected || input.disabled || input.readOnly || input.type === 'hidden')
    return false;
  for (let element: Element | null = input; element; element = parentElement(element)) {
    if (element.hasAttribute('hidden') || element.hasAttribute('inert')) return false;
    if (element.getAttribute('aria-hidden') === 'true') return false;
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    if (style?.display === 'none' || ['hidden', 'collapse'].includes(style?.visibility ?? ''))
      return false;
  }
  return true;
}

export function inputRoots(doc: Document): Array<Document | ShadowRoot> {
  const roots: Array<Document | ShadowRoot> = [doc];
  for (let i = 0; i < roots.length; i++)
    for (const element of roots[i]!.querySelectorAll('*'))
      if (element.shadowRoot) roots.push(element.shadowRoot);
  return roots;
}

function inputs(doc: Document): HTMLInputElement[] {
  return inputRoots(doc)
    .flatMap((root) => Array.from(root.querySelectorAll('input')))
    .filter(usable);
}

function hint(input: HTMLInputElement): string {
  return `${input.name} ${input.id} ${input.autocomplete} ${input.placeholder} ${input.getAttribute('aria-label') ?? ''} ${Array.from(
    input.labels ?? [],
  )
    .map((label) => label.textContent)
    .join(' ')}`;
}

function tokens(input: HTMLInputElement): string[] {
  return input.autocomplete.toLowerCase().split(/\s+/);
}

function password(input: HTMLInputElement): boolean {
  // Some providers mask OTP/CAPTCHA fields with type=password. They are never vault-password targets.
  if (/one-time-code|otp|2fa|captcha/i.test(hint(input))) return false;
  return (
    input.type === 'password' ||
    tokens(input).includes('current-password') ||
    tokens(input).includes('new-password')
  );
}

function newPassword(input: HTMLInputElement): boolean {
  return /new-password|confirm|repeat|retype|nova.?senha/i.test(hint(input));
}

function identifierScore(input: HTMLInputElement): number {
  if (!['text', 'email', 'tel', 'number', ''].includes(input.type) || password(input)) return -1;
  const text = hint(input);
  if (
    /one-time-code|\botp\b|2fa|captcha|challenge|c[oó]digo|verification|verifica[çc][aã]o|search|busca|pesquisar|confirm/i.test(
      text,
    )
  )
    return -1;
  if (tokens(input).includes('username')) return 100;
  if (
    /user|e-?mail|login|cpf|usu[aá]rio|identificador|matr[ií]cula|conta|phone|telefone|celular|mobile|account/i.test(
      text,
    )
  )
    return 80;
  if (input.type === 'email' || tokens(input).includes('email')) return 60;
  return ['text', ''].includes(input.type) ? 0 : -1;
}

function contains(scope: Element, input: HTMLInputElement): boolean {
  if (scope.tagName === 'FORM') return input.form === scope;
  for (let element: Element | null = input; element; element = parentElement(element))
    if (element === scope) return true;
  return false;
}

function chooseIdentifier(candidates: HTMLInputElement[]): HTMLInputElement | null {
  const ranked = candidates
    .map((input) => ({ input, score: identifierScore(input) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0] && (!ranked[1] || ranked[0].score > ranked[1].score) ? ranked[0].input : null;
}

export function findLoginFields(
  doc: Document,
  allowPasswordOnly = false,
): {
  usernameInput: HTMLInputElement | null;
  passwordInput: HTMLInputElement | null;
} {
  const all = inputs(doc);
  const passwords = all.filter(password);
  const matches: Array<{
    usernameInput: HTMLInputElement | null;
    passwordInput: HTMLInputElement;
  }> = [];
  for (const secret of passwords.filter((input) => !newPassword(input))) {
    let scope: Element | null = secret.form;
    for (let element = parentElement(secret); !scope && element; element = parentElement(element))
      if (element.getAttribute('role') === 'form') scope = element;
    if (!scope) {
      for (let element = parentElement(secret); element; element = parentElement(element)) {
        if (all.some((input) => contains(element, input) && identifierScore(input) >= 0)) {
          scope = element;
          break;
        }
      }
    }
    if (!scope || passwords.filter((input) => contains(scope, input)).length !== 1) continue;
    const usernameInput = chooseIdentifier(all.filter((input) => contains(scope, input)));
    if (usernameInput || allowPasswordOnly) matches.push({ usernameInput, passwordInput: secret });
  }
  return matches.length === 1 ? matches[0]! : { usernameInput: null, passwordInput: null };
}

export function findIdentifierStep(doc: Document): HTMLInputElement | null {
  const all = inputs(doc);
  if (all.some(password)) return null;
  const field = chooseIdentifier(all.filter((input) => identifierScore(input) >= 60));
  const scope = field?.form ?? field?.closest('[role="form"]');
  if (!field || !scope) return null;
  const unavailablePassword = inputRoots(doc)
    .flatMap((root) => Array.from(root.querySelectorAll('input')))
    .some(
      (input) =>
        contains(scope, input) &&
        password(input) &&
        (input.disabled || input.readOnly || newPassword(input)),
    );
  return unavailablePassword ? null : field;
}
