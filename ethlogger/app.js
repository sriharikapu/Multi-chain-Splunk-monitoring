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

const GETH_URL = 'wss://dai-trace-ws.blockscout.com/ws'; // 'wss://' + process.env.GETH_WS_HOST + ':' + process.env.GETH_WS_PORT;
const SPLUNK_HEC_URL = 'https://' + process.env.SPLUNK_HOST + ':' + process.env.SPLUNK_PORT;

console.log('Using geth ' + GETH_URL);
console.log('Using splunk ' + SPLUNK_HEC_URL);

// Setup the Splunk Logger
const Logger = new SplunkLogger({
  token: process.env.SPLUNK_HEC_TOKEN,
  url: SPLUNK_HEC_URL,
});
let printLoggerErrors = true;
Logger.error = function(err, context) {
  if (printLoggerErrors) {
    console.log('error', err, 'context', context);
  }
};
Logger.eventFormatter = message => message;

const flushLogger = () =>
  new Promise(resolve => {
    printLoggerErrors = false;
    Logger.flush(() => {
      printLoggerErrors = true;
      setTimeout(resolve, 300);
    });
  });

// Setup the connection to geth node
const web3 = new Web3(new Web3.providers.WebsocketProvider(GETH_URL));

function subscribeToNewBlocks() {
  let lastSeenBlock = 0;
  // Subscribe To any new blocks
  web3.eth
    .subscribe('newBlockHeaders', function(error, result) {
      if (error) console.log(error);
    })
    .on('data', function(blockHeader) {
      console.log('Processing new block', blockHeader.number);
      if (blockHeader.number > lastSeenBlock) {
        web3.eth
          .getBlock(blockHeader.number)
          .then(sendBlock)
          .catch(e => {
            console.error('Failed to send block', e);
          });
        lastSeenBlock = blockHeader.number;
      } else {
        console.error('Ignoring already seen block', blockHeader.number);
      }
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
  // console.log(payload);
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
    extractABIDataFromTransaction(transaction);
    const logs = await processTransactionReceipt(transaction);
    const transactionPayload = {
      message: transaction,
      metadata: {
        time: block.timestamp,
        sourcetype: 'transaction',
      },
    };
    sendToSplunk(transactionPayload);
    transactionCount++;

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

async function processTransactionReceipt(transaction) {
  const { hash, from, to } = transaction;

  const [receipt, fromCode, toCode] = await Promise.all([
    web3.eth.getTransactionReceipt(hash),
    web3.eth.getCode(from),
    to == null ? Promise.resolve('0x') : web3.eth.getCode(to),
  ]);

  // console.log(receipt);

  transaction.fromContract = fromCode !== '0x';
  transaction.toContract = toCode !== '0x';

  if (receipt) {
    if (receipt.status != null) {
      transaction.status = !!+receipt.status ? 'success' : 'failed';
    }
    if (receipt.gasUsed != null) {
      transaction.gasUsed = +receipt.gasUsed;
    }
    if (receipt.cumulativeGasUsed != null) {
      transaction.cumulativeGasUsed = +receipt.cumulativeGasUsed;
    }
    if (receipt.contractAddress != null) {
      transaction.contractAddress = receipt.contractAddress;
    }
    transaction.contractCreated = receipt.contractAddress != null;

    if (receipt.logs) {
      const decodedLogs = abiDecoder.decodeLogs(receipt.logs);
      if (decodedLogs) {
        return decodedLogs.filter(l => l != null);
      }
    }
  }
}

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
      } else if (envFile.START_AT_BLOCK) {
        currentHistoricalBlock = envFile.START_AT_BLOCK;
        storeNewCheckpoint('');
      }

      if (currentHistoricalBlock) {
        const currentBlock = await web3.eth.getBlockNumber();
        console.log('LAST BLOCK', currentBlock);
        if (currentHistoricalBlock < 0) {
          currentHistoricalBlock = currentBlock - currentHistoricalBlock;
        }
        console.log('Starting with historical block', currentHistoricalBlock);
        getHistoricalBlocks(currentHistoricalBlock + 1, currentBlock);
      }
      // Keeps app running forever
      process.stdin.resume();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
