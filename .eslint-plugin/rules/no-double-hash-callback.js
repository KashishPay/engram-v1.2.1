
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow double-hash patterns in auth callback URLs",
      category: "Possible Errors",
      recommended: true
    },
    schema: []
  },
  create(context) {
    function isLocationHash(node) {
      return (
        node.type === "MemberExpression" &&
        node.property.name === "hash" &&
        (node.object.name === "location" || 
         (node.object.type === "MemberExpression" && node.object.property.name === "location" && node.object.object.name === "window"))
      );
    }

    return {
      // Check 1: String Literals containing the bad pattern
      Literal(node) {
        if (typeof node.value === 'string') {
          if (node.value.includes('#/auth/callback#')) {
            context.report({
              node,
              message: "Avoid double-hash in auth callback URLs. Use '#/auth/callback?…' and the sanitizer."
            });
          }
        }
      },

      // Check 2: Assignments to location.hash with multiple hashes
      AssignmentExpression(node) {
        if (isLocationHash(node.left) && node.right.type === 'Literal' && typeof node.right.value === 'string') {
          const hashCount = (node.right.value.match(/#/g) || []).length;
          if (hashCount >= 2) {
            context.report({
              node,
              message: "Avoid assigning double-hash strings to location.hash."
            });
          }
        }
      },

      // Check 3: History API calls
      CallExpression(node) {
        if (
          node.callee.type === 'MemberExpression' &&
          (node.callee.property.name === 'pushState' || node.callee.property.name === 'replaceState') &&
          (node.callee.object.name === 'history' || 
           (node.callee.object.property && node.callee.object.property.name === 'history'))
        ) {
          // URL is usually the 3rd argument
          const urlArg = node.arguments[2];
          if (urlArg && urlArg.type === 'Literal' && typeof urlArg.value === 'string') {
            if (urlArg.value.includes('#/auth/callback#')) {
              context.report({
                node: urlArg,
                message: "Avoid double-hash in history API calls. Use '#/auth/callback?…'."
              });
            }
          }
        }
      }
    };
  }
};
