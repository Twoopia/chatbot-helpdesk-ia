# Help Desk IA — Chatbot de Suporte Técnico

Chatbot de help desk interno com IA, construído com **Python + FastAPI**, suporte a streaming de respostas em tempo real via WebSocket, FAQ automático, histórico de conversas e interface web moderna.

---

## Funcionalidades

- **Chat em tempo real** via WebSocket com respostas em streaming (token a token)
- **FAQ integrado** com busca por palavras-chave e categorias
- **Histórico de conversas** persistido em JSON, com múltiplas sessões
- **Respostas automáticas** por FAQ antes de chamar a IA
- **Integração com IA** — suporte a Anthropic Claude e OpenAI GPT
- **Logs** de conversas (`logs/conversations.jsonl`) e de aplicação (`logs/app.log`)
- **Interface web** responsiva com sidebar de sessões e drawer de FAQ
- **API REST** documentada com Swagger em `/docs`

---

## Tecnologias

| Camada     | Tecnologia                             |
|------------|----------------------------------------|
| Backend    | Python 3.11+, FastAPI, Uvicorn         |
| IA         | Anthropic Claude / OpenAI GPT          |
| Frontend   | HTML5, CSS3, JavaScript (Vanilla)      |
| Persistência | JSON (em memória + arquivo)           |
| Logs       | Python logging + JSONL                 |

---

## Estrutura do Projeto

```
.
├── app/
│   ├── main.py               # Entrypoint FastAPI
│   ├── config.py             # Configurações via variáveis de ambiente
│   ├── models/
│   │   └── chat.py           # Modelos Pydantic
│   ├── routers/
│   │   ├── chat.py           # WebSocket + endpoint REST de chat
│   │   ├── faq.py            # Endpoints de FAQ
│   │   └── history.py        # Endpoints de histórico
│   ├── services/
│   │   ├── ai_service.py     # Integração Anthropic / OpenAI
│   │   ├── faq_service.py    # Busca e matching de FAQ
│   │   ├── history_service.py# Gerenciamento de sessões e histórico
│   │   └── logger_service.py # Setup de logging
│   └── data/
│       └── faq.json          # Base de dados de FAQ
├── static/
│   ├── index.html            # Interface web
│   ├── css/style.css         # Estilos
│   └── js/app.js             # Lógica frontend (WebSocket, UI)
├── logs/                     # Gerado automaticamente
│   ├── app.log               # Logs da aplicação
│   ├── conversations.jsonl   # Log de conversas
│   └── sessions.json         # Histórico de sessões
├── .env                      # Variáveis de ambiente (não versionar)
├── .env.example              # Template de configuração
└── requirements.txt
```

---

## Instalação e Execução

### 1. Pré-requisitos

- Python 3.11 ou superior
- pip

### 2. Clone e instale as dependências

```bash
# Crie e ative um ambiente virtual
python -m venv venv

# Windows
venv\Scripts\activate

# Linux/macOS
source venv/bin/activate

# Instale as dependências
pip install -r requirements.txt
```

### 3. Configure as variáveis de ambiente

```bash
cp .env.example .env
```

Edite o arquivo `.env` e defina sua chave de API:

```env
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-sua-chave-aqui
AI_MODEL=claude-sonnet-4-6
```

### 4. Execute o servidor

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Acesse: **http://localhost:8000**

---

## Variáveis de Ambiente

| Variável                    | Padrão                    | Descrição                                      |
|-----------------------------|---------------------------|------------------------------------------------|
| `AI_PROVIDER`               | `anthropic`               | Provedor de IA: `anthropic` ou `openai`        |
| `ANTHROPIC_API_KEY`         | —                         | Chave da API Anthropic                         |
| `OPENAI_API_KEY`            | —                         | Chave da API OpenAI                            |
| `AI_MODEL`                  | `claude-sonnet-4-6`       | Modelo de IA                                   |
| `AI_MAX_TOKENS`             | `1024`                    | Máximo de tokens na resposta                   |
| `AI_TEMPERATURE`            | `0.7`                     | Temperatura do modelo (0.0–1.0)                |
| `MAX_HISTORY_PER_SESSION`   | `50`                      | Máximo de mensagens por sessão                 |
| `LOG_LEVEL`                 | `INFO`                    | Nível de log (`DEBUG`, `INFO`, `WARNING`)      |
| `LOG_DIR`                   | `logs`                    | Diretório para arquivos de log                 |
| `ALLOWED_ORIGINS`           | `*`                       | Origens permitidas para CORS                   |
| `SYSTEM_PROMPT`             | *(prompt padrão)*         | Prompt de sistema da IA                        |

---

## API Endpoints

### Chat
| Método | Endpoint                      | Descrição                          |
|--------|-------------------------------|------------------------------------|
| WS     | `/api/chat/ws/{session_id}`   | WebSocket de chat em tempo real    |
| POST   | `/api/chat/message`           | Enviar mensagem (REST)             |

### FAQ
| Método | Endpoint                      | Descrição                          |
|--------|-------------------------------|------------------------------------|
| GET    | `/api/faq/`                   | Listar todos os FAQs               |
| GET    | `/api/faq/categories`         | Listar categorias                  |
| GET    | `/api/faq/search?q=texto`     | Buscar FAQs                        |
| GET    | `/api/faq/{id}`               | Buscar FAQ por ID                  |

### Histórico
| Método | Endpoint                      | Descrição                          |
|--------|-------------------------------|------------------------------------|
| GET    | `/api/history/sessions`       | Listar todas as sessões            |
| GET    | `/api/history/{session_id}`   | Histórico de uma sessão            |
| DELETE | `/api/history/{session_id}`   | Remover uma sessão                 |

**Documentação interativa:** http://localhost:8000/docs

---

## Protocolo WebSocket

O cliente envia:
```json
{ "message": "Como resetar minha senha?" }
```

O servidor responde com os seguintes tipos de evento:

| Tipo           | Descrição                                   |
|----------------|---------------------------------------------|
| `history`      | Histórico de mensagens ao conectar          |
| `message`      | Resposta completa (ex: vinda do FAQ)        |
| `typing`       | Indicador de que o assistente está digitando|
| `stream_start` | Início do streaming da resposta IA          |
| `stream_chunk` | Fragmento de texto streamado               |
| `stream_end`   | Fim do streaming com metadados              |

---

## Personalizar o FAQ

Edite o arquivo `app/data/faq.json` seguindo o formato:

```json
{
  "faqs": [
    {
      "id": "13",
      "category": "Minha Categoria",
      "question": "Qual é a pergunta?",
      "keywords": ["palavra1", "palavra2", "sinonimo"],
      "answer": "Resposta detalhada aqui.\n\nPode usar **negrito** e listas.",
      "helpful_count": 0
    }
  ]
}
```

---

## Logs

| Arquivo                        | Conteúdo                                  |
|--------------------------------|-------------------------------------------|
| `logs/app.log`                 | Logs da aplicação (rotativo, max 10MB)   |
| `logs/conversations.jsonl`     | Log estruturado de todas as mensagens    |
| `logs/sessions.json`           | Histórico persistido de sessões          |

Exemplo de entrada em `conversations.jsonl`:
```json
{"timestamp": "2026-05-26T10:30:00", "session_id": "sess_abc123", "role": "user", "content": "Como resetar minha senha?", "source": "user"}
```
