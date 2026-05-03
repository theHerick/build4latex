const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

const zip = new AdmZip();
const texContent = '\\documentclass{article}\\begin{document}Nested project!\\end{document}';
// Nested file
zip.addFile('project/sub/main.tex', Buffer.from(texContent, 'utf-8'));
zip.writeZip(path.join(__dirname, 'nested.zip'));
console.log('nested.zip created');
