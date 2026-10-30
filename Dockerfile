# syntax=docker/dockerfile:1

# Stage 1: Build Frontend Assets
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production Runtime
FROM python:3.11-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=29870
ENV HOST=0.0.0.0
ENV PYTHONUNBUFFERED=1

# Install system dependencies: Git, Node.js, Docker CLI, networking tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    bash \
    openssh-client \
    procps \
    net-tools \
    ca-certificates \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g serve pm2 \
    && rm -rf /var/lib/apt/lists/*

# Install Python backend dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy built frontend assets and backend application code
COPY --from=builder /app/dist ./dist
COPY backend ./backend
COPY public ./public
COPY run_backend.py ./run_backend.py
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh && \
    mkdir -p /app/data/deployments /var/www && \
    chmod -R 777 /app/data /var/www 2>/dev/null || true

EXPOSE 29870

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["python", "run_backend.py"]
