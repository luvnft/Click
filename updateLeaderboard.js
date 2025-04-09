// updateLeaderboard.js
const fs = require("fs");
const { ethers } = require("ethers");
const abi = require("./src/ClickCounterABI.json");

// กำหนด RPC endpoint พร้อม API key ของคุณ (ถ้าใช้ API key ให้เปลี่ยน URL ด้วย)
// สำหรับตัวอย่างนี้ ยังคงใช้ public endpoint
const RPC_URL = "https://tea-sepolia.g.alchemy.com/public"; 
const CONTRACT_ADDRESS = "0x0b9eD03FaA424eB56ea279462BCaAa5bA0d2eC45";

// ฟังก์ชัน Delay 
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchLeaderboardWithRetry(maxRetries = 5) {
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
      await delay(1000 * retries); // รอเพิ่มขึ้นตาม number of attempts
    }
  }
  throw new Error("Unable to fetch leaderboard data after multiple attempts");
}

async function main() {
  try {
    const { addressArray, clicksArray } = await fetchLeaderboardWithRetry();
  
    // รวมเป็นอาร์เรย์ { user, clicks }
    let result = addressArray.map((addr, i) => ({
      user: addr,
      clicks: clicksArray[i].toString()
    }));
  
    // เรียงข้อมูลจากมากไปน้อยตามจำนวนคลิก
    result.sort((a, b) => Number(b.clicks) - Number(a.clicks));
  
    // เขียนผลลัพธ์เป็นไฟล์ JSON ลงในโฟลเดอร์ public
    fs.writeFileSync("public/leaderboard.json", JSON.stringify(result, null, 2), "utf-8");
    console.log("Leaderboard updated. Total =", result.length);
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
