<div align="center">

<pre>
    ██████╗ ██╗   ██╗██╗██╗     ██████╗ 
    ██╔══██╗██║   ██║██║██║     ██╔══██╗
    ██████╔╝██║   ██║██║██║     ██║  ██║
    ██╔══██╗██║   ██║██║██║     ██║  ██║
    ██████╔╝╚██████╔╝██║███████╗██████╔╝
    ╚═════╝  ╚═════╝ ╚═╝╚══════╝╚═════╝ 
    ██╗  ██╗██╗      █████╗ ████████╗███████╗██╗  ██╗
    ██║  ██║██║     ██╔══██╗╚══██╔══╝██╔════╝╚██╗██╔╝
    ███████║██║     ███████║   ██║   █████╗   ╚███╔╝ 
    ╚════██║██║     ██╔══██║   ██║   ██╔══╝   ██╔██╗ 
         ██║███████╗██║  ██║   ██║   ███████╗██╔╝ ██╗
         ╚═╝╚══════╝╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝
</pre>

<p><b>Web-based LaTeX Compiler · Docker-Powered · Instant PDF Generation</b></p>

<img src="https://img.shields.io/badge/Status-Online-brightgreen?logo=render" alt="Status" />
<img src="https://img.shields.io/badge/Engine-pdflatex-green?logo=latex" alt="LaTeX" />
<img src="https://img.shields.io/badge/Framework-Next.js-black?logo=nextdotjs" alt="Next.js" />
<img src="https://img.shields.io/badge/license-MIT-purple" alt="License" />

</div>

---

## What is Build4Latex?

**Build4Latex** is a professional, cloud-native platform for compiling LaTeX documents instantly. 

Stop wrestling with local TeX distributions. Upload your project ZIP, and get your PDF in seconds through a high-performance Dockerized backend.

```text
You (.zip) → Build4Latex → .pdf
```

Designed for speed, reliability, and a premium user experience.

## How it Works

Build4Latex provides a seamless compilation pipeline using an advanced multi-pass logic:

```text
build4latex.onrender.com
            │
            ▼
       API Handler  ──→  receives ZIP & extracts to temp workspace
            │
            ▼
      Docker Engine ──→  runs pdflatex (multi-pass for refs/bib)
            │
          ┌─┴─┐
          │   │
          ▼   ▼
      PDF File   Logs   ──→  instant download or error diagnostics
```

## Features

*   **Dockerized Backend** — Full TeX Live environment isolated in a secure container.
*   **Multi-Pass Compilation** — Automatically runs pdflatex multiple times to resolve citations, cross-references, and BibTeX.
*   **Smart Root Detection** — Recursively finds your `main.tex` even in complex folder structures.
*   **Premium Interface** — Built with Next.js, Framer Motion, and Lucide for a "wow" first impression.
*   **Zero Configuration** — No local LaTeX installation required. Just upload and compile.
*   **Error Diagnostics** — Real-time log extraction to help you fix LaTeX syntax errors quickly.

## Tech Stack

| Component | Technology |
|---|---|
| **Frontend** | Next.js (React 19), Framer Motion, Lucide Icons |
| **Backend** | Next.js API Routes (Node 20) |
| **Infrastructure** | Docker, Render, TeX Live (pdflatex) |
| **Zip Handling** | Adm-Zip, JSZip |

## Deployment

**Build4Latex** is optimized for **Render** using Docker runtimes.

```bash
# To run locally:
docker build -t build4latex .
docker run -p 3000:3000 build4latex
```

**Required Settings on Render:**
- **Runtime:** Docker
- **Instance Type:** Free (or higher for faster builds)

## Project Structure

```text
build4latex/
├── Dockerfile          # Multi-stage LaTeX setup
├── src/
│   ├── app/
│   │   ├── api/        # Backend compilation logic
│   │   └── page.tsx    # Premium Modeler UI
│   └── components/     # Shared UI components
├── public/             # Static assets
└── package.json        # Dependencies & scripts
```

<div align="center">
Made by Tiburski, Herick B.
</div>
