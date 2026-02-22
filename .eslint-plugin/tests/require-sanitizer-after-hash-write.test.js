
const { RuleTester } = require("eslint");
const rule = require("../rules/require-sanitizer-after-hash-write");

const ruleTester = new RuleTester({ parserOptions: { ecmaVersion: 2020 } });

ruleTester.run("require-sanitizer-after-hash-write", rule, {
  valid: [
    `
    function update() {
      location.hash = "new";
      normalizeDoubleHashToQuery();
    }
    `,
    `
    window.location.hash = "test";
    normalizeDoubleHashToQuery();
    `
  ],
  invalid: [
    {
      code: `
        function update() {
          location.hash = "unsafe";
          console.log("oops");
        }
      `,
      errors: [{ message: "Call normalizeDoubleHashToQuery() immediately after mutating location.hash." }]
    },
    {
      code: `
        window.location.hash = "unsafe";
      `,
      errors: [{ message: "Call normalizeDoubleHashToQuery() immediately after mutating location.hash." }]
    }
  ]
});
