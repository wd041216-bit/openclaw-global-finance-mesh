FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV FINANCE_MESH_PORT=3030

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p /app/data/runtime /app/data/audit /app/data/backups /app/data/legal-library

EXPOSE 3030

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch(`http://127.0.0.1:${process.env.FINANCE_MESH_PORT || 3030}/api/health`).then((response)=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "src/server.ts"]
