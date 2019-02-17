const Web3 = require('web3');
const Tx = require('ethereumjs-tx');
const HashstoreABI = require('./contracts/Hashstore');

let web3 = {};
let privKey;
let contractAddress;
let walletAddress;
let gethURL;

// This allows for a proxy to be used via http_proxy or https_proxy
EthHandler.prototype.globalTunnel = require('global-tunnel-ng');


const HttpProxyProvider = require('./httpproxyprovider');

// Need a global nonce for rapid bucket rolls
let nonce;

function EthHandler(props) {
    gethURL = props.url + props.apikey;
    contractAddress = props.contract;
    walletAddress = props.wallet;
    privKey = props.privatekey;
    this.globalTunnel.initialize();
}

function sendSigned(txData, cb) {
    const privateKey = Buffer.from(privKey, 'hex');
    const transaction = new Tx(txData);
    transaction.sign(privateKey);
    const serializedTx = transaction.serialize().toString('hex');
    web3.eth.sendSignedTransaction(`0x${serializedTx}`, cb);
}

EthHandler.prototype.connect = function connect() {
    // Setup the connection to geth node
    web3 = new Web3(new HttpProxyProvider(gethURL));
    return new Promise((resolve,reject) => {
        web3.eth.getTransactionCount(walletAddress, "pending").then((txCount) => {
            nonce = txCount;
            resolve();
        }, (err) => {
            reject(err);
        });
    });
}

EthHandler.prototype.getBucketHash = function getBucketHash(index, bucket) {
    const indexTopicHash = web3.utils.sha3(index);
    const walletTopicHash = web3.utils.padLeft(walletAddress, 64);
    const eventTopicHash = web3.utils.sha3('HashSubmitted(address,string,string,string)');
    const topicHashes = [eventTopicHash, walletTopicHash, indexTopicHash];
    return new Promise((resolve, reject) => {
        web3.eth
            .getPastLogs({ fromBlock: '0x0', address: contractAddress, topics: topicHashes })
            .then((values) => {
                for (let i = 0; i < values.length; i += 1) {
                    const params = web3.eth.abi.decodeParameters(
                        [{ type: 'string', name: 'bucket' }, { type: 'string', name: 'hash' }],
                        values[i].data
                    );
                    if (bucket === params.bucket) {
                        resolve(params.hash);
                    }
                }
                resolve('not found');
            }, (error) => {
                reject(error);
            });
    });
};

EthHandler.prototype.getIndexHashes = function getIndexHashes(index) {
    const indexTopicHash = web3.utils.sha3(index);
    const walletTopicHash = web3.utils.padLeft(walletAddress, 64);
    const eventTopicHash = web3.utils.sha3('HashSubmitted(address,string,string,string)');
    const topicHashes = [eventTopicHash, walletTopicHash, indexTopicHash];
    return new Promise((resolve, reject) => {
        // TODO calculate fromBlock based on startTime and endTime
        web3.eth
            .getPastLogs({ fromBlock: '0x0', address: contractAddress, topics: topicHashes })
            .then((values) => {
                var hashes = {}
                for (let i = 0; i < values.length; i += 1) {
                    const params = web3.eth.abi.decodeParameters(
                        [{ type: 'string', name: 'bucket' }, { type: 'string', name: 'hash' }],
                        values[i].data
                    );
                    if (!hashes[params.bucket]){
                        hashes[params.bucket] = { remoteHash: params.hash };
                    }
                }
                resolve(hashes);
            }, (error) => {
                reject(error);
            });
    });
}

EthHandler.prototype.putBucketHash = function putBucketHash(index, bucket, hash) {
    const contract = new web3.eth.Contract(HashstoreABI, contractAddress);
    const encoded = contract.methods.submitHash(bucket, index, hash).encodeABI();
    return new Promise((resolve, reject) => {
        // construct the transaction data
        // TODO dynamic gasLimit and price
        const txData = {
            nonce: web3.utils.toHex(nonce),
            gasLimit: web3.utils.toHex(250000),
            gasPrice: web3.utils.toHex(10e9), // 10 Gwei
            to: contractAddress,
            from: walletAddress,
            value: '0x00',
            data: encoded
        };
        // Increase the nonce for the next txn
        nonce = nonce + 1
        // fire away!
        sendSigned(txData, (err, result) => {
            if (err) {
                reject(err);
            }
            resolve(result);
        });
    });
};

module.exports = EthHandler;
