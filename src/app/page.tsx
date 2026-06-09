'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, Loader2, Download, AlertCircle, CheckCircle2, File as FileIcon, ChevronRight, Zap } from 'lucide-react';
import JSZip from 'jszip';
import { Editor } from '@monaco-editor/react';
import { useSession, signIn, signOut } from "next-auth/react";
import { Octokit } from "@octokit/rest";

export default function Home() {
  const sessionData = useSession();
  const session = sessionData?.data;
  const sessionStatus = sessionData?.status;
  
  const [file, setFile] = useState<File | null>(null);
  const [zipEntries, setZipEntries] = useState<string[]>([]);
  // File System State
  const [fileContents, setFileContents] = useState<Record<string, string | Uint8Array>>({});
  const [activeFile, setActiveFile] = useState<string | null>(null);

  const [status, setStatus] = useState<'idle' | 'loading-engine' | 'compiling' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  
  const [repos, setRepos] = useState<any[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<any | null>(null);
  
  const fetchRepos = async () => {
    // @ts-ignore
    if (!session?.accessToken) return;
    setLoadingRepos(true);
    try {
      // @ts-ignore
      const octokit = new Octokit({ auth: session.accessToken });
      const { data } = await octokit.rest.repos.listForAuthenticatedUser({ sort: "updated", per_page: 50 });
      // Filtrar repositórios que tem build4latex no topico ou a gente vai assumir todos pra simplificar.
      setRepos(data);
    } catch (e: any) {
      console.error(e);
      setError("Erro ao carregar repositórios do GitHub.");
    } finally {
      setLoadingRepos(false);
    }
  }

  useEffect(() => {
    if (sessionStatus === "authenticated") {
      fetchRepos();
    }
  }, [sessionStatus]);

  const handleCreateRepoAndUpload = async () => {
    if (!file || Object.keys(fileContents).length === 0) return;
    // @ts-ignore
    if (!session?.accessToken) return;

    setStatus('compiling');
    setError(null);
    setLogs(null);
    
    try {
      // @ts-ignore
      const octokit = new Octokit({ auth: session.accessToken });
      
      const repoName = file.name.replace('.zip', '').toLowerCase().replace(/[^a-z0-9_-]/g, '-') + '-' + Math.random().toString(36).substring(2, 6);
      
      // 1. Create Repo
      const repo = await octokit.rest.repos.createForAuthenticatedUser({
        name: repoName,
        description: "LaTeX project created with build4latex",
        private: false,
        auto_init: true
      });

      // 2. Fetch Tree Sha for default branch
      const branchInfo = await octokit.rest.repos.getBranch({
        owner: repo.data.owner.login,
        repo: repo.data.name,
        branch: repo.data.default_branch,
      });
      const baseTreeSha = branchInfo.data.commit.commit.tree.sha;

      // 3. Create Blobs for each file
      const tree: any[] = [];
      for (const [name, content] of Object.entries(fileContents)) {
        let textContent = "";
        let encoding = "utf-8";
        
        if (typeof content === "string") {
          textContent = content;
        } else {
          // base64 encode uint8array
          let binary = "";
          for (let i = 0; i < content.length; i++) binary += String.fromCharCode(content[i]);
          textContent = btoa(binary);
          encoding = "base64";
        }
        
        const blob = await octokit.rest.git.createBlob({
          owner: repo.data.owner.login,
          repo: repo.data.name,
          content: textContent,
          encoding: encoding,
        });

        tree.push({
          path: name,
          mode: '100644',
          type: 'blob',
          sha: blob.data.sha,
        });
      }

      // 4. Create Tree
      const newTree = await octokit.rest.git.createTree({
        owner: repo.data.owner.login,
        repo: repo.data.name,
        base_tree: baseTreeSha,
        // @ts-ignore
        tree: tree,
      });

      // 5. Create Commit
      const commit = await octokit.rest.git.createCommit({
        owner: repo.data.owner.login,
        repo: repo.data.name,
        message: "Initial commit by build4latex",
        tree: newTree.data.sha,
        parents: [branchInfo.data.commit.sha]
      });

      // 6. Update Reference
      await octokit.rest.git.updateRef({
        owner: repo.data.owner.login,
        repo: repo.data.name,
        ref: `heads/${repo.data.default_branch}`,
        sha: commit.data.sha
      });

      setSelectedRepo(repo.data);
      setStatus('success');
      alert("Projeto migrado para o GitHub com sucesso!");
      fetchRepos();
      
    } catch (err: any) {
      console.error(err);
      setError("Erro ao criar repositório ou enviar arquivos.");
      setStatus('error');
    }
  }

  const loadRepo = async (repo: any) => {
    // @ts-ignore
    if (!session?.accessToken) return;
    setStatus('compiling');
    setError(null);
    setPdfUrl(null);
    try {
      // @ts-ignore
      const octokit = new Octokit({ auth: session.accessToken });
      const branchInfo = await octokit.rest.repos.getBranch({
        owner: repo.owner.login,
        repo: repo.name,
        branch: repo.default_branch,
      });
      const tree = await octokit.rest.git.getTree({
        owner: repo.owner.login,
        repo: repo.name,
        tree_sha: branchInfo.data.commit.sha,
        recursive: "1",
      });

      const contents: Record<string, string | Uint8Array> = {};
      const names: string[] = [];

      for (const item of tree.data.tree) {
        if (item.type === 'blob' && item.path) {
          const blob = await octokit.rest.git.getBlob({
            owner: repo.owner.login,
            repo: repo.name,
            file_sha: item.sha as string,
          });

          if (item.path.endsWith('.tex') || item.path.endsWith('.sty') || item.path.endsWith('.cls') || item.path.endsWith('.bib') || item.path.endsWith('.txt')) {
             contents[item.path] = decodeURIComponent(escape(atob(blob.data.content))); // utf8 parsing hack
          } else {
             const binaryString = atob(blob.data.content);
             const bytes = new Uint8Array(binaryString.length);
             for (let i = 0; i < binaryString.length; i++) {
                 bytes[i] = binaryString.charCodeAt(i);
             }
             contents[item.path] = bytes;
          }
          names.push(item.path);
        }
      }

      setZipEntries(names);
      setFileContents(contents);
      setFile(new File(["github"], repo.name + ".zip"));
      setSelectedRepo(repo);
      
      const mainTex = names.find(n => n === 'main.tex') || names.find(n => n.endsWith('.tex'));
      if (mainTex) setActiveFile(mainTex);

      setStatus('idle');
    } catch(err) {
      console.error(err);
      setError("Erro ao clonar repositório");
      setStatus('error');
    }
  }

  const commitChanges = async () => {
    if (!selectedRepo) return;
    // @ts-ignore
    if (!session?.accessToken) return;
    
    setStatus('compiling');
    setError(null);
    try {
      // @ts-ignore
      const octokit = new Octokit({ auth: session.accessToken });
      
       const branchInfo = await octokit.rest.repos.getBranch({
        owner: selectedRepo.owner.login,
        repo: selectedRepo.name,
        branch: selectedRepo.default_branch,
      });
      const baseTreeSha = branchInfo.data.commit.commit.tree.sha;

      const tree: any[] = [];
      for (const [name, content] of Object.entries(fileContents)) {
        let textContent = "";
        let encoding = "utf-8";
        
        if (typeof content === "string") {
          textContent = content;
        } else {
          let binary = "";
          for (let i = 0; i < content.length; i++) binary += String.fromCharCode(content[i]);
          textContent = btoa(binary);
          encoding = "base64";
        }
        
        const blob = await octokit.rest.git.createBlob({
          owner: selectedRepo.owner.login,
          repo: selectedRepo.name,
          content: textContent,
          encoding: encoding,
        });

        tree.push({
          path: name,
          mode: '100644',
          type: 'blob',
          sha: blob.data.sha,
        });
      }

      const newTree = await octokit.rest.git.createTree({
        owner: selectedRepo.owner.login,
        repo: selectedRepo.name,
        base_tree: baseTreeSha,
        // @ts-ignore
        tree: tree,
      });

      const commit = await octokit.rest.git.createCommit({
        owner: selectedRepo.owner.login,
        repo: selectedRepo.name,
        message: "Update LaTeX file from build4latex",
        tree: newTree.data.sha,
        parents: [branchInfo.data.commit.sha]
      });

      await octokit.rest.git.updateRef({
        owner: selectedRepo.owner.login,
        repo: selectedRepo.name,
        ref: `heads/${selectedRepo.default_branch}`,
        sha: commit.data.sha
      });

      setStatus('idle');
      alert("Salvo no GitHub com sucesso!");
    } catch(err) {
      console.error(err);
      setError("Erro ao commitar no repositório");
      setStatus('error');
    }
  }

  const inspectZip = async (zipFile: File) => {
    try {
      const zip = new JSZip();
      const content = await zip.loadAsync(zipFile);
      const names = Object.keys(content.files).filter(name => !content.files[name].dir);
      
      const contents: Record<string, string | Uint8Array> = {};
      for (const name of names) {
        if (name.endsWith('.tex') || name.endsWith('.sty') || name.endsWith('.cls') || name.endsWith('.bib') || name.endsWith('.txt')) {
          contents[name] = await content.files[name].async('string');
        } else {
          contents[name] = await content.files[name].async('uint8array');
        }
      }

      setZipEntries(names);
      setFileContents(contents);
      
      // Auto-select main.tex or the first tex file
      const mainTex = names.find(n => n === 'main.tex') || names.find(n => n.endsWith('.tex'));
      if (mainTex) setActiveFile(mainTex);

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
      setFileContents({});
      setActiveFile(null);
    }
  };

  const handleEditorChange = (value: string | undefined) => {
    if (activeFile && value !== undefined) {
      setFileContents(prev => ({
        ...prev,
        [activeFile]: value
      }));
    }
  };

  const handleCompile = async () => {
    if (!file || Object.keys(fileContents).length === 0) return;

    setStatus('compiling');
    setError(null);
    setLogs(null);

    try {
      // Re-pack everything into a new ZIP
      const zip = new JSZip();
      for (const [name, content] of Object.entries(fileContents)) {
        zip.file(name, content);
      }
      
      const newZipBlob = await zip.generateAsync({ type: 'blob' });

      const formData = new FormData();
      formData.append('file', newZipBlob, 'project.zip');

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

  // If a ZIP has been loaded, show the IDE view
  if (file && Object.keys(fileContents).length > 0) {
    return (
      <div className="ide-container">
        {/* Sidebar */}
        <div className="ide-sidebar">
          <div className="ide-sidebar-header">
            <span>Arquivos</span>
            <div style={{display: 'flex', gap: '8px'}}>
               <button 
                onClick={() => { setFile(null); setFileContents({}); setPdfUrl(null); setSelectedRepo(null); }}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.75rem' }}
              >
                Voltar
              </button>
            </div>
          </div>
          <ul className="ide-file-list">
            {zipEntries.map(name => (
              <li 
                key={name}
                className={`ide-file-item ${activeFile === name ? 'active' : ''}`}
                onClick={() => setActiveFile(name)}
              >
                <FileIcon size={14} />
                <span title={name} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {name}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Editor */}
        <div className="ide-editor-pane">
          <div className="ide-editor-header">
            {activeFile || 'Nenhum arquivo selecionado'}
          </div>
          <div style={{ flex: 1, position: 'relative' }}>
            {activeFile && typeof fileContents[activeFile] === 'string' ? (
              <Editor
                height="100%"
                language={activeFile.endsWith('.tex') || activeFile.endsWith('.sty') || activeFile.endsWith('.cls') ? 'latex' : 'plaintext'}
                theme="vs-light"
                value={fileContents[activeFile] as string}
                onChange={handleEditorChange}
                options={{
                  minimap: { enabled: false },
                  wordWrap: 'on',
                  fontSize: 14
                }}
              />
            ) : activeFile ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                Este arquivo não é de texto e não pode ser editado.
              </div>
            ) : null}
          </div>
        </div>

        {/* PDF / Compiler Panel */}
        <div className="ide-pdf-pane">
          <div className="ide-pdf-header">
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#334155' }}>PDF</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {pdfUrl && (
                <button 
                  className="ide-compile-btn"
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = pdfUrl;
                    link.download = `${file?.name.replace('.zip', '') || 'compiled'}.pdf`;
                    link.click();
                  }}
                  style={{ background: '#10b981' }}
                >
                  <Download size={14} /> Exportar PDF
                </button>
              )}
              {selectedRepo ? (
                <button 
                  className="ide-compile-btn"
                  onClick={commitChanges}
                  disabled={status === 'compiling'}
                  style={{ background: '#0f172a' }}
                >
                  <FileText size={14} /> Commit
                </button>
              ) : sessionStatus === "authenticated" && (
                <button 
                  className="ide-compile-btn"
                  onClick={handleCreateRepoAndUpload}
                  disabled={status === 'compiling'}
                  style={{ background: '#0f172a' }}
                >
                  <FileText size={14} /> Exportar Git
                </button>
              )}
              <button 
                className="ide-compile-btn"
                onClick={handleCompile}
                disabled={status === 'compiling'}
              >
                {status === 'compiling' ? <Loader2 size={14} className="loading-spinner" /> : <Zap size={14} />}
                Compilar
              </button>
            </div>
          </div>
          <div className="ide-pdf-content">
            {status === 'error' && (
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '1rem', background: '#fef2f2', borderBottom: '1px solid #fee2e2' }}>
                <div style={{ color: '#dc2626', fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>Erro de Compilação</div>
                <div style={{ color: '#991b1b', fontSize: '0.75rem', whiteSpace: 'pre-wrap', maxHeight: '200px', overflowY: 'auto' }}>
                  {error}
                  {logs && `\n\n${logs}`}
                </div>
              </div>
            )}
            {pdfUrl ? (
              <iframe src={`${pdfUrl}#toolbar=0`} title="Compilado PDF" />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', flexDirection: 'column', gap: '1rem' }}>
                {status === 'compiling' ? (
                  <>
                    <Loader2 size={32} className="loading-spinner" />
                    <p>Compilando documento...</p>
                  </>
                ) : (
                  <p>Clique em "Compilar" para gerar o PDF</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Original Upload Screen (if no file loaded)
  return (
    <>
      <header style={{ justifyContent: 'space-between' }}>
        <div className="logo-text">
          Build<span className="four">4</span><span className="latex">Latex</span>
        </div>
        <div>
          {sessionStatus === "authenticated" ? (
             <div style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
               <span style={{fontSize: '0.875rem', fontWeight: 500}}>Olá, {session.user?.name}</span>
               <button onClick={() => signOut()} style={{padding: '0.5rem 1rem', background: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600}}>Sair</button>
             </div>
          ) : sessionStatus === "unauthenticated" ? (
             <button onClick={() => signIn("github")} style={{padding: '0.5rem 1rem', background: '#0f172a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600}}>Entrar com GitHub</button>
          ) : (
             <Loader2 className="loading-spinner" size={18} />
          )}
        </div>
      </header>

      <main className="main-content">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="hero-title">{sessionStatus === "authenticated" ? "Seus Projetos LaTeX" : "Compilar arquivos LaTeX"}</h1>
          <p className="hero-subtitle">
            {sessionStatus === "authenticated" ? "Gerencie seus repositórios sincronizados ou faça upload de um novo arquivo ZIP." : "Carregue seus arquivos LaTeX e obtenha seu PDF em segundos."}
          </p>
        </motion.div>

        {sessionStatus === "authenticated" && (
           <motion.div className="repo-grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem', width: '100%', marginBottom: '2rem' }}>
              {loadingRepos ? (
                <div style={{gridColumn: '1 / -1', textAlign: 'center'}}><Loader2 size={24} className="loading-spinner" style={{margin: '0 auto'}}/></div>
              ) : repos.length > 0 ? (
                repos.map(repo => (
                  <div key={repo.id} style={{ padding: '1.25rem', border: '1px solid var(--border)', borderRadius: '12px', background: 'white', cursor: 'pointer' }} onClick={() => loadRepo(repo)}>
                     <h3 style={{fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: '#0f172a'}}>{repo.name}</h3>
                     <p style={{fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem'}}>{repo.description || 'Sem descrição'}</p>
                     <div style={{fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)'}}>Abrir Projeto &rarr;</div>
                  </div>
                ))
              ) : (
                <div style={{gridColumn: '1 / -1', textAlign: 'center', color: '#64748b'}}>Nenhum repositório GitHub exportado encontrado.</div>
              )}
           </motion.div>
        )}

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
        .ide-container {
          display: flex;
          height: calc(100vh - var(--header-height));
        }
        .ide-sidebar {
          flex: 0 0 250px;
          background: #fff;
          border-right: 1px solid #e5e7eb;
          display: flex;
          flex-direction: column;
        }
        .ide-sidebar-header {
          padding: 1rem;
          border-bottom: 1px solid #e5e7eb;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .ide-file-list {
          flex: 1;
          overflow-y: auto;
          padding: 0.5rem;
          list-style: none;
          margin: 0;
        }
        .ide-file-item {
          padding: 0.5rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          border-radius: 0.375rem;
          transition: background 0.2s;
        }
        .ide-file-item:hover {
          background: #f1f5f9;
        }
        .ide-file-item.active {
          background: #e0f2fe;
          color: #0ea5e9;
        }
        .ide-editor-pane {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .ide-editor-header {
          padding: 0.75rem;
          background: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
          font-weight: 600;
          color: #111827;
        }
        .ide-pdf-pane {
          flex: 1;
          position: relative;
          overflow: hidden;
        }
        .ide-pdf-header {
          padding: 0.75rem;
          background: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .ide-compile-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.375rem 0.75rem;
          background: #2563eb;
          color: white;
          border: none;
          border-radius: 0.375rem;
          cursor: pointer;
          transition: background 0.2s;
        }
        .ide-compile-btn:disabled {
          background: #93c5fd;
          cursor: not-allowed;
        }
        .ide-pdf-content {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          position: relative;
        }
        .ide-pdf-content iframe {
          width: 100%;
          height: 100%;
          border: none;
        }
      `}</style>
    </>
  );
}
