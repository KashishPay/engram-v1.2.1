const fs = require('fs');
let content = fs.readFileSync('views/WidgetsView.tsx', 'utf8');
content = content.replace(/handleSelectWidget/g, 'handleAction');
fs.writeFileSync('views/WidgetsView.tsx', content);
