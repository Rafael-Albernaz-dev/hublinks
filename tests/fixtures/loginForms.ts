const user = '<input data-login-user name="usuario" autocomplete="username">';
const password = '<input data-login-password type="password" autocomplete="current-password">';

export const supportedLoginForms = [
  { name: 'standard form', html: `<form>${user}${password}<button>Entrar</button></form>` },
  {
    name: 'nested div fields',
    html: `<div class="auth-form"><div class="auth-field"><div>${user}</div></div><div class="auth-field"><div>${password}</div></div><button type="button">Entrar</button></div>`,
  },
  {
    name: 'deep div layout',
    html: `<section><div><label>Usuário<span><span>${user}</span></span></label></div><div><div><span>${password}</span></div></div></section>`,
  },
  { name: 'ARIA form', html: `<div role="form"><div>${user}</div><div>${password}</div></div>` },
  {
    name: 'email identifier',
    html: `<form><input data-login-user type="email" name="email">${password}</form>`,
  },
  {
    name: 'phone or CPF identifier',
    html: `<form><input data-login-user type="tel" aria-label="CPF ou telefone">${password}</form>`,
  },
  {
    name: 'label-only identifier',
    html: `<form><label for="account">Usuário</label><input data-login-user id="account">${password}</form>`,
  },
  {
    name: 'section autocomplete token',
    html: `<form><input name="search"><input data-login-user autocomplete="section-signin username">${password}</form>`,
  },
  {
    name: 'revealed current password',
    html: `<form>${user}<input data-login-password type="text" autocomplete="current-password"></form>`,
  },
  {
    name: 'external form association',
    html: `<form id="signin"></form><input data-login-user form="signin" autocomplete="username"><input data-login-password form="signin" type="password">`,
  },
  {
    name: 'login alongside registration',
    html: `<form>${user}${password}</form><form><input type="email"><input type="password" autocomplete="new-password"><input type="password" name="confirm"></form>`,
  },
  {
    name: 'hidden registration',
    html: `<div hidden><input type="password"><input type="password"></div><form>${user}${password}</form>`,
  },
  { name: 'identifier after password', html: `<form>${password}${user}</form>` },
] as const;

export const rejectedLoginForms = [
  {
    name: 'CAPTCHA text is not a username',
    html: `<form><input name="captcha">${password}</form>`,
  },
  {
    name: 'two competing login forms',
    html: `<form>${user}${password}</form><form>${user}${password}</form>`,
  },
  {
    name: 'password confirmation',
    html: `<form>${user}${password}<input type="password" name="confirm"></form>`,
  },
  {
    name: 'registration only',
    html: `<form>${user}<input data-login-password type="password" autocomplete="new-password"></form>`,
  },
  {
    name: 'two equally likely identifiers',
    html: `<form><input name="email"><input name="usuario">${password}</form>`,
  },
  { name: 'inert form', html: `<form inert>${user}${password}</form>` },
  {
    name: 'readonly password',
    html: `<form>${user}<input data-login-password type="password" readonly></form>`,
  },
  {
    name: 'OTP is not a username',
    html: `<form><input autocomplete="one-time-code">${password}</form>`,
  },
  { name: 'password-only without prior identifier', html: `<form>${password}</form>` },
] as const;
