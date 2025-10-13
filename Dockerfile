## Dockerfile
# builder
FROM node:18-alpine AS builder

# working directory
WORKDIR /app

# install packages
COPY package*.json ./
RUN npm install

# copy source
COPY . .
RUN npm run build

#######
# runtime
FROM node:18-alpine

# working directory
WORKDIR /app

# build result
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# expose
EXPOSE 9090

# execute
CMD ["npm", "run", "start"]
