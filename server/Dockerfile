FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Store the DB in a dedicated volume directory (separate from /app/data where
# the app registry lives, so the named volume never shadows approved-apps.json)
ENV DB_PATH=/app/db-data/novoice.db
RUN mkdir -p /app/db-data

EXPOSE 3001

CMD ["node", "index.js"]
