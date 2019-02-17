var hashstoreABI = [{
  "constant": false,
  "inputs": [],
  "name": "kill",
  "outputs": [],
  "payable": false,
  "stateMutability": "nonpayable",
  "type": "function"
}, {
  "constant": true,
  "inputs": [],
  "name": "owner",
  "outputs": [{
    "name": "",
    "type": "address"
  }],
  "payable": false,
  "stateMutability": "view",
  "type": "function"
}, {
  "constant": false,
  "inputs": [{
    "name": "bucket",
    "type": "string"
  }, {
    "name": "index",
    "type": "string"
  }, {
    "name": "hash",
    "type": "string"
  }],
  "name": "submitHash",
  "outputs": [],
  "payable": false,
  "stateMutability": "nonpayable",
  "type": "function"
}, {
  "inputs": [],
  "payable": false,
  "stateMutability": "nonpayable",
  "type": "constructor"
}, {
  "anonymous": false,
  "inputs": [{
    "indexed": true,
    "name": "owner",
    "type": "address"
  }, {
    "indexed": true,
    "name": "index",
    "type": "string"
  }, {
    "indexed": false,
    "name": "bucket",
    "type": "string"
  }, {
    "indexed": false,
    "name": "hash",
    "type": "string"
  }],
  "name": "HashSubmitted",
  "type": "event"
}];
module.exports = hashstoreABI;
