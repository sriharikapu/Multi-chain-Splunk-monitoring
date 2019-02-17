pragma solidity ^0.4.24;
/* Testing Hashstore deployment. */

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";
import "../contracts/Hashstore.sol";

contract TestHashstore {
    function testContractDeployment() public {
        Hashstore h = Hashstore(DeployedAddresses.Hashstore());
        Assert.equal(h.owner(), msg.sender, "owner should be transaction sender");
    }
}