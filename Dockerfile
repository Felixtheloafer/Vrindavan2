# Radha — zero-dependency Node service.
# The container deliberately refuses to start without AGENT_ACCESS_TOKEN
# because it binds beyond loopback.
FROM node:22-alpine

WORKDIR /app
COPY package.json ./
COPY agent ./agent
COPY server ./server
RUN mkdir -p data/workspace data/knowledge && chown -R node:node /app

ENV HOST=0.0.0.0
ENV PORT=8787
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health',{headers:{authorization:'Bearer '+process.env.AGENT_ACCESS_TOKEN}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
