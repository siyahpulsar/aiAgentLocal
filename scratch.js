const fs = require('fs');
let code = fs.readFileSync('src/ws/wsHandler.js', 'utf-8');
code = code.replace(/__dirname/g, "path.join(__dirname, '..', '..')");
fs.writeFileSync('src/ws/wsHandler.js', code);
console.log('Fixed __dirname paths');
