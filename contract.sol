// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ClickCounter {
    uint256 public totalClicks;
    mapping(address => uint256) public userClicks;
    
    // Store addresses that have clicked for use in the leaderboard
    address[] public users;
    mapping(address => bool) public hasClicked;
    
    event Clicked(address indexed user, uint256 totalClicks, uint256 userClicks);

    function click() public {
        totalClicks++;
        userClicks[msg.sender]++;
        
        // Record the address the first time it clicks
        if (!hasClicked[msg.sender]) {
            hasClicked[msg.sender] = true;
            users.push(msg.sender);
        }
        
        emit Clicked(msg.sender, totalClicks, userClicks[msg.sender]);
    }
    
    // Function to retrieve leaderboard data
    function getLeaderboard() public view returns (address[] memory, uint256[] memory) {
        uint256 length = users.length;
        uint256[] memory clicks = new uint256[](length);
        
        for (uint256 i = 0; i < length; i++) {
            clicks[i] = userClicks[users[i]];
        }
        
        return (users, clicks);
    }
}
