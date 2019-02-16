require('dotenv').config();
const Web3 = require('web3');
const SplunkLogger = require('splunk-logging').Logger;
const fs = require('fs');
const path = require('path');
const ini = require('ini');
const abiDecoder = require('abi-decoder');

function loadABIs() {
  console.log('Loading ABIs...');
  const abis = fs.readdirSync(path.join(__dirname, 'abi'));
  const abi = abis
    .map(file => {
      console.log('Adding to ABI:', file);
      const contents = fs.readFileSync(path.join(__dirname, 'abi', file), { encoding: 'utf-8' });
      const parsed = JSON.parse(contents);
      return parsed.abi;
    })
    .reduce((a, b) => [...a, ...b], []);
  abiDecoder.addABI(abi);
}

loadABIs();

var envContents = '';
if (fs.existsSync('./.env')) {
  envContents = fs.readFileSync('.env', 'utf-8');
}
var envFile = ini.parse(envContents);

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

function subscribeToNewBlock() {
  // Subscribe To any new blocks
  web3.eth
    .subscribe('newBlockHeaders', function(error, result) {
      if (error) console.log(error);
    })
    .on('data', function(blockHeader) {
      console.log('PROCESSING BLOCK', blockHeader.number, '(from sub)');
      web3.eth.getBlock(blockHeader.number).then(sendBlock);
    });
}

subscribeToNewBlock();

//Look for lastblock and start at block to get historical blocks
var currentHistoricalBlock;
if (envFile.LAST_BLOCK) {
  currentHistoricalBlock = parseInt(envFile.LAST_BLOCK) + 1;
}
if (envFile.START_AT_BLOCK) {
  currentHistoricalBlock = envFile.START_AT_BLOCK;
  envFile.START_AT_BLOCK = '';
  fs.writeFileSync('./.env', ini.stringify(envFile));
}
if (process.argv.length > 2) {
  currentHistoricalBlock = parseInt(process.argv[2], 10);
}

if (currentHistoricalBlock) {
  web3.eth.getBlockNumber().then(function(currentBlock) {
    getHistoricalBlocks(currentHistoricalBlock, currentBlock);
  });
}

async function getHistoricalBlocks(block, currentBlock) {
  console.log('Getting Historical Block ' + block);

  let b;
  try {
    b = await web3.eth.getBlock(block);
  } catch (e) {
    console.error('FAILED TO PROCESS BLOCK', block);
    console.error(e);
    return;
  }

  try {
    await sendBlock(b);
  } catch (e) {
    console.error('FAILERD TO SEND BLOCK', block);
    console.error(e);
    return;
  }

  if (block + 1 < currentBlock) {
    setTimeout(() => {
      getHistoricalBlocks(block + 1, currentBlock).catch(e => {
        console.error('UNEXPECTED');
      });
    }, 50);
  }
}

function sendToSplunk(payload) {
  // console.log('SENDING TO SPLUNK', payload);

  Logger.send(payload);
}

async function sendBlock(block) {
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
    await extractABIDataFromTransaction(transactionWithWalletTypes);
    const transactionPayload = {
      message: transactionWithWalletTypes,
      metadata: {
        time: block.timestamp,
        sourcetype: 'transaction',
      },
    };
    sendToSplunk(transactionPayload);
  }

  envFile.LAST_BLOCK = block.number;
  fs.writeFileSync('./.env', ini.stringify(envFile));
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

async function extractABIDataFromTransaction(transaction) {
  const { hash, fromContract, toContract, contractCreated } = transaction;
  if (!transaction.input) {
    return;
  }
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

// Keeps app running forever
process.stdin.resume();
