FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Store the DB in a separate volume-friendly directory
ENV DB_PATH=/app/data/novoice.db
RUN mkdir -p /app/data

EXPOSE 3001

CMD ["node", "index.js"]
