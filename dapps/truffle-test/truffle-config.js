module.exports = {
  networks: {
    development: {
      host: "localhost",
      port: 8545,
      network_id: "*", // Match any network id
      gas: 4718380,
      from: "0x69eff55dce156926164e276ed03484672ec84fbb"
    }
  },
  compilers: {
    solc: {
      settings: {
        optimizer: {
          enabled: true, // Default: false
          runs: 200 // Default: 200
        }
      }
    }
  }
};
