FROM node:10 as builder

RUN apt-get update && apt-get install -y git

WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install

COPY app.js ./
RUN yarn build


FROM node:10-alpine

WORKDIR /app
COPY --from=builder /app/build ./

RUN find . -type d

CMD ["node", "index.js"]
