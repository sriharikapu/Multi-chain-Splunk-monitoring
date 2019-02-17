# ethereum_monitoring
Splunk App for monitoring ethereum

Provides geth custom generating command and modular input for geth eth-stats

## Custom Command Usage:
```
| geth getBlockByNumber  host=http://127.0.0.1:8545 block=555
| geth getBlockByHash host=http://127.0.0.1:8545 hash=0x014ce176f797f2ad476adbfc91adf6516a14e8cf922ee8d9a6e53549a08c89b4
| geth getTransactionByHash host=http://127.0.0.1:8545 hash=0x728c9f48f572fbd4939c5bacc25c6d5cf872495a34a29b50467402f488a69bd7
| geth getBalance host=http://127.0.0.1:8545 wallet=0x0ADfCCa4B2a1132F82488546AcA086D7E24EA324
| geth getTransactionCount host=http://127.0.0.1:8545 wallet=0x0ADfCCa4B2a1132F82488546AcA086D7E24EA324
| geth getBalance host=http://127.0.0.1:8545 wallet=0x0ADfCCa4B2a1132F82488546AcA086D7E24EA324
| geth getTransactionCount host=http://127.0.0.1:8545 wallet=0x0ADfCCa4B2a1132F82488546AcA086D7E24EA324
| geth getBlockTransactionCountByHash host=http://127.0.0.1:8545 hash=0xdee5b2eb81d1777e3008a451aa6d1000ed346022906bb1472336f78b8a96a40a
| geth getBlockTransactionCountByNumber host=http://127.0.0.1:8545 blockNumber=5
| geth getTransactionReceipt host=http://127.0.0.1:8545 address=0x32F97D85f2a4e327AfF7d7Abf4cCf17C30541638
| geth blockNumber host=http://127.0.0.1:8545
| geth hashrate host=http://127.0.0.1:8545
| geth mining host=http://127.0.0.1:8545
| geth coinbase host=http://127.0.0.1:8545
| geth syncing host=http://127.0.0.1:8545
| geth net_peerCount host=http://127.0.0.1:8545
| geth net_listening host=http://127.0.0.1:8545
```

## Modular input
In Setting => Data inputs Create a new "Ethereum Stats Modular Input"

Start geth with --ethstats option
```
geth --ethstats yourNodeName:yourSecret@splunkhost:3000
```
      
## Installation:
In folder splunk/etc/apps/ethereum_monitoring run:
```
npm install
```
