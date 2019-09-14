FROM node:8-alpine
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app
COPY . .
COPY .env.prod .env 
RUN npm install
EXPOSE 80
CMD [ "node", "server.js" ]