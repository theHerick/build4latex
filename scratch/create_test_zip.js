const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

const zip = new AdmZip();
const texContent = '\\documentclass{article}\\begin{document}Hello from Infinix LaTeX!\\end{document}';
zip.addFile('main.tex', Buffer.from(texContent, 'utf-8'));
zip.writeZip(path.join(__dirname, 'test.zip'));
console.log('test.zip created');
