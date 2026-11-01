FROM node:22-alpine
WORKDIR /app
COPY package.json server.mjs scanner.mjs ./
COPY public ./public
COPY demo ./demo
EXPOSE 4173
ENV PORT=4173
CMD ["node", "server.mjs"]
