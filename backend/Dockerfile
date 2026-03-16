FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

COPY package.json tsconfig.json .env.example ./
RUN npm install

COPY src ./src
COPY README.md ./README.md

ENV PORT=8787
ENV HOST=0.0.0.0
ENV DATA_DIR=/app/data
ENV PLAYWRIGHT_HEADLESS=true

RUN npm run build

EXPOSE 8787
CMD ["node", "dist/index.js"]
