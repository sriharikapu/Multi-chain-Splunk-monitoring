require('dotenv').config();
const Web3 = require('web3');
const SplunkLogger = require('splunk-logging').Logger;
const fs = require('fs');
const path = require('path');
const ini = require('ini');
const abiDecoder = require('abi-decoder');

function loadABIs() {
  const abiBaseDir = path.join(__dirname, 'abi');
  console.log('Loading ABIs from', abiBaseDir);
  if (!fs.existsSync(abiBaseDir)) {
    console.error('Error: ABI directory', abiBaseDir, 'does not exist');
    process.exit(1);
  }
  const abis = fs.readdirSync(abiBaseDir);
  const abi = abis
    .map(file => {
      console.log('Adding to ABI:', file);
      const contents = fs.readFileSync(path.join(abiBaseDir, file), { encoding: 'utf-8' });
      const parsed = JSON.parse(contents);
      return parsed;
    })
    .reduce((a, b) => [...a, ...b], []);
  abiDecoder.addABI(abi);
}

function loadEnv() {
  let envContents = '';
  if (fs.existsSync('./.env')) {
    envContents = fs.readFileSync('.env', 'utf-8');
  }
  return ini.parse(envContents);
}

loadABIs();
const envFile = loadEnv();

var config = {
  token: process.env.SPLUNK_HEC_TOKEN,
  url: 'https://' + process.env.SPLUNK_HOST + ':' + process.env.SPLUNK_PORT,
};

var gethURL = 'ws://' + process.env.GETH_WS_HOST + ':' + process.env.GETH_WS_PORT;

console.log('Using geth ' + gethURL);
console.log('Using splunk ' + config.url);

// Setup the Splunk Logger
var Logger = new SplunkLogger(config);

Logger.error = function(err, context) {
  console.log('error', err, 'context', context);
};

Logger.eventFormatter = function(message, severity) {
  var event = message;
  return event;
};

// Setup the connection to geth node
if (typeof web3 !== 'undefined') {
  var web3 = new Web3(web3.currentProvider);
} else {
  web3 = new Web3(new Web3.providers.WebsocketProvider(gethURL));
}

function subscribeToNewBlocks() {
  // Subscribe To any new blocks
  web3.eth
    .subscribe('newBlockHeaders', function(error, result) {
      if (error) console.log(error);
    })
    .on('data', function(blockHeader) {
      console.log('Processing new block', blockHeader.number);
      web3.eth.getBlock(blockHeader.number).then(sendBlock);
    });
}

let storeCheckpoint = true;
function storeNewCheckpoint(val) {
  if (storeCheckpoint) {
    envFile.START_AT_BLOCK = val;
    fs.writeFileSync('./.env', ini.stringify(envFile));
  }
}

const int = str => {
  const v = parseInt(str, 10);
  if (isNaN(v)) {
    throw new Error(`Invalid number ${JSON.stringify(str)}`);
  }
  return v;
};

async function fetchHistoricalBlock(block) {
  console.log('Getting Historical Block ' + block);
  const b = await web3.eth.getBlock(block);
  await sendBlock(b);
}

