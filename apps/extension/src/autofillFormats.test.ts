import { afterEach, describe, expect, it, vi } from 'vitest';
import { supportedLoginForms, rejectedLoginForms } from '../../../tests/fixtures/loginForms';
import { executeAutofill, waitForAndExecuteAutofill } from './autofill';

const creds = { username: 'synthetic@example.test', password: 'synthetic-password' };
afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('catalog login formats', () => {
  it.each(supportedLoginForms)('fills $name without submitting', ({ html }) => {
    document.body.innerHTML = html;
    const submit = vi.fn();
    document.addEventListener('submit', submit, { once: true });
    expect(executeAutofill(document, creds)).toEqual({ status: 'filled_only' });
    expect(document.querySelector<HTMLInputElement>('[data-login-user]')!.value).toBe(
      creds.username,
    );
    expect(document.querySelector<HTMLInputElement>('[data-login-password]')!.value).toBe(
      creds.password,
    );
    expect(submit).not.toHaveBeenCalled();
    document.removeEventListener('submit', submit);
  });
  it.each(rejectedLoginForms)('refuses $name', ({ html }) => {
    document.body.innerHTML = html;
    expect(executeAutofill(document, creds)).toEqual({ status: 'form_not_found' });
    expect(Array.from(document.querySelectorAll('input')).every((input) => !input.value)).toBe(
      true,
    );
  });
  it('fills open shadow roots and ignores an inert shadow host', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = supportedLoginForms[1]!.html;
    expect(executeAutofill(document, creds).status).toBe('filled_only');
    expect(root.querySelector<HTMLInputElement>('[data-login-password]')!.value).toBe(
      creds.password,
    );
    host.inert = true;
    host.setAttribute('inert', '');
    expect(executeAutofill(document, creds).status).toBe('form_not_found');
  });
  it('leaves shadow-root OTP fields untouched and reports the human challenge', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = supportedLoginForms[0].html.replace(
      '</form>',
      '<input autocomplete="one-time-code"></form>',
    );
    expect(executeAutofill(document, creds)).toEqual({
      status: 'filled_pending_challenge',
      challengeDetected: '2fa',
    });
    expect(shadow.querySelector<HTMLInputElement>('[autocomplete="one-time-code"]')!.value).toBe(
      '',
    );
  });
  it('continues a two-step SPA only after the user advances', async () => {
    document.body.innerHTML =
      '<form><input autocomplete="username"><button type="button">Avançar</button></form>';
    const pending = waitForAndExecuteAutofill(document, creds, 1000, () => true, false);
    expect(document.querySelector('input')!.value).toBe(creds.username);
    document.querySelector('button')!.onclick = () => {
      document.body.innerHTML =
        '<form><input type="password" autocomplete="current-password"></form>';
    };
    document.querySelector('button')!.click();
    expect((await pending).status).toBe('filled_only');
    expect(document.querySelector('input')!.value).toBe(creds.password);
  });
  it('never fills the saved password into a masked OTP after the identifier step', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<form><input autocomplete="username"></form>';
    const pending = waitForAndExecuteAutofill(document, creds, 1000, () => true, false);
    document.body.innerHTML =
      '<form><input type="password" autocomplete="one-time-code" name="otp"></form>';
    await vi.advanceTimersByTimeAsync(1000);
    expect((await pending).status).toBe('filled_username_only');
    expect(document.querySelector('input')!.value).toBe('');
  });
  it('reports an identifier-only step honestly when the bounded attempt ends', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<form><input autocomplete="username"></form>';
    const pending = waitForAndExecuteAutofill(document, creds, 1000, () => true, false);
    await vi.advanceTimersByTimeAsync(1000);
    expect((await pending).status).toBe('filled_username_only');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('stops after a human changes the identifier instead of using the saved password', async () => {
    document.body.innerHTML = '<form><input autocomplete="username"></form>';
    const pending = waitForAndExecuteAutofill(document, creds, 1000, () => true, false);
    const input = document.querySelector('input')!;
    input.value = 'another-account';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect((await pending).status).toBe('form_not_found');
    document.body.innerHTML = '<form><input type="password"></form>';
    await Promise.resolve();
    expect(document.querySelector('input')!.value).toBe('');
  });
  it('stops before filling a second step after navigation leaves the authorized location', async () => {
    let allowed = true;
    document.body.innerHTML = '<form><input autocomplete="username"></form>';
    const pending = waitForAndExecuteAutofill(document, creds, 1000, () => allowed, false);
    allowed = false;
    document.body.innerHTML = '<form><input type="password"></form>';
    expect((await pending).status).toBe('form_not_found');
    expect(document.querySelector('input')!.value).toBe('');
  });
  it('detects a late shadow root without a light-DOM mutation', async () => {
    vi.useFakeTimers();
    const host = document.createElement('div');
    document.body.append(host);
    const pending = waitForAndExecuteAutofill(document, creds, 1000, () => true, false);
    host.attachShadow({ mode: 'open' }).innerHTML = supportedLoginForms[0]!.html;
    await vi.advanceTimersByTimeAsync(200);
    expect((await pending).status).toBe('filled_only');
    expect(vi.getTimerCount()).toBe(0);
  });
});
