const { assert } = require('chai');
const rewire = require('rewire');
const web3 = require('./test_utils');

const EthHandler = rewire('./ethereum');
const props = {
        url: 'https://localhost',
        apikey: 'xxxxxxxx',
        wallet: '0xA000000000000000000000000000000000000000',
        contract: '0xA000000000000000000000000000000000000000',
        privatekey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
}
const ethHandler = new EthHandler(props);
EthHandler.__set__('web3', web3);

describe('ethereum.js', () => {
    describe('#getBucketHash()', () => {
        it('resolves', () => ethHandler.getBucketHash('test', 'test').then((result) => {
            assert.equal(result, 'testHash');
        }));
    });

    describe('#putBucketHash()', () => {
        it('resolves', () => ethHandler.putBucketHash('index', 'bucket', 'hash').then((result) => {
            assert.equal(result, '0xTestTransaction');
        })).timeout(10000);
    });
});
