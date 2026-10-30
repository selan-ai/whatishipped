FROM node:24-alpine
WORKDIR /brandbook
COPY . .
ENV PORT=8080
EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "server.ts"]
