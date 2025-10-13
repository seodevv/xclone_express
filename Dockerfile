# Dockerfile
FROM node:18-alpine

# 작업 디렉토리
WORKDIR /app

# 패키지 설치
COPY package*.json ./
RUN npm install

# 소스 코드 복사
COPY . .
RUN npm run build

# pm2 설치
# RUN npm install pm2 -g

EXPOSE 9090
# CMD ["pm2-runtime", "pm2.config.js"]
CMD ["npm", "run", "start"]
