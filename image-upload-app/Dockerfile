# Multi-stage build for production
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN cd backend && npm ci --only=production
RUN cd frontend && npm ci

# Copy source code
COPY backend ./backend
COPY frontend ./frontend

# Build frontend
RUN cd frontend && npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy backend dependencies and code
COPY --from=builder /app/backend /app/backend

# Copy built frontend
COPY --from=builder /app/frontend/build /app/frontend/build

# Set working directory to backend
WORKDIR /app/backend

# Expose port
EXPOSE 3001

# Set production environment
ENV NODE_ENV=production
ENV USE_S3=true

# Start server
CMD ["node", "server.js"]
