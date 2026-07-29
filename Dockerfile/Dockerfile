# ==========================================
# 阶段 1：编译前端 React + Vite (自动识别 pnpm/npm)
# ==========================================
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend

# 开启 corepack 以支持 pnpm
RUN corepack enable

# 复制依赖定义文件
COPY frontend/package*.json frontend/pnpm-lock.yaml* ./
# 优先使用 pnpm 安装，若无锁文件则回退到 npm
RUN pnpm install --frozen-lockfile || npm install

# 复制前端源码并打包
COPY frontend/ ./
RUN pnpm build || npm run build

# ==========================================
# 阶段 2：编译 Spring Boot 并将前端静态资源嵌入其中
# ==========================================
FROM maven:3.9-eclipse-temurin-17-alpine AS backend-builder
WORKDIR /app

# 复制后端源码
COPY pom.xml .
COPY src ./src

# 把阶段 1 打包好的前端 dist 目录复制到 Spring Boot 的静态资源目录下
COPY --from=frontend-builder /app/frontend/dist ./src/main/resources/static

# 执行 Maven 打包（跳过测试）
RUN mvn clean package -DskipTests

# ==========================================
# 阶段 3：运行镜像（最小化 JRE 环境）
# ==========================================
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# 拷贝最终打好的 JAR 包
COPY --from=backend-builder /app/target/*.jar app.jar

# 暴露 8080 端口
EXPOSE 8080

# 启动命令
ENTRYPOINT ["java", "-jar", "app.jar"]