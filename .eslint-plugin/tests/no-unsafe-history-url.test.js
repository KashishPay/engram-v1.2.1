
const { RuleTester } = require("eslint");
const rule = require("../rules/no-unsafe-history-url");

const ruleTester = new RuleTester({ parserOptions: { ecmaVersion: 2020 } });

ruleTester.run("no-unsafe-history-url", rule, {
  valid: [
    "history.replaceState({}, '', '#/auth/callback?code=123');",
    "history.pushState(null, null, '/login');",
    "window.history.replaceState(null, '', '#/home');",
    // Dynamic values are ignored by this strict literal check (handled by runtime sanitizer)
    "history.replaceState({}, '', someVariable);" 
  ],
  invalid: [
    {
      code: "history.replaceState({}, '', '#/auth/callback#access_token=123');",
      errors: [{ message: "Avoid double-hash in history URLs. Use '#/auth/callback?...' and our sanitizer." }]
    },
    {
      code: "window.history.pushState(null, '', '#/auth/callback#error=access_denied');",
      errors: [{ message: "Avoid double-hash in history URLs. Use '#/auth/callback?...' and our sanitizer." }]
    },
    {
      // Double hash anywhere with that route
      code: "history.replaceState(s, t, '#/auth/callback?type=magic#token=123');", 
      errors: [{ message: "Avoid double-hash in history URLs. Use '#/auth/callback?...' and our sanitizer." }]
    }
  ]
});
