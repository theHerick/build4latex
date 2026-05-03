import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import AdmZip from 'adm-zip';

const execAsync = promisify(exec);

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File;

  if (!file) {
    return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
  }

  const workDir = path.join(os.tmpdir(), `latex-${uuidv4()}`);
  
  try {
    // Create working directory
    await fs.mkdir(workDir, { recursive: true });

    // Save ZIP file
    const zipBuffer = Buffer.from(await file.arrayBuffer());
    const zipPath = path.join(workDir, 'upload.zip');
    await fs.writeFile(zipPath, zipBuffer);

    // Extract ZIP
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(workDir, true);

    // Find main .tex file recursively
    async function findMainTex(dir: string): Promise<string> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      let fallback = '';

      // First pass: look for main.tex in current dir
      for (const entry of entries) {
        if (entry.isFile() && entry.name === 'main.tex') {
          return path.join(dir, entry.name);
        }
      }

      // Second pass: look for \documentclass in current dir
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.tex')) {
          const content = await fs.readFile(path.join(dir, entry.name), 'utf-8');
          if (content.includes('\\documentclass')) {
            return path.join(dir, entry.name);
          }
          if (!fallback) fallback = path.join(dir, entry.name);
        }
      }

      // Third pass: recurse into directories
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const found = await findMainTex(path.join(dir, entry.name));
          if (found) return found;
        }
      }

      return fallback;
    }

    const mainTexPath = await findMainTex(workDir);

    if (!mainTexPath) {
      throw new Error('Não foi possível encontrar um arquivo .tex no ZIP');
    }

    const compileDir = path.dirname(mainTexPath);
    const mainTexFile = path.basename(mainTexPath);
    const baseName = mainTexFile.replace('.tex', '');

    // --- SYSTEM CHECK ---
    try {
      await execAsync('pdflatex --version');
    } catch (err) {
      return NextResponse.json({ 
        error: 'Servidor não possui LaTeX instalado (pdflatex não encontrado).',
        details: 'Se você está na Vercel, note que o ambiente Serverless não suporta compilação LaTeX nativa. Considere usar um servidor dedicado ou uma API externa.'
      }, { status: 500 });
    }

    // Overleaf-style multi-pass compilation
    async function runCompilation(isRetry = false) {
      const runPass = async (cmd: string, label: string) => {
        try {
          console.log(`--- Running ${label} ---`);
          const { stdout, stderr } = await execAsync(cmd, { cwd: compileDir });
          return { success: true, logs: stdout };
        } catch (err: any) {
          console.error(`${label} failed:`, err.message);
          return { success: false, logs: err.stdout || err.message || '' };
        }
      };

      // Pass 1
      const p1 = await runPass(`pdflatex -interaction=nonstopmode "${mainTexFile}"`, `pdflatex pass 1`);
      
      // Auto-fix logic if Pass 1 failed with font expansion
      if (!isRetry && p1.logs.includes('font expansion')) {
        console.log('--- AUTO-FIX: Font expansion error detected. Injecting robust fixes ---');
        let content = await fs.readFile(mainTexPath, 'utf-8');
        const microfix = '\\PassOptionsToPackage{expansion=false}{microtype}\n';
        const docClassMatch = content.match(/\\documentclass\s*(\[.*?\])?\s*\{.*?\}/s);
        if (docClassMatch) {
          const injectIndex = docClassMatch.index! + docClassMatch[0].length;
          const injection = '\n\\usepackage[T1]{fontenc}\n\\usepackage{lmodern}\n';
          content = microfix + content.slice(0, injectIndex) + injection + content.slice(injectIndex);
          await fs.writeFile(mainTexPath, content);
          await runCompilation(true); // Retry
          return;
        }
      }

      // Optional: BibTeX
      const auxPath = path.join(compileDir, `${baseName}.aux`);
      try {
        const auxExists = await fs.access(auxPath).then(() => true).catch(() => false);
        if (auxExists) await runPass(`bibtex "${baseName}"`, `bibtex`);
      } catch (e) {}

      // Optional: MakeIndex
      try {
        const idxPath = path.join(compileDir, `${baseName}.idx`);
        const idxExists = await fs.access(idxPath).then(() => true).catch(() => false);
        if (idxExists) await runPass(`makeindex "${baseName}.idx"`, `makeindex`);
      } catch (e) {}

      // Pass 2 & 3
      await runPass(`pdflatex -interaction=nonstopmode "${mainTexFile}"`, `pdflatex pass 2`);
      await runPass(`pdflatex -interaction=nonstopmode "${mainTexFile}"`, `pdflatex pass 3`);
    }

    await runCompilation();

    const pdfName = baseName + '.pdf';
    const pdfPath = path.join(compileDir, pdfName);
    const logPath = path.join(compileDir, baseName + '.log');

    try {
      const pdfBuffer = await fs.readFile(pdfPath);
      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${pdfName}"`,
        },
      });
    } catch (err) {
      // If PDF not found, try to return logs
      try {
        const logContent = await fs.readFile(logPath, 'utf-8');
        const lastLines = logContent.split('\n').slice(-100).join('\n');
        return NextResponse.json({ 
          error: 'O PDF não foi gerado. Verifique os logs do LaTeX abaixo.',
          details: lastLines 
        }, { status: 500 });
      } catch (logErr) {
        return NextResponse.json({ 
          error: 'Falha total: O LaTeX não gerou nem o PDF nem o arquivo de Log.',
          details: 'Isso pode indicar um erro de sintaxe fatal no preâmbulo ou falta de dependências no servidor.'
        }, { status: 500 });
      }
    }

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    // Cleanup
    try {
      await fs.rm(workDir, { recursive: true, force: true });
    } catch (err) {
      console.error('Cleanup error:', err);
    }
  }
}
