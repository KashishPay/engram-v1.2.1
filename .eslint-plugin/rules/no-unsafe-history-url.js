
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow double-hash URL patterns in history API calls",
      category: "Possible Errors",
      recommended: true
    },
    schema: []
  },
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        
        // Check if method is pushState or replaceState
        if (
          callee.type !== 'MemberExpression' ||
          (callee.property.name !== 'pushState' && callee.property.name !== 'replaceState')
        ) {
          return;
        }

        // Check if object is history or window.history
        const obj = callee.object;
        const isHistory = 
          obj.name === 'history' || 
          (obj.type === 'MemberExpression' && obj.object.name === 'window' && obj.property.name === 'history');

        if (!isHistory) return;

        // URL is the 3rd argument
        const urlArg = node.arguments[2];
        
        // Check if it's a string literal
        if (urlArg && urlArg.type === 'Literal' && typeof urlArg.value === 'string') {
          const val = urlArg.value;
          
          // Condition 1: Explicit bad pattern #/auth/callback#
          const hasBadPattern = val.includes('#/auth/callback#');
          
          // Condition 2: Route + Double Hash heuristic
          const hasRouteAndDoubleHash = val.includes('#/auth/callback') && (val.match(/#/g) || []).length >= 2;

          if (hasBadPattern || hasRouteAndDoubleHash) {
            context.report({
              node: urlArg,
              message: "Avoid double-hash in history URLs. Use '#/auth/callback?...' and our sanitizer."
            });
          }
        }
      }
    };
  }
};
