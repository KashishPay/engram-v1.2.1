const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const key = env.split('\n').find(l => l.startsWith('VITE_API_KEY='))?.split('=')[1]?.trim();
fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`).then(r => r.json()).then(d => {
  console.log(d.models?.map(m => m.name).slice(0, 10));
});
