
module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Require sanitizer call after writing to location.hash",
      category: "Best Practices",
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
      AssignmentExpression(node) {
        if (!isLocationHash(node.left)) return;

        // Find the statement containing this assignment
        const parentStatement = context.getAncestors().reverse().find(
          ancestor => ancestor.type === "ExpressionStatement" || ancestor.type === "VariableDeclaration"
        );

        if (!parentStatement) return;

        const block = parentStatement.parent;
        if (!block || !Array.isArray(block.body)) return;

        const currentIndex = block.body.indexOf(parentStatement);
        const nextStatement = block.body[currentIndex + 1];

        let sanitizerCalled = false;

        if (nextStatement && nextStatement.type === "ExpressionStatement") {
          const expr = nextStatement.expression;
          if (
            expr.type === "CallExpression" &&
            expr.callee.name === "normalizeDoubleHashToQuery"
          ) {
            sanitizerCalled = true;
          }
        }

        if (!sanitizerCalled) {
          context.report({
            node,
            message: "Call normalizeDoubleHashToQuery() immediately after mutating location.hash."
          });
        }
      }
    };
  }
};
