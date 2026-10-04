# 腾讯云 云托管 / 阿里云 FC 自定义容器 / 任意容器平台
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --registry=https://registry.npmmirror.com
COPY . .
ENV PORT=80
EXPOSE 80
CMD ["node", "server.js"]
