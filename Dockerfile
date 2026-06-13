FROM python:3.11-slim

WORKDIR /app

# libsndfile: necessário para soundfile/librosa ler áudio
# ffmpeg: necessário para carregar MP3 e outros formatos comprimidos
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Instala dependências Python primeiro (aproveita cache de layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia o código da aplicação
COPY app/        ./app/
COPY static/     ./static/

# Garante que o diretório de logs existe
RUN mkdir -p logs

EXPOSE 8000

# Railway injeta $PORT — fallback para 8000 em dev local
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