async function getHistoricalBlocks(firstBlock, lastBlock) {
  const startTime = Date.now();
  let count = 0;
  try {
    for (let block = firstBlock; block < lastBlock; block++) {
      await fetchHistoricalBlock(block);
      count++;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  } catch (e) {
    console.error('ERROR: Failed to process block', block.number);
  }
  console.log(`Processed count=${count} blocks in duration=${Date.now() - startTime} ms`);
}

function sendToSplunk(payload) {
  Logger.send(payload);
}

async function sendBlock(block) {
  const startTime = Date.now();
  let transactionCount = 0;
  let eventCount = 0;
  const blockPayload = {
    message: block,
    metadata: {
      time: block.timestamp,
      sourcetype: 'block',
    },
  };
  sendToSplunk(blockPayload);

  for (const t of block.transactions) {
    const transaction = await web3.eth.getTransaction(t);
    const transactionWithWalletTypes = await getWalletTypes(transaction);
    extractABIDataFromTransaction(transactionWithWalletTypes);
    const transactionPayload = {
      message: transactionWithWalletTypes,
      metadata: {
        time: block.timestamp,
        sourcetype: 'transaction',
      },
    };
    sendToSplunk(transactionPayload);
    transactionCount++;

    const logs = await processTransactionLogs(transaction);
    if (logs) {
      const { blockHash, blockNumber, hash } = transaction;
      logs.forEach((event, index) => {
        const logPayload = {
          message: {
            index,
            transactionHash: hash,
            blockHash,
            blockNumber,
            ...event,
            info: event.events
              ? event.events.reduce((res, e) => ({ ...res, [e.name]: e.value }), {})
              : undefined,
          },
          metadata: {
            time: block.timestamp,
            sourcetype: 'transaction:event',
          },
        };
        sendToSplunk(logPayload);
        eventCount++;
      });
    }
  }

  storeNewCheckpoint(block.number);
  console.log(
    `Processed block number=${
      block.number
    }: sent transactionCount=${transactionCount} and eventCount=${eventCount} to splunk in duration=${Date.now() -
      startTime} ms`
  );
}

// Check if wallet is a contract
function getWalletTypes(transaction) {
  let toCode = '0x';
  if (transaction.to == null) {
    transaction.contractCreated = true;
  } else {
    toCode = web3.eth.getCode(transaction.to);
  }
  let fromCode = web3.eth.getCode(transaction.from);
  return Promise.all([fromCode, toCode]).then(function(code) {
    transaction.fromContract = code[0] !== '0x' ? true : false;
    transaction.toContract = code[1] !== '0x' ? true : false;
    return transaction;
  });
}

function paramsToArgs(params) {
  if (params) {
    return params.reduce((res, p) => ({ ...res, [p.name]: p.value }), {});
  }
}

function extractABIDataFromTransaction(transaction) {
  const { hash, fromContract, toContract, contractCreated } = transaction;
  if (transaction.input) {
    try {
      const res = abiDecoder.decodeMethod(transaction.input);
      if (res) {
        res.args = paramsToArgs(res.params);
        transaction.method = res;
      }
    } catch (e) {
      console.error('Decoding failed', e);
    }
  }
}

async function processTransactionLogs(transaction) {
  const { hash } = transaction;
  const receipt = await web3.eth.getTransactionReceipt(hash);
  if (receipt.logs) {
    const decodedLogs = abiDecoder.decodeLogs(receipt.logs);
    if (decodedLogs) {
      return decodedLogs.filter(l => l != null);
    }
  }
}

const flushLogger = () =>
  new Promise(resolve => {
    Logger.flush();
    setTimeout(resolve, 1000);
  });

async function main() {
  switch (process.argv[2]) {
    case 'backfill':
      console.log('BACKFILL MODE');
      storeCheckpoint = false;
      const blocks = process.argv[3];
      if (/^\d+$/.test(blocks)) {
        await fetchHistoricalBlock(int(blocks));
      } else if (/^\d+-\d+$/.test(blocks)) {
        const [start, end] = blocks.split('-').map(int);
        await getHistoricalBlocks(start, end + 1);
      } else {
        throw new Error(`Invalid backfill input: "${blocks}"`);
      }
      await flushLogger();
      process.exit(0);
      break;

    default:
      console.log('Default mode, monitoring for new transactions');
      subscribeToNewBlocks();

      //Look for lastblock and start at block to get historical blocks
      var currentHistoricalBlock;
      if (envFile.LAST_BLOCK) {
        currentHistoricalBlock = parseInt(envFile.LAST_BLOCK) + 1;
      }
      if (envFile.START_AT_BLOCK) {
        currentHistoricalBlock = envFile.START_AT_BLOCK;
        storeNewCheckpoint('');
      }
      if (process.argv.length > 2) {
        currentHistoricalBlock = parseInt(process.argv[2], 10);
      }

      if (currentHistoricalBlock) {
        const currentBlock = await web3.eth.getBlockNumber();
        console.log('LAST BLOCK', currentBlock);
        if (currentHistoricalBlock < 0) {
          currentHistoricalBlock = currentBlock - currentHistoricalBlock;
        }
        console.log('Starting with historical block', currentHistoricalBlock);
        getHistoricalBlocks(currentHistoricalBlock, currentBlock);
      }
      // Keeps app running forever
      process.stdin.resume();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
