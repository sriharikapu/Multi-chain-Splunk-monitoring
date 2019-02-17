const Hashstore = artifacts.require('Hashstore.sol');

module.exports = function deploy(deployer) {
    deployer.deploy(Hashstore);
};
