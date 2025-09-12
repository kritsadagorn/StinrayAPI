FROM node:23.11-alpine AS builder

# ตั้ง working directory
WORKDIR /app

# คัดลอกไฟล์ package.json และ package-lock.json
COPY package*.json ./

# ติดตั้ง Nest CLI และ dependencies
RUN npm install -g @nestjs/cli && npm install

# คัดลอกโค้ดทั้งหมดไปยัง container
COPY . .
RUN npm run generate
# build แอป NestJS
RUN npm run build

# ขั้นตอนที่ 2: ใช้ image สำหรับการรันแอป
FROM node:23.11-alpine

# ตั้ง working directory
WORKDIR /app

# คัดลอกเฉพาะไฟล์ที่จำเป็นจากขั้นตอน build
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/package.json /app/package.json

# ตั้งค่า environment variable (ถ้าต้องการ)
ENV NODE_ENV=production

# เปิด port ที่แอปใช้
EXPOSE 3000

# รันแอป
CMD ["node", "dist/main"]