
module.exports = {
  rules: {
    'no-double-hash-callback': require('./rules/no-double-hash-callback'),
    'require-sanitizer-after-hash-write': require('./rules/require-sanitizer-after-hash-write'),
    'no-unsafe-history-url': require('./rules/no-unsafe-history-url'),
  },
};
