FROM ubuntu:18.04

RUN apt-get update \
    && apt-get install -y curl gnupg gnupg2 gnupg1\
    && curl -sL https://deb.nodesource.com/setup_8.x | bash - \
    && apt install -y nodejs python3-minimal git build-essential

COPY . /root/Ethereum-Logger

WORKDIR /root/Ethereum-Logger

RUN npm install

CMD [ "node" ]