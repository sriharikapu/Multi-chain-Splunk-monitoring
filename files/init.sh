#!/bin/sh
if [ ! -d /root/.ethereum/geth ]; then
    echo "/root/.ethereum/geth not found, running 'geth init'..."
    geth init /root/genesis.json --datadir="/root/.ethereum"
    echo "...done!"
fi

HOSTNAME=`hostname`

geth --ethstats $HOSTNAME:"$@" 
