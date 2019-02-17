const readline = require('readline');
const Eth = require('ethjs');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

var eth, searchArgs, command;


// Main loop waiting for commands from splunk
rl.on('line', (input) => {
  if (input.indexOf("chunk") != -1) {
    // Not sure why but a newline is needed
    rl.write("\n");
  }
  else if (input.indexOf("getinfo") != -1) {
    // This is the Initial Message from splunk v2

    command = JSON.parse(input).searchinfo.args[0]
    searchArgs = arrToMap(JSON.parse(input).searchinfo.args.slice(1));
    // Now we tell splunk what type of command it is
    var meta = '{"generating": true, "type": "events"}'
    eth = new Eth(new Eth.HttpProvider(searchArgs.host));
    console.log(`chunked 1.0,${meta.length},0\n${meta}`);
  } else if (input.indexOf("execute") != -1) {
    // Splunk is ready for the data
    // Its in csv format

    switch (command) {
      case 'getBlockByNumber':
        eth.getBlockByNumber(new Eth.BN(searchArgs.blockNumber), true, (err,block) => sendResponse(err, block)) 
        break;
      case 'getBlockByHash':
        eth.getBlockByHash(searchArgs.hash, true, (err,block) => sendResponse(err,block));
        break;
      case 'getTransactionByHash':
        eth.getTransactionByHash(searchArgs.hash, (err,transaction) => sendResponse(err, transaction)) 
        break;
      case 'getBalance':
        eth.getBalance(searchArgs.wallet,"latest", (err, balance) => sendResponse(err,{ 'wallet': searchArgs.wallet, 'balance': Eth.fromWei(balance,'ether')}));
        break;
      case 'getTransactionCount':
        eth.getTransactionCount(searchArgs.wallet, (err,count) => sendResponse(err,{ 'wallet': searchArgs.wallet, 'count':count.toString(10)}));
        break;
      case 'getBlockTransactionCountByHash':
        eth.getBlockTransactionCountByHash(searchArgs.hash, (err,count) => sendResponse(err,{ 'hash': searchArgs.hash, 'count':count.toString(10)}));
        break;
      case 'getBlockTransactionCountByNumber':
        eth.getBlockTransactionCountByNumber(new Eth.BN(searchArgs.blockNumber),(err,count) => sendResponse(err,{ 'blockNumber': searchArgs.blockNumber, 'count': count.toString(10)}));
        break;
      case 'getTransactionReceipt':
        eth.getTransactionReceipt(searchArgs.hash, (err,receipt) => sendResponse(err,receipt));
        break;
      case 'blockNumber':
        eth.blockNumber((err,blockNumber) => sendResponse(err, {'blockNumber' :blockNumber.toString(10)}));
        break;
      case 'hashrate':
        eth.hashrate((err,hashrate) => sendResponse(err,{'hashrate': hashrate.toString(10)}));
        break;
      case 'mining':
        eth.mining((err,mining) => sendResponse(err,{'mining': mining}));
        break;
      case 'coinbase':
        eth.coinbase((err,coinbase) => sendResponse(err,{'coinbase':coinbase}));
        break;
      case 'syncing':
        eth.syncing((err,syncing) => sendResponse(err,{'syncing': syncing}));
        break;
      case 'net_peerCount':
        eth.net_peerCount((err,peerCount) => sendResponse(err,{'net_peerCount': peerCount.toString(10)}));
        break;
      case 'net_listening':
        eth.net_listening((err,listening) => sendResponse(err,{'net_listening': listening}));
        break;
      default:
        sendResponse(null,{'error':'Unknown Command', 'command': command})
    }
  }
});

var sendResponse = function(err,result){
  var fields,headers
  if (err != null){
    for (key in err){
      header = headers === undefined ? '': headers=`${headers},`
      fields = fields === undefined ? '': fields=`${fields},`
      headers = `${headers}${key}`
      fields = `${fields}${escCsv(JSON.stringify(err[key]))}`
    }
    output = `${headers},_raw\n${fields},"${escCsv(JSON.stringify(err))}"`
  } else {
    for (key in result){
      headers = headers === undefined ? '':  headers=`${headers},`
      fields = fields === undefined ? '': fields=`${fields},`
      headers = `${headers}${key}`
      fields = `${fields}${JSON.stringify(result[key])}`
    }
    output = `${headers},sourcetype,_raw\n${fields},_json,"${escCsv(JSON.stringify(result))}"`
  }
  console.log(`chunked 1.0,21,${output.length}\n{ "finished": true }\n${output}`)
}

var escCsv = function (input) {
  return input = input.replace(/"/g, '""');
}

var arrToMap = function (args) {
  return args.reduce(function (map, obj) {
    obj = obj.split("=")
    map[obj[0]] = obj[1];
    return map;
  }, {});
}