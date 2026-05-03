const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');

const execAsync = promisify(exec);

async function findMainTex(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  let fallback = '';

  for (const entry of entries) {
    if (entry.isFile() && entry.name === 'main.tex') {
      return path.join(dir, entry.name);
    }
  }

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.tex')) {
      const content = await fs.readFile(path.join(dir, entry.name), 'utf-8');
      if (content.includes('\\documentclass')) {
        return path.join(dir, entry.name);
      }
      if (!fallback) fallback = path.join(dir, entry.name);
    }
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const found = await findMainTex(path.join(dir, entry.name));
      if (found) return found;
    }
  }

  return fallback;
}

async function test(zipName) {
  const zipPath = path.join(__dirname, zipName);
  const workDir = path.join(os.tmpdir(), `latex-debug-${Date.now()}`);
  
  try {
    console.log(`--- Testing with ${zipName} ---`);
    await fs.mkdir(workDir, { recursive: true });
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(workDir, true);

    const mainTexPath = await findMainTex(workDir);
    console.log('Found mainTexPath:', mainTexPath);

    if (!mainTexPath) {
      console.error('FAILED to find .tex file');
      return;
    }

    const compileDir = path.dirname(mainTexPath);
    const mainTexFile = path.basename(mainTexPath);

    console.log('Running pdflatex in:', compileDir);
    const cmd = `pdflatex -interaction=nonstopmode "${mainTexFile}"`;
    
    try {
      const { stdout } = await execAsync(cmd, { cwd: compileDir });
      console.log('SUCCESS!');
    } catch (err) {
      console.error('EXEC ERROR:', err.message);
    }

  } catch (err) {
    console.error('ERROR:', err);
  }
}

async function runAll() {
  await execAsync('node create_nested_zip.js', { cwd: __dirname });
  await test('test.zip');
  await test('nested.zip');
}

runAll();
