pragma solidity >=0.4.22 <0.6.0;

contract Migrations {
    address public owner;
    uint256 public last_completed_migration;

    event Foo(address indexed bar, uint256 blah);

    modifier restricted() {
        if (msg.sender == owner) _;
    }

    constructor() public {
        owner = msg.sender;
    }

    function setCompleted(uint completed) public restricted {
        emit Foo(msg.sender, 4711);
        last_completed_migration = completed;
    }

    function upgrade(address new_address) public restricted {
        Migrations upgraded = Migrations(new_address);
        upgraded.setCompleted(last_completed_migration);
    }
}
