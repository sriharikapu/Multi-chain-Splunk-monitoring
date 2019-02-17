pragma solidity ^0.4.24;

contract Hashstore {

    address public owner;

    constructor () public {
        owner = msg.sender;
    }

    event HashSubmitted(address indexed owner, string indexed index, string bucket, string hash);

    function submitHash(string bucket, string index, string hash) public {
        emit HashSubmitted(msg.sender, index, bucket, hash);
    }

    /** Function to recover the funds on the contract */
    function kill() public {
       if (msg.sender == owner) selfdestruct(owner);
    }
}