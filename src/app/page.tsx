'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, Loader2, Download, AlertCircle, CheckCircle2, File as FileIcon, ChevronRight, Zap } from 'lucide-react';
import JSZip from 'jszip';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [zipEntries, setZipEntries] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading-engine' | 'compiling' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // O runnerRef foi removido pois agora usamos o backend Docker.

  // A inicialização do BusyTeX foi removida para focar no backend Docker.

  const inspectZip = async (zipFile: File) => {
    try {
      const zip = new JSZip();
      const content = await zip.loadAsync(zipFile);
      const names = Object.keys(content.files).filter(name => !content.files[name].dir);
      setZipEntries(names);
    } catch (err) {
      console.error('Erro ao ler ZIP:', err);
      setError('Não foi possível ler o conteúdo do ZIP');
    }
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.name.endsWith('.zip')) {
      setFile(selectedFile);
      setError(null);
      setLogs(null);
      setPdfUrl(null);
      setStatus('idle');
      await inspectZip(selectedFile);
    } else if (selectedFile) {
      setError('Por favor, envie um arquivo .zip');
      setFile(null);
      setZipEntries([]);
    }
  };

  const handleCompile = async () => {
    if (!file) return;

    setStatus('compiling');
    setError(null);
    setLogs(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Usando nossa própria API que rodará no Render com Docker
      const response = await fetch('/api/compile', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.details) setLogs(errorData.details);
        throw new Error(errorData.error || 'Erro na compilação');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      setStatus('success');

    } catch (err: any) {
      console.error('Compilation error:', err);
      setError(err.message || 'Erro de conexão com o servidor');
      setStatus('error');
    }
  };

  return (
    <>
      <header>
        <div className="logo-text">
          Build<span className="four">4</span><span className="latex">Latex</span>
        </div>
      </header>

      <main className="main-content">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="hero-title">Compilar arquivos LaTeX</h1>
          <p className="hero-subtitle">
            Carregue seus arquivos LaTeX e obtenha seu PDF em segundos.
          </p>
        </motion.div>

        <motion.div
          className="premium-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="big-button-container">
            {false ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <Loader2 className="loading-spinner" size={40} color="var(--primary)" style={{ margin: '0 auto 1rem' }} />
                <p style={{ color: '#64748b' }}>Preparando motor LaTeX...</p>
              </div>
            ) : (
              <label className="upload-zone">
                <input
                  type="file"
                  accept=".zip"
                  onChange={onFileChange}
                  style={{ display: 'none' }}
                />
                <div className="upload-icon-wrapper">
                  {file ? <CheckCircle2 color="white" /> : <Upload color="white" />}
                </div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#0f172a' }}>
                  {file ? file.name : 'Selecionar arquivo ZIP'}
                </h3>
                <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
                  {file ? 'Clique para trocar o arquivo' : 'ou arraste e solte aqui'}
                </p>
              </label>
            )}
          </div>

          <AnimatePresence mode="wait">
            {file && status !== 'success' && (
              <motion.div
                key="file-preview"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ overflow: 'hidden' }}
              >
                <div className="file-list-preview-modern">
                  <div className="file-list-header">
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Conteúdo ({zipEntries.length} arquivos)
                    </span>
                  </div>

                  <div className="file-list">
                    {zipEntries.slice(0, 5).map((name, i) => (
                      <div key={i} className="file-item">
                        <FileIcon size={14} color="#94a3b8" />
                        <span style={{ fontSize: '0.875rem', color: '#475569' }}>{name}</span>
                        {name.endsWith('.tex') && <span className="badge">TEX</span>}
                      </div>
                    ))}
                    {zipEntries.length > 5 && (
                      <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.5rem', paddingLeft: '1.25rem' }}>
                        ... e mais {zipEntries.length - 5}
                      </p>
                    )}
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    className="compile-button"
                    onClick={handleCompile}
                    disabled={status === 'compiling'}
                  >
                    {status === 'compiling' ? (
                      <>
                        <Loader2 className="loading-spinner" size={18} />
                        Compilando...
                      </>
                    ) : (
                      <>
                        <Zap size={18} />
                        Compilar Agora
                      </>
                    )}
                  </motion.button>
                </div>
              </motion.div>
            )}

            {status === 'error' && (
              <motion.div
                key="error-msg"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{ marginTop: '2rem', padding: '1.25rem', background: '#fff1f2', borderRadius: '16px', border: '1px solid #fecdd3' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', color: '#e11d48' }}>
                  <AlertCircle size={20} />
                  <strong style={{ fontWeight: 600 }}>Erro na compilação</strong>
                </div>
                <p style={{ fontSize: '0.875rem', color: '#9f1239', marginBottom: '1rem', lineHeight: 1.5 }}>{error}</p>

                {logs && <pre className="log-viewer">{logs}</pre>}
              </motion.div>
            )}

            {status === 'success' && pdfUrl && (
              <motion.div
                key="success-msg"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{ marginTop: '2rem', textAlign: 'center', padding: '2rem', background: '#f0fdf4', borderRadius: '24px', border: '1px solid #dcfce7' }}
              >
                <div style={{ width: 56, height: 56, background: '#10b981', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', boxShadow: '0 8px 16px -4px rgba(16, 185, 129, 0.4)' }}>
                  <CheckCircle2 size={28} color="white" />
                </div>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem', color: '#064e3b' }}>Sucesso!</h3>
                <p style={{ color: '#059669', marginBottom: '2rem', fontSize: '0.9rem' }}>Seu PDF está pronto para download.</p>

                <a
                  href={pdfUrl}
                  download={`${file?.name.replace('.zip', '') || 'compiled'}.pdf`}
                  className="compile-button"
                  style={{ textDecoration: 'none', background: '#10b981', boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.3)' }}
                >
                  <Download size={18} />
                  Baixar PDF
                </a>

                <button
                  onClick={() => { setFile(null); setStatus('idle'); }}
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', marginTop: '1.25rem', cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline' }}
                >
                  Enviar outro ZIP
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </main>

      <footer>
        <p style={{ opacity: 0.5 }}>theHerick 2026</p>
      </footer>

      <style jsx>{`
        .file-list-preview-modern {
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid #f1f5f9;
        }
        .file-list {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
          margin-top: 0.75rem;
        }
        .file-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem 0.75rem;
          background: #f8fafc;
          border-radius: 8px;
        }
        .badge {
          font-size: 0.6rem;
          background: #eef2ff;
          color: #4f46e5;
          padding: 0.1rem 0.3rem;
          border-radius: 4px;
          font-weight: 700;
          margin-left: auto;
        }
        .log-viewer {
          background: #0f172a;
          color: #cbd5e1;
          padding: 1rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-family: 'JetBrains Mono', monospace;
          max-height: 180px;
          overflow: auto;
          white-space: pre-wrap;
          border: 1px solid #1e293b;
        }
      `}</style>
    </>
  );
}
