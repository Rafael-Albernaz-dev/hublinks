import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectHumanChallenge,
  executeAutofill,
  fillNativeInput,
  matchesAuthorizedLocation,
} from './autofill';

const creds = { username: 'synthetic.user', password: 'synthetic-password' };

afterEach(() => {
  document.body.replaceChildren();
});

describe('universal assisted autofill', () => {
  it('fills a standard login reactively without clicking submit', () => {
    document.body.innerHTML =
      '<form><input name="usuario"><input type="password" name="password"><button type="submit">Enter</button></form>';
    const username = document.querySelector<HTMLInputElement>('input[name="usuario"]')!;
    const password = document.querySelector<HTMLInputElement>('input[type="password"]')!;
    const button = document.querySelector<HTMLButtonElement>('button')!;
    const click = vi.spyOn(button, 'click');
    const events: string[] = [];
    for (const input of [username, password]) {
      input.addEventListener('input', () => events.push(`${input.name}:input`));
      input.addEventListener('change', () => events.push(`${input.name}:change`));
    }

    expect(executeAutofill(document, creds)).toEqual({ status: 'filled_only' });
    expect(username.value).toBe(creds.username);
    expect(password.value).toBe(creds.password);
    expect(events).toEqual([
      'usuario:input',
      'usuario:change',
      'password:input',
      'password:change',
    ]);
    expect(document.activeElement).toBe(password);
    expect(click).not.toHaveBeenCalled();
  });

  it('uses the native setter when a framework tracks the input instance', () => {
    document.body.innerHTML = '<input type="email">';
    const input = document.querySelector('input')!;
    const ownSetter = vi.fn();
    Object.defineProperty(input, 'value', { configurable: true, set: ownSetter });
    fillNativeInput(input, 'synthetic@example.test');
    expect(ownSetter).not.toHaveBeenCalled();
    expect(input.getAttribute('value')).toBeNull();
    expect(
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.get?.call(input),
    ).toBe('synthetic@example.test');
  });

  it('prefers autocomplete=username and supports email fields', () => {
    document.body.innerHTML =
      '<form><input type="text" name="search"><input type="email" autocomplete="username"><input type="password"></form>';
    expect(executeAutofill(document, creds)).toEqual({ status: 'filled_only' });
    expect(document.querySelector<HTMLInputElement>('input[type="email"]')?.value).toBe(
      creds.username,
    );
    expect(document.querySelector<HTMLInputElement>('input[name="search"]')?.value).toBe('');
  });

  it('fails closed on missing, hidden, or ambiguous login fields', () => {
    document.body.innerHTML = '<form><input name="username"></form>';
    expect(executeAutofill(document, creds)).toEqual({ status: 'form_not_found' });
    document.body.innerHTML = '<form><input type="password"></form>';
    expect(executeAutofill(document, creds)).toEqual({ status: 'form_not_found' });
    document.body.innerHTML =
      '<form><input name="username"><input type="password" style="display:none"></form>';
    expect(executeAutofill(document, creds)).toEqual({ status: 'form_not_found' });
    document.body.innerHTML =
      '<form><input name="username"><input type="password"><input type="password" name="confirm"></form>';
    expect(executeAutofill(document, creds)).toEqual({ status: 'form_not_found' });
  });

  it.each([
    ['recaptcha', '<div class="g-recaptcha"></div>'],
    ['turnstile', '<div class="cf-turnstile"></div>'],
    ['hcaptcha', '<iframe src="https://hcaptcha.com/1/api.js"></iframe>'],
    ['2fa', '<input autocomplete="one-time-code">'],
  ] as const)('fills and pauses for %s', (challenge, markup) => {
    document.body.innerHTML = `<form><input name="username"><input type="password"><button type="submit">Sign in</button>${markup}</form>`;
    const click = vi.spyOn(document.querySelector('button')!, 'click');
    expect(detectHumanChallenge(document)).toBe(challenge);
    expect(executeAutofill(document, creds)).toEqual({
      status: 'filled_pending_challenge',
      challengeDetected: challenge,
    });
    expect(click).not.toHaveBeenCalled();
  });

  it('rejects a redirect to a different HTTPS origin with a matching text prefix', () => {
    expect(
      matchesAuthorizedLocation(
        'https://portal.example.test/login',
        'https://portal.example.test/login',
      ),
    ).toBe(true);
    expect(
      matchesAuthorizedLocation(
        'https://portal.example.test.evil.test/login',
        'https://portal.example.test/login',
      ),
    ).toBe(false);
    expect(
      matchesAuthorizedLocation(
        'https://other.example.test/login',
        'https://portal.example.test/login',
      ),
    ).toBe(false);
  });
});
