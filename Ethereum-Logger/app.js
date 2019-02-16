require('dotenv').config();
const Web3 = require('web3');
var SplunkLogger = require("splunk-logging").Logger;
var fs = require('fs');
var ini = require('ini');
var sleep = require('sleep');

var envContents = '';
if (fs.existsSync('./.env')) {
    envContents = fs.readFileSync('.env', 'utf-8');
}
var envFile = ini.parse(envContents);

var config = {
    token: process.env.SPLUNK_HEC_TOKEN,
    url: "https://" + process.env.SPLUNK_HOST + ":" + process.env.SPLUNK_PORT
};

var gethURL = "ws://" + process.env.GETH_WS_HOST + ":" + process.env.GETH_WS_PORT;

console.log("Using geth " + gethURL);
console.log("Using splunk " + config.url);

// Setup the Splunk Logger
var Logger = new SplunkLogger(config);

Logger.error = function (err, context) {
    console.log("error", err, "context", context);
};

Logger.eventFormatter = function (message, severity) {
    var event = message;
    return event;
};

// Setup the connection to geth node
if (typeof web3 !== 'undefined') {
    var web3 = new Web3(web3.currentProvider);
}
else {
    web3 = new Web3(new Web3.providers.WebsocketProvider(gethURL));
}

// Subscribe To any new blocks
var subscription = web3.eth.subscribe('newBlockHeaders', function (error, result) {
    if (error)
        console.log(error);
})
    .on("data", function (blockHeader) {
        console.log(blockHeader.number);
        web3.eth.getBlock(blockHeader.number)
            .then(sendBlock);
    });

//Look for lastblock and start at block to get historical blocks
var currentHistoricalBlock;
if (envFile.LAST_BLOCK) {
    currentHistoricalBlock = parseInt(envFile.LAST_BLOCK) + 1;
}
if (envFile.START_AT_BLOCK) {
    currentHistoricalBlock = envFile.START_AT_BLOCK;
    envFile.START_AT_BLOCK = "";
    fs.writeFileSync('./.env', ini.stringify(envFile));
}
if (currentHistoricalBlock) {
    web3.eth.getBlockNumber()
        .then(function (currentBlock) {
            getHistoricalBlocks(currentHistoricalBlock, currentBlock)
        });
}

var getHistoricalBlocks = function (block, currentBlock) {
    console.log("Getting Historical Block " + block);
    web3.eth.getBlock(block)
        .then(sendBlock)
        .then(() => {
            block++;
            sleep.msleep(500);
            getHistoricalBlocks(block, currentBlock)
        })
}

// Send the block To Splunk
var sendBlock = function (block) {
    var blockPayload = {
        message: block,
        metadata: {
            time: block.timestamp,
            sourcetype: "block"
        }
    };
    Logger.send(blockPayload, function (err, resp, body) {
        console.log("Response from Splunk", body)
    });
    for (var t in block.transactions) {
        web3.eth.getTransaction(block.transactions[t]).then(function (transaction) {
            getWalletTypes(transaction).then(function (transaction) {
                var transactionPayload = {
                    message: transaction,
                    metadata: {
                        time: block.timestamp,
                        sourcetype: "transaction"
                    }
                };
                Logger.send(transactionPayload, function (err, resp, body) {
                    console.log("Response from Splunk", body)
                });
            });
        });
    }
    // Update the env file so the app can start where it left off when stopped.
    envFile.LAST_BLOCK = block.number;
    fs.writeFileSync('./.env', ini.stringify(envFile));
};

// Check if wallet is a contract
var getWalletTypes = function (transaction) {
    let toCode = "0x";
    if (transaction.to == null) {
        transaction.contractCreated = true;
    } else {
        toCode = web3.eth.getCode(transaction.to);
    }
    let fromCode = web3.eth.getCode(transaction.from);
    return Promise.all([fromCode, toCode]).then(function (code) {
        transaction.fromContract = (code[0] !== "0x" ? true : false);
        transaction.toContract = (code[1] !== "0x" ? true : false);
        return transaction;
    });
};

// Keeps app running forever
process.stdin.resume();
