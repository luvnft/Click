// updateLeaderboard.js
const fs = require("fs");
const { ethers } = require("ethers");
const abi = require("./src/ClickCounterABI.json");

// Set RPC endpoint along with your API key
const RPC_URL = "https://tea-sepolia.g.alchemy.com/public";
const CONTRACT_ADDRESS = "0x0b9eD03FaA424eB56ea279462BCaAa5bA0d2eC45";

// Delay function
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchLeaderboardWithRetry(maxRetries = 20) {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);
  let retries = 0;
  while (retries < maxRetries) {
    try {
      const [addressArray, clicksArray] = await contract.getLeaderboard();
      return { addressArray, clicksArray };
    } catch (error) {
      console.error(`Error fetching getLeaderboard(): Attempt ${retries + 1}`, error);
      retries++;
      await delay(1000 * retries); // Wait longer based on the number of attempts
    }
  }
  throw new Error("Unable to fetch leaderboard data after multiple attempts");
}

async function main() {
  try {
    const { addressArray, clicksArray } = await fetchLeaderboardWithRetry();
  
    // Combine into an array of objects { user, clicks }
    let result = addressArray.map((addr, i) => ({
      user: addr,
      clicks: clicksArray[i].toString()
    }));
  
    // Sort the data in descending order by click count
    result.sort((a, b) => Number(b.clicks) - Number(a.clicks));
  
    // เพิ่ม timestamp และ metadata
    const leaderboardData = {
      lastUpdate: new Date().toISOString(),
      data: result
    };
  
    // Write the result as a JSON file to the public folder
    fs.writeFileSync("public/leaderboard.json", JSON.stringify(leaderboardData, null, 2), "utf-8");
    console.log("Leaderboard updated. Total =", result.length, "at", leaderboardData.lastUpdate);
    process.exit(0);
  } catch (error) {
    console.error("Error fetching leaderboard data:", error);
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
