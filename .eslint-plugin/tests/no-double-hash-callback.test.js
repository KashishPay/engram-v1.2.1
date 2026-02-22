
const { RuleTester } = require("eslint");
const rule = require("../rules/no-double-hash-callback");

const ruleTester = new RuleTester({ parserOptions: { ecmaVersion: 2020 } });

ruleTester.run("no-double-hash-callback", rule, {
  valid: [
    "const url = '#/auth/callback?token=123';",
    "window.location.hash = '#/home';",
    "history.replaceState(null, '', '#/auth/callback?code=abc');"
  ],
  invalid: [
    {
      code: "const url = '#/auth/callback#token=123';",
      errors: [{ message: "Avoid double-hash in auth callback URLs. Use '#/auth/callback?…' and the sanitizer." }]
    },
    {
      code: "window.location.hash = '#/auth/callback#token=123';",
      errors: [{ message: "Avoid double-hash in auth callback URLs. Use '#/auth/callback?…' and the sanitizer." }]
    },
    {
      code: "location.hash = '##doublehash';",
      errors: [{ message: "Avoid assigning double-hash strings to location.hash." }]
    },
    {
      code: "history.pushState({}, '', '#/auth/callback#bad');",
      errors: [{ message: "Avoid double-hash in history API calls. Use '#/auth/callback?…'." }]
    }
  ]
});
