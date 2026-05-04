# Usar uma imagem base leve com Node.js
FROM node:20-slim

# Instalar o LaTeX (pdflatex) e dependências necessárias
# Usamos o texlive-latex-extra para suporte a mais pacotes
RUN apt-get update && apt-get install -y \
    texlive-latex-base \
    texlive-latex-recommended \
    texlive-latex-extra \
    texlive-fonts-recommended \
    texlive-lang-portuguese \
    texlive-publishers \
    texlive-bibtex-extra \
    ghostscript \
    && rm -rf /var/lib/apt/lists/*

# Definir diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências do Node
RUN npm install

# Copiar o resto do código
COPY . .

# Build do Next.js
RUN npm run build

# Expor a porta que o Render usa
EXPOSE 3000

# Comando para iniciar o servidor
CMD ["npm", "start"]
