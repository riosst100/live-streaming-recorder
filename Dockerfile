FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl python3 python3-pip tzdata \
 && case "$(uname -m)" in aarch64|arm64) YT=yt-dlp_linux_aarch64 ;; *) YT=yt-dlp_linux ;; esac \
 && curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/$YT" -o /usr/local/bin/yt-dlp \
 && chmod a+rx /usr/local/bin/yt-dlp \
 && pip install --break-system-packages --no-cache-dir curl_cffi \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production PORT=9843 HOST=0.0.0.0 DATA_DIR=/data DOWNLOAD_DIR=/downloads
COPY --from=build /app /app
VOLUME ["/data", "/downloads"]
EXPOSE 9843
CMD ["npm", "start"]
