# Buffigen

Multi-chain dev environmment with Splunk monitoring

## Getting started

Pre-reqs:

- Docker
- Node 10

### Install CLI utility

```sh-session
$ sh install.sh
```

### Bootstrap new multi-chain project

```sh-session
# cd to some directory where you want to create the project
$ buffigen init
```

### Run your dev-env

```sh-session
$ docker-compose up
```

### Open Browser with web interface

[http://localhost:18000/app/search/search](http://localhost:18000/app/search/search)

> Login with user: admin and password: changeme

Explore ingested events with a query such as:

```
index=*
```
