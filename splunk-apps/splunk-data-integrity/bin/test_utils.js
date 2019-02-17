const Web3 = require('web3');

const mockWeb3 = new Web3();
mockWeb3.eth.getPastLogs = function getPastLogs() {
    return (Promise.resolve([{ data: [] }]));
};
mockWeb3.eth.getTransactionCount = function getTransactionCount() {
    return (Promise.resolve('123'));
};

mockWeb3.eth.abi = {
    decodeParameters() {
        return ({ bucket: 'test', hash: 'testHash' });
    }
};
mockWeb3.eth.sendSignedTransaction = function sendSignedTransaction(obj, cb) { cb('', '0xTestTransaction'); };

module.exports = mockWeb3;
