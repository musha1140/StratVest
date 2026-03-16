##
# StratVest multi-stage Dockerfile
#
# This Dockerfile builds the frontend and backend and then assembles them into
# a single production container. The resulting image serves static frontend
# assets and exposes the backend API under the `/api` prefix. To run the
# container locally:
#
#   docker build -t stratvest .
#   docker run -p 8080:8080 stratvest
#
# The server listens on port 8080 by default and can be configured via the
# `PORT` environment variable.

### Stage 1: Build the frontend
FROM node:22-bullseye AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend .
RUN npm run build

### Stage 2: Build the backend
FROM node:22-bullseye AS backend-build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --production
COPY backend .
RUN npm run build

### Stage 3: Assemble production image
FROM node:22-bullseye
WORKDIR /app

# Copy built backend and its dependencies
COPY --from=backend-build /app/backend/dist ./backend/dist
COPY --from=backend-build /app/backend/node_modules ./backend/node_modules

# Copy built frontend
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Copy server script
COPY server.mjs ./server.mjs

# Set runtime environment variables
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Start the combined server
CMD ["node", "server.mjs"]