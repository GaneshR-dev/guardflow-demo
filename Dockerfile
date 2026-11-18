# Stage 1: build the React app (Node 22.12 or later).
FROM node:22-slim AS web
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: run the Python API. It serves frontend/dist at /next.
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt ./
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
COPY --from=web /app/frontend/dist frontend/dist
CMD ["sh", "-c", "uvicorn backend.demo_app:app --host 0.0.0.0 --port ${PORT:-3000}"]
