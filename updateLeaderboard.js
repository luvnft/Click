// updateLeaderboard.js
const fs = require("fs");
const { ethers } = require("ethers");
// ใช้ ABI ที่ตรงกับสัญญาปัจจุบัน (ไม่ใช่ตัวที่มี public address[] users;)
const abi = require("./src/ClickCounterABI.json");

const RPC_URL = "https://tea-sepolia.g.alchemy.com/public"; 
const CONTRACT_ADDRESS = "0x0b9eD03FaA424eB56ea279462BCaAa5bA0d2eC45";

async function main() {
  // สร้าง Provider
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  // ผูก Contract (อ่านอย่างเดียวก็พอ ไม่ต้อง Signer)
  const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);

  // เรียก getLeaderboard() จาก ABI ที่ให้มา
  const [addressArray, clicksArray] = await contract.getLeaderboard();

  // รวมเป็นอาร์เรย์ { user, clicks }
  let result = addressArray.map((addr, i) => ({
    user: addr,
    clicks: clicksArray[i].toString()
  }));

  // จะ sort ก่อนก็ได้
  result.sort((a, b) => Number(b.clicks) - Number(a.clicks));

  // เขียนลงไฟล์ JSON
  fs.writeFileSync("public/leaderboard.json", JSON.stringify(result, null, 2), "utf-8");
  console.log("Leaderboard updated. Total =", result.length);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
