// updateLeaderboard.js
const fs = require("fs");
const { ethers } = require("ethers");
const abi = require("./src/ClickCounterABI.json");
const path = require("path");

// ค่าคงที่สำหรับการตั้งค่า
const CONFIG = {
  // API settings
  RPC_URL: "https://tea-sepolia.g.alchemy.com/public",
  CONTRACT_ADDRESS: "0x0b9eD03FaA424eB56ea279462BCaAa5bA0d2eC45",
  MAX_RETRIES: 20,
  TIMEOUT_MS: 15000,
  MAX_BACKOFF_MS: 30000,
  
  // File settings
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  
  // Directory paths
  DAILY_STATS_DIR: "public/stats/daily",
  SUMMARY_PATH: "public/stats/summary.json",
  COMPAT_PATH: "public/checkin_stats.json",
  USER_STATS_DIR: "public/stats/users",
  
  // Limits
  MAX_STREAK_DAYS: 30,
  MAX_DAYS_IN_MONTH: 31,
  CONSECUTIVE_DAY_THRESHOLD: 1,
  LARGE_DIFF_THRESHOLD: 10,
  
  // Log levels
  LOG_LEVEL: 0 // 0=minimal, 1=errors+changes, 2=verbose
};

// Set RPC endpoint along with your API key
const RPC_URL = CONFIG.RPC_URL;
const CONTRACT_ADDRESS = CONFIG.CONTRACT_ADDRESS;

// เพิ่ม log level เพื่อควบคุมปริมาณการแสดงผล
// 0 = แสดงเฉพาะข้อมูลสรุป
// 1 = แสดงข้อผิดพลาดและการเปลี่ยนแปลงที่สำคัญ
// 2 = แสดงรายละเอียดทั้งหมด (มากเกินไป)
const LOG_LEVEL = CONFIG.LOG_LEVEL;

// Delay function
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// ฟังก์ชัน log ที่มีการควบคุมระดับการแสดงผล
function log(message, level = 1) {
  if (level <= LOG_LEVEL) {
    console.log(message);
  }
}

async function fetchLeaderboardWithRetry(maxRetries = 20) {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);
  let retries = 0;
  
  // กำหนด timeout สำหรับการเรียก API
  const fetchWithTimeout = async (timeoutMs = 10000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const [addressArray, clicksArray] = await contract.getLeaderboard();
      clearTimeout(timeoutId);
      return { addressArray, clicksArray };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  };
  
  while (retries < maxRetries) {
    try {
      return await fetchWithTimeout(15000); // 15 วินาที timeout
    } catch (error) {
      // ตรวจสอบว่าเป็น timeout หรือไม่
      const isTimeout = error.name === 'AbortError' || error.code === 'ETIMEDOUT';
      const errorMessage = isTimeout 
        ? `API request timed out: Attempt ${retries + 1}` 
        : `Error fetching getLeaderboard(): Attempt ${retries + 1} ${error}`;
      
      console.error(errorMessage);
      retries++;
      
      // คำนวณเวลารอแบบ exponential backoff
      const waitTime = Math.min(1000 * Math.pow(1.5, retries), 30000); // สูงสุด 30 วินาที
      console.log(`Retrying in ${waitTime/1000} seconds...`);
      await delay(waitTime);
    }
  }
  throw new Error(`Unable to fetch leaderboard data after ${maxRetries} attempts`);
}

// แคช
const fileCache = new Map();

// ฟังก์ชันอ่านไฟล์ข้อมูลถ้ามี
function readJSONFile(filePath, defaultValue) {
  // ตรวจสอบแคชก่อน
  if (fileCache.has(filePath)) {
    return JSON.parse(JSON.stringify(fileCache.get(filePath))); // deep clone
  }
  
  try {
    if (fs.existsSync(filePath)) {
      // ตรวจสอบขนาดไฟล์ก่อนอ่าน
      const stats = fs.statSync(filePath);
      if (stats.size > CONFIG.MAX_FILE_SIZE) {
        console.error(`File ${filePath} is too large (${stats.size} bytes). Max size: ${CONFIG.MAX_FILE_SIZE} bytes`);
        return defaultValue;
      }
      
      const data = fs.readFileSync(filePath, 'utf-8');
      try {
        const parsedData = JSON.parse(data);
        // เก็บในแคช
        fileCache.set(filePath, parsedData);
        return parsedData;
      } catch (parseError) {
        console.error(`Error parsing JSON from ${filePath}:`, parseError);
        return defaultValue;
      }
    }
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
  }
  return defaultValue;
}

// แยกฟังก์ชันสำหรับอ่านไฟล์ daily stats ทั้งหมด
function readAllDailyStats() {
  const dailyStatsDir = CONFIG.DAILY_STATS_DIR;
  let dailyFilesData = {};
  let dailyFiles = [];
  
  if (fs.existsSync(dailyStatsDir)) {
    // อ่านไฟล์ทั้งหมดและเรียงตามวันที่
    dailyFiles = fs.readdirSync(dailyStatsDir)
      .filter(file => file.endsWith('.json'))
      .sort(); // เรียงตามวันที่ (YYYY-MM-DD.json)
    
    console.log(`Found ${dailyFiles.length} daily stat files in ${dailyStatsDir}`);
    
    // อ่านข้อมูลจากทุกไฟล์เก็บไว้ใช้งาน
    for (const file of dailyFiles) {
      try {
        const fileData = fs.readFileSync(`${dailyStatsDir}/${file}`, 'utf-8');
        const parsedData = JSON.parse(fileData);
        dailyFilesData[file] = parsedData;
        console.log(`Read ${file}: ${parsedData.count} check-ins`);
      } catch (err) {
        console.error(`Error reading daily file ${file}:`, err);
        dailyFilesData[file] = { count: 0, users: {} };
      }
    }
  } else {
    console.log(`Daily stats directory ${dailyStatsDir} does not exist, creating it`);
    ensureDirectoryExists(dailyStatsDir);
  }
  
  return { dailyFilesData, dailyFiles };
}

// แยกฟังก์ชันสำหรับคำนวณ total check-ins
function calculateTotalCheckIns(dailyFilesData) {
  let totalCheckIns = 0;
  let individualCounts = {};
  let todayDate = new Date().toISOString().split('T')[0]; // วันที่ปัจจุบัน (YYYY-MM-DD)
  let todayFile = todayDate + '.json';
  let checkInsToday = 0;
  
  console.log(`Calculating total check-ins from ${Object.keys(dailyFilesData).length} daily files`);
  
  // ตรวจสอบข้อมูลแต่ละไฟล์
  for (const file in dailyFilesData) {
    try {
      const fileCount = dailyFilesData[file].count || 0;
      const userCount = Object.keys(dailyFilesData[file].users || {}).length;
      
      // เก็บข้อมูลวันนี้ไว้ตรวจสอบความถูกต้อง
      if (file === todayFile) {
        checkInsToday = Math.max(fileCount, userCount);
        console.log(`Today's check-ins (${file}): ${checkInsToday}`);
      }
      
      // ตรวจสอบความสอดคล้องของข้อมูล
      if (fileCount !== userCount) {
        console.warn(`Warning: File ${file} has inconsistent data: count=${fileCount}, users=${userCount}`);
        // ใช้ค่าที่มากกว่าเพื่อความมั่นใจว่านับครบ
        const actualCount = Math.max(fileCount, userCount);
        individualCounts[file] = actualCount;
        totalCheckIns += actualCount;
      } else {
        individualCounts[file] = fileCount;
        totalCheckIns += fileCount;
      }
      
      console.log(`Counting check-ins from ${file}: ${individualCounts[file]} (running total: ${totalCheckIns})`);
    } catch (err) {
      console.error(`Error processing daily file ${file}:`, err);
    }
  }
  
  // ตรวจสอบรวมทั้งหมดอีกครั้ง
  const total = Object.values(individualCounts).reduce((sum, count) => sum + count, 0);
  if (total !== totalCheckIns) {
    console.error(`Error in total calculation: sum=${total}, totalCheckIns=${totalCheckIns}`);
    totalCheckIns = total; // ส่งค่าที่คำนวณใหม่กลับไป
  }
  
  // ตรวจสอบว่า totalCheckIns ต้องไม่น้อยกว่า checkInsToday
  if (checkInsToday > 0 && totalCheckIns < checkInsToday) {
    console.error(`Error: totalCheckIns (${totalCheckIns}) is less than checkInsToday (${checkInsToday})`);
    console.log(`Correcting totalCheckIns to match at least checkInsToday (${checkInsToday})`);
    totalCheckIns = checkInsToday;
  }
  
  // คืนค่ายอดรวมของทุกวัน
  console.log(`Total accumulated check-ins from all days: ${totalCheckIns}`);
  return totalCheckIns;
}

// แยกฟังก์ชันสำหรับอัพเดทข้อมูล streak ของผู้ใช้
function updateUserStreak(userAddress, todayStats, dailyFilesData, today) {
  if (!todayStats.users[userAddress]) return { maxStreak: 0 };
  
  // ใช้ 2 ตัวอักษรแรกของ address เป็นโฟลเดอร์เพื่อแบ่งข้อมูล (ลดขนาดโฟลเดอร์)
  const userPrefix = userAddress.substring(2, 4);
  const userStreakPath = `${CONFIG.USER_STATS_DIR}/${userPrefix}/${userAddress}.json`;
  
  // สร้างโฟลเดอร์ถ้ายังไม่มี
  ensureDirectoryExists(path.dirname(userStreakPath));
  
  // โหลดหรือสร้างข้อมูล streak ของผู้ใช้
  let userStreak = readJSONFile(userStreakPath, { 
    currentStreak: 0,
    maxStreak: 0,
    lastCheckIn: null,
    totalCheckIns: 0,
    months: {} // เก็บจำนวน check-in แยกตามเดือน
  });
  
  // ตรวจนับจำนวน check-in ของผู้ใช้จากไฟล์ daily
  let userTotalCheckIns = 0;
  let userCheckInMonths = {}; // เก็บสถิติรายเดือนที่มีการ check-in จริง
  let userRealStreak = 0; // นับ streak จริงตามวันที่ check-in
  let lastCheckInDate = null;
  
  // ใช้ข้อมูลที่อ่านมาแล้วแทนการอ่านใหม่
  for (const file in dailyFilesData) {
    try {
      const dateStr = file.replace('.json', '');
      const [checkInYear, checkInMonth, checkInDay] = dateStr.split('-');
      const checkInYearMonth = `${checkInYear}-${checkInMonth}`;
      
      const dailyData = dailyFilesData[file];
      // ตรวจสอบว่าผู้ใช้มี check-in ในวันนี้หรือไม่
      if (dailyData.users && dailyData.users[userAddress]) {
        userTotalCheckIns++;
        
        // นับสถิติรายเดือน
        if (!userCheckInMonths[checkInYearMonth]) {
          userCheckInMonths[checkInYearMonth] = 0;
        }
        userCheckInMonths[checkInYearMonth]++;
        
        // คำนวณ streak จริงจากวันที่ check-in
        const currentDate = new Date(dateStr);
        if (lastCheckInDate === null) {
          // วันแรกที่ check-in
          userRealStreak = 1;
        } else {
          const diffTime = Math.abs(currentDate - lastCheckInDate);
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
          
          if (diffDays === 1) {
            // วันถัดไป - เพิ่ม streak
            userRealStreak++;
          } else if (diffDays > 1) {
            // ขาดวัน - รีเซ็ต streak
            userRealStreak = 1;
          }
          // ถ้าเป็นวันเดียวกัน ไม่ต้องทำอะไร
        }
        
        lastCheckInDate = currentDate;
      }
    } catch (err) {
      console.error(`Error processing daily file for user ${userAddress}:`, err);
    }
  }
  
  // บันทึกจำนวน check-in และ streak ที่ถูกต้อง
  let hasChanges = false;
  
  // แก้ไขค่า totalCheckIns
  if (userStreak.totalCheckIns !== userTotalCheckIns) {
    log(`User ${userAddress}: correcting check-ins from ${userStreak.totalCheckIns} to ${userTotalCheckIns}`, 1);
    userStreak.totalCheckIns = userTotalCheckIns;
    hasChanges = true;
  }
  
  // แก้ไขค่า maxStreak ถ้าค่าเดิมไม่สมเหตุสมผล
  if (userStreak.maxStreak > userTotalCheckIns || userStreak.maxStreak > CONFIG.MAX_STREAK_DAYS) {
    log(`User ${userAddress}: correcting max streak from ${userStreak.maxStreak} to ${userRealStreak}`, 1);
    userStreak.maxStreak = userRealStreak;
    hasChanges = true;
  }
  
  // แก้ไขค่า currentStreak ถ้าค่าเดิมไม่สมเหตุสมผล
  if (userStreak.currentStreak > userTotalCheckIns) {
    log(`User ${userAddress}: correcting current streak from ${userStreak.currentStreak} to ${userRealStreak}`, 1);
    userStreak.currentStreak = userRealStreak;
    hasChanges = true;
  }
  
  // แก้ไขสถิติรายเดือน
  if (userStreak.months && Object.keys(userStreak.months).length > 0) {
    // ตรวจสอบเดือนที่มีค่าผิดปกติ (เกิน 31 วัน)
    for (const month in userStreak.months) {
      if (userStreak.months[month] > CONFIG.MAX_DAYS_IN_MONTH) {
        log(`User ${userAddress}: correcting month ${month} from ${userStreak.months[month]} to ${userCheckInMonths[month] || 0}`, 1);
        if (userCheckInMonths[month]) {
          userStreak.months[month] = userCheckInMonths[month];
        } else {
          delete userStreak.months[month]; // ลบเดือนที่ไม่มีข้อมูลจริง
        }
        hasChanges = true;
      }
    }
  }
  
  // บันทึกสถิติรายเดือนตามข้อมูลจริง
  userStreak.months = userCheckInMonths;
  
  // อัพเดทวันล่าสุดที่ check-in (อาจจะเป็นวันนี้หรือวันล่าสุดที่พบในไฟล์ daily)
  userStreak.lastCheckIn = today;
  
  // อัพเดทค่า currentStreak เป็นค่าล่าสุดเสมอ (แม้จะไม่มีเงื่อนไขอื่น)
  if (userStreak.currentStreak !== userRealStreak) {
    log(`User ${userAddress}: updating current streak from ${userStreak.currentStreak} to ${userRealStreak}`, 1);
    userStreak.currentStreak = userRealStreak;
    hasChanges = true;
  }
  
  // เลือกค่า max streak ที่มากกว่า
  if (userRealStreak > userStreak.maxStreak) {
    userStreak.maxStreak = userRealStreak;
    hasChanges = true;
  }
  
  // บันทึกการเปลี่ยนแปลงเสมอเพื่อให้แน่ใจว่าข้อมูลถูกอัพเดท
  safeWriteJSONFile(userStreakPath, userStreak);
  
  return { maxStreak: userStreak.maxStreak };
}

// ฟังก์ชันเก็บข้อมูล check-ins
function updateCheckInStats(currentData, previousData) {
  const today = new Date().toISOString().split('T')[0]; // เอาแค่ YYYY-MM-DD
  const [currentYear, currentMonth] = today.split('-');
  const currentYearMonth = `${currentYear}-${currentMonth}`;

  // ตรวจสอบว่ามีข้อมูลก่อนหน้าหรือไม่
  if (!previousData || !previousData.data) {
    log("No previous data to compare, skipping check-in calculation");
    return {
      checkInsToday: 0,
      totalCheckIns: 0,
      maxStreak: 0
    };
  }

  // ----------------------------------------------------------
  // 1. อ่านข้อมูลจากไดเร็กทอรี daily stats เพียงครั้งเดียว
  // ----------------------------------------------------------
  const { dailyFilesData, dailyFiles } = readAllDailyStats();
  
  // ----------------------------------------------------------
  // 2. อัพเดทข้อมูล check-in ประจำวัน
  // ----------------------------------------------------------
  const dailyStatsPath = `${CONFIG.DAILY_STATS_DIR}/${today}.json`;
  // สร้างโฟลเดอร์ถ้ายังไม่มี
  ensureDirectoryExists(path.dirname(dailyStatsPath));
  
  // โหลดหรือสร้างข้อมูลวันนี้
  let todayStats = readJSONFile(dailyStatsPath, { count: 0, users: {} });
  
  // รีเซ็ตค่า count เพื่อคำนวณใหม่จากผู้ใช้จริง
  todayStats.count = 0;
  
  // สร้าง map ของข้อมูลเก่า
  const prevUserMap = {};
  previousData.data.forEach(entry => {
    prevUserMap[entry.user.toLowerCase()] = Number(entry.clicks);
  });
  
  // ตรวจสอบว่าผู้ใช้คนไหนมีการคลิกเพิ่มขึ้นในวันนี้ (นับเป็น check-in)
  let newCheckInsToday = 0;
  
  // คำนวณวันที่สำหรับตรวจสอบ check-in ก่อนเที่ยงคืน
  // ใช้วันที่แบบ UTC เพื่อให้ตรงกับเวลาสากล
  const now = new Date();
  const todayUTC = now.toISOString().split('T')[0]; // YYYY-MM-DD ปัจจุบัน
  
  // ถ้าต้องการตรวจสอบการ check-in ก่อน 00:00 UTC ของวันนี้
  // คำนวณวันที่เมื่อวาน
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayUTC = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD เมื่อวาน
  
  // โหลดข้อมูล check-in ของเมื่อวาน (ถ้ามี)
  const yesterdayStatsPath = `${CONFIG.DAILY_STATS_DIR}/${yesterdayUTC}.json`;
  let yesterdayStats = { count: 0, users: {} };
  if (fs.existsSync(yesterdayStatsPath)) {
    try {
      yesterdayStats = JSON.parse(fs.readFileSync(yesterdayStatsPath, 'utf-8'));
    } catch (err) {
      console.error(`Error reading yesterday's stats:`, err);
    }
  }
  
  // นับจำนวนผู้ใช้ที่มีการอัพเดทแต่ไม่แสดงรายละเอียดทุกคน
  let updatedUsers = 0;
  let newUsers = 0;
  
  // ตรวจสอบผู้ใช้ที่มีการคลิก
  currentData.forEach(entry => {
    const userAddress = entry.user.toLowerCase();
    const prevClicks = prevUserMap[userAddress] || 0;
    const currentClicks = Number(entry.clicks);
    
    // แสดงข้อมูลสำหรับการตรวจสอบ (เฉพาะเมื่อ LOG_LEVEL สูง)
    log(`User ${userAddress}: previous=${prevClicks}, current=${currentClicks}`, 2);
    
    // ตรวจสอบว่ามีการคลิกหรือไม่
    if (currentClicks > 0) {
      // ตรวจสอบเพิ่มเติมว่ามีการเพิ่มขึ้นของคะแนนหรือไม่
      const hasIncreased = currentClicks > prevClicks;
      const clicksIncreased = currentClicks - prevClicks;
      
      // ********** การอัพเดท CHECK-IN อัตโนมัติ **********
      // ถ้าผู้ใช้มีคลิกเพิ่มขึ้นอย่างน้อย 1 ครั้ง ให้ถือว่า check-in สำหรับวันนี้
      if (hasIncreased) {
        // ถ้ายังไม่ได้ check-in วันนี้ แต่มีคลิกเพิ่มขึ้น -> บันทึกเป็น check-in วันนี้
        if (!todayStats.users[userAddress]) {
          todayStats.users[userAddress] = true;
          newCheckInsToday++;
          
          if (prevClicks === 0) {
            newUsers++;
            log(`New user: ${userAddress} checked in with ${currentClicks} clicks`, 1);
          } else {
            updatedUsers++;
            log(`User ${userAddress} auto-checked-in today: ${prevClicks} -> ${currentClicks} (+${clicksIncreased} clicks)`, 1);
          }
        } else {
          // มี check-in แล้ว แต่ยังคลิกเพิ่ม
          log(`User ${userAddress} already checked-in today, added more clicks: ${prevClicks} -> ${currentClicks} (+${clicksIncreased})`, 2);
        }
      } else {
        // มีคะแนนแต่ไม่เพิ่มขึ้น - ไม่นับเป็น check-in
        log(`User ${userAddress} has not increased clicks: ${prevClicks} = ${currentClicks}, no check-in recorded`, 2);
      }
      
      // ตรวจสอบสำหรับวันก่อนหน้า (ถ้ายังไม่ได้เช็คอินวันก่อนหน้า)
      // หากพบว่ามีคลิกเพิ่มขึ้นอย่างมีนัยสำคัญ (>5) และยังไม่ได้ check-in เมื่อวาน 
      // มีโอกาสว่าคลิกได้เกิดในช่วงวันก่อนหน้า 
      if (!yesterdayStats.users[userAddress] && clicksIncreased > 5) {
        // แบ่งการ check-in ระหว่างวันนี้กับเมื่อวานตามสัดส่วนของคลิกที่เพิ่มขึ้น
        // (สำหรับวัตถุประสงค์ในการกระจายข้อมูลเท่านั้น)
        
        // ถ้ายังไม่ได้ check-in วันนี้ ให้บันทึกเป็นวันนี้ (มีความสำคัญกว่า)
        if (!todayStats.users[userAddress]) {
          todayStats.users[userAddress] = true;
          log(`User ${userAddress} assigned to today with ${currentClicks} clicks (large increase of ${clicksIncreased})`, 1);
        } 
        // ถ้า check-in วันนี้แล้ว และคลิกเพิ่มขึ้นมาก ให้บันทึกเมื่อวานด้วย
        else {
          yesterdayStats.users[userAddress] = true;
          log(`User ${userAddress} additionally assigned to yesterday with significant increase: +${clicksIncreased} clicks`, 1);
          
          // บันทึกข้อมูลเมื่อวานด้วย
          yesterdayStats.count = Object.keys(yesterdayStats.users).length;
          safeWriteJSONFile(yesterdayStatsPath, yesterdayStats);
        }
      }
    }
  });
  
  // บันทึกข้อมูลวันนี้
  // กำหนดค่า count ให้เท่ากับจำนวนผู้ใช้จริง
  todayStats.count = Object.keys(todayStats.users).length;
  safeWriteJSONFile(dailyStatsPath, todayStats);
  console.log(`Daily stats for ${today}: ${todayStats.count} check-ins (from ${Object.keys(todayStats.users).length} users)`);
  log(`Check-ins summary: ${todayStats.count} total (+${newCheckInsToday} new, ${newUsers} first-time users)`);
  
  // อัพเดตข้อมูล dailyFiles ด้วยเพื่อให้การคำนวณ total ถูกต้อง
  if (dailyFilesData[`${today}.json`]) {
    // อัพเดทข้อมูลในแคชให้ตรงกับที่บันทึกลงไฟล์
    dailyFilesData[`${today}.json`] = { ...todayStats };
    console.log(`Updated cached daily data for ${today} with count = ${todayStats.count}`);
  }
  
  // ----------------------------------------------------------
  // 3. อัพเดทข้อมูล streak ของแต่ละผู้ใช้
  // ----------------------------------------------------------
  let maxStreakUpdated = 0;
  let updatedStreaks = 0;
  
  // อัพเดท streak ของผู้ใช้แต่ละคนที่ check-in วันนี้
  for (const userAddress in todayStats.users) {
    const result = updateUserStreak(userAddress, todayStats, dailyFilesData, today);
    if (result.maxStreak > maxStreakUpdated) {
      maxStreakUpdated = result.maxStreak;
    }
    updatedStreaks++;
  }
  
  log(`Updated streaks for ${updatedStreaks} users`);
  
  // ----------------------------------------------------------
  // 4. อัพเดทข้อมูลสรุปทั้งหมด (สำหรับแสดงในหน้าเว็บ)
  // ----------------------------------------------------------
  const summaryPath = CONFIG.SUMMARY_PATH;
  let summaryStats = readJSONFile(summaryPath, {
    lastUpdate: new Date().toISOString(),
    totalUsers: 0,
    checkInsToday: 0,
    totalCheckIns: 0,
    maxStreak: 0,
    // เก็บจำนวน check-in ย้อนหลัง 7 วัน
    lastSevenDays: {}
  });
  
  // อัพเดทจำนวนผู้ใช้ทั้งหมด
  summaryStats.totalUsers = currentData.length;
  
  // อัพเดทจำนวน check-in วันนี้
  summaryStats.checkInsToday = todayStats.count;
  
  // อัพเดทเวลาล่าสุดที่อัพเดท
  summaryStats.lastUpdate = new Date().toISOString();
  
  // อัพเดท max streak ถ้าจำเป็น
  if (maxStreakUpdated > summaryStats.maxStreak) {
    summaryStats.maxStreak = maxStreakUpdated;
  }
  
  // อัพเดทข้อมูล 7 วันล่าสุด
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateKey = d.toISOString().split('T')[0];
    const dateFile = dateKey + '.json';
    
    // วันนี้ใช้ค่าเดียวกับ checkInsToday เพื่อให้ข้อมูลตรงกัน
    if (i === 0) { // วันปัจจุบัน
      console.log(`Day ${i} (${dateKey}): Using todayStats.count = ${todayStats.count} for consistency`);
      summaryStats.lastSevenDays[dateKey] = todayStats.count;
    }
    // สำหรับวันอื่นๆ ดึงจากไฟล์ตามปกติ
    else if (dailyFilesData[dateFile]) {
      const fileCount = dailyFilesData[dateFile].count || 0;
      const userCount = Object.keys(dailyFilesData[dateFile].users || {}).length;
      const actualCount = Math.max(fileCount, userCount);
      
      console.log(`Day ${i} (${dateKey}): Found ${actualCount} check-ins in data file`);
      summaryStats.lastSevenDays[dateKey] = actualCount;
    } else {
      // ไม่มีข้อมูลสำหรับวันนี้
      console.log(`Day ${i} (${dateKey}): No data file found, setting to 0`);
      summaryStats.lastSevenDays[dateKey] = 0;
    }
  }
  
  // คำนวณจำนวน check-in ทั้งหมด โดยนับตามข้อมูลจริงในไฟล์
  let prevTotalCheckIns = 0;
  if (fs.existsSync(summaryPath)) {
    try {
      const prevSummary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
      prevTotalCheckIns = prevSummary.totalCheckIns || 0;
    } catch (err) {
      console.error("Error reading previous summary:", err);
    }
  }
  
  // ใช้ฟังก์ชันแยกในการคำนวณ totalCheckIns
  const actualTotalCheckIns = calculateTotalCheckIns(dailyFilesData);
  
  // เตือนถ้าค่าเดิมผิดปกติ
  if (prevTotalCheckIns > 0 && Math.abs(prevTotalCheckIns - actualTotalCheckIns) > CONFIG.LARGE_DIFF_THRESHOLD) {
    console.warn(`Warning: Difference in totalCheckIns detected!`);
    console.warn(`Previous value: ${prevTotalCheckIns}, Calculated value: ${actualTotalCheckIns}`);
  }
  
  // ใช้ค่า totalCheckIns ที่คำนวณได้จริงจากข้อมูล daily stats
  console.log(`Setting totalCheckIns to: ${actualTotalCheckIns} (from actual daily stats)`);
  summaryStats.totalCheckIns = actualTotalCheckIns;
  
  log(`Total check-ins set to ${actualTotalCheckIns} (previously: ${prevTotalCheckIns})`, 1);
  
  // แก้ไขค่า maxStreak ให้เป็น 1 เสมอ
  summaryStats.maxStreak = 1;
  log(`Setting maxStreak to 1 per requirement`);
  
  // บันทึกข้อมูลสรุป
  safeWriteJSONFile(summaryPath, summaryStats);
  
  // สร้างไฟล์ checkin_stats.json เวอร์ชันเก่าแบบย่อเพื่อความเข้ากันได้
  const compatPath = CONFIG.COMPAT_PATH;
  const compatData = {
    stats: {
      totalCheckIns: actualTotalCheckIns, // ใช้ค่าที่คำนวณจาก daily files
      maxStreak: summaryStats.maxStreak,
      checkInsToday: summaryStats.checkInsToday,
      lastUpdate: summaryStats.lastUpdate
    },
    dailyData: {},
    streaks: {}
  };
  
  // ใส่ข้อมูลวันนี้ลงไป
  compatData.dailyData[today] = {
    count: todayStats.count,
    users: Object.keys(todayStats.users)
  };
  
  console.log(`Writing compat data to ${compatPath} with totalCheckIns=${compatData.stats.totalCheckIns}, checkInsToday=${compatData.stats.checkInsToday}`);
  
  // บันทึกไฟล์เวอร์ชันเก่า
  safeWriteJSONFile(compatPath, compatData);
  
  return {
    checkInsToday: todayStats.count,
    totalCheckIns: summaryStats.totalCheckIns,
    maxStreak: summaryStats.maxStreak
  };
}

// ฟังก์ชันสร้างโฟลเดอร์อัตโนมัติถ้ายังไม่มี
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// ฟังก์ชันบันทึกไฟล์อย่างปลอดภัย
function safeWriteJSONFile(filePath, data) {
  const tempPath = `${filePath}.tmp`;
  try {
    // เขียนลงไฟล์ชั่วคราวก่อน
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8");
    
    // ตรวจสอบว่าไฟล์ชั่วคราวถูกเขียนสมบูรณ์หรือไม่
    try {
      const checkData = fs.readFileSync(tempPath, "utf-8");
      JSON.parse(checkData); // ทดสอบว่าเป็น JSON ที่ถูกต้อง
    } catch (parseError) {
      throw new Error(`Failed to validate temp file: ${parseError.message}`);
    }
    
    // ถ้าเขียนสมบูรณ์ ให้ย้ายไฟล์ชั่วคราวไปแทนที่ไฟล์จริง
    if (fs.existsSync(filePath)) {
      // สำรองไฟล์เดิมก่อน
      const backupPath = `${filePath}.bak`;
      try {
        fs.copyFileSync(filePath, backupPath);
      } catch (backupError) {
        console.warn(`Warning: Failed to create backup of ${filePath}: ${backupError.message}`);
      }
      
      // ลบไฟล์เดิม
      fs.unlinkSync(filePath);
    }
    
    // ย้ายไฟล์ชั่วคราวไปเป็นไฟล์จริง
    fs.renameSync(tempPath, filePath);
    return true;
  } catch (error) {
    console.error(`Error writing file ${filePath}: ${error.message}`);
    
    // ถ้ามีข้อผิดพลาด ให้ลบไฟล์ชั่วคราว
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch (cleanupError) {
        console.error(`Error cleaning up temp file ${tempPath}: ${cleanupError.message}`);
      }
    }
    return false;
  }
}

async function main() {
  try {
    // อ่านข้อมูล leaderboard เก่า (ถ้ามี)
    const leaderboardFilePath = "public/leaderboard.json";
    const previousData = readJSONFile(leaderboardFilePath, null);
    
    // ดึงข้อมูลปัจจุบัน
    const { addressArray, clicksArray } = await fetchLeaderboardWithRetry();
  
    // Combine into an array of objects { user, clicks }
    let result = addressArray.map((addr, i) => ({
      user: addr,
      clicks: clicksArray[i].toString()
    }));
  
    // Sort the data in descending order by click count
    result.sort((a, b) => Number(b.clicks) - Number(a.clicks));
    
    // ตรวจสอบว่าเป็นวันใหม่หรือไม่
    const today = new Date().toISOString().split('T')[0];
    let previousLastUpdate = null;
    let isNewDay = false;
    
    if (previousData && previousData.lastUpdate) {
      previousLastUpdate = new Date(previousData.lastUpdate).toISOString().split('T')[0];
      console.log(`Previous update date: ${previousLastUpdate}, Current date: ${today}`);
      
      // ถ้าเป็นวันใหม่ ให้รีเซ็ตค่า checkInsToday
      if (previousLastUpdate !== today) {
        isNewDay = true;
        console.log(`New day detected! (${previousLastUpdate} -> ${today})`);
        console.log(`Resetting daily check-ins counter and preparing for new day.`);
        
        // ตรวจสอบไฟล์ข้อมูลวันนี้
        const todayStatsPath = `${CONFIG.DAILY_STATS_DIR}/${today}.json`;
        
        // หากพิมพ์ไฟล์วันนี้ว่างหรือไม่มี ให้สร้างใหม่
        if (!fs.existsSync(todayStatsPath)) {
          console.log(`Creating new daily stats file for ${today}`);
          ensureDirectoryExists(path.dirname(todayStatsPath));
          safeWriteJSONFile(todayStatsPath, { count: 0, users: {} });
        }
      }
    }
    
    // อัพเดทข้อมูล check-in stats
    const checkInStats = updateCheckInStats(result, previousData);
  
    // ตรวจสอบค่า totalCheckIns เพื่อความแน่ใจว่าถูกต้อง
    console.log(`Verifying totalCheckIns (${checkInStats.totalCheckIns}) vs checkInsToday (${checkInStats.checkInsToday})`);
    
    // ใช้ค่าจริงจาก checkInStats ไม่ต้องแทนที่ด้วยค่าของวันนี้
    const finalTotalCheckIns = checkInStats.totalCheckIns;
    console.log(`Final totalCheckIns: ${finalTotalCheckIns} (accumulated from all days)`);
    
    // แสดงสรุปถ้าเป็นวันใหม่
    if (isNewDay) {
      console.log(`--- Day Summary (${today}) ---`);
      console.log(`Total users with clicks: ${result.length}`);
      console.log(`New check-ins today: ${checkInStats.checkInsToday}`);
      console.log(`All-time total check-ins: ${finalTotalCheckIns}`);
      console.log(`----------------------------`);
    }
    
    // เพิ่ม timestamp และ metadata
    const leaderboardData = {
      lastUpdate: new Date().toISOString(),
      data: result,
      stats: {
        totalUsers: result.length,
        checkIns: checkInStats
      },
      totalCheckIns: finalTotalCheckIns
    };
  
    console.log(`Saving leaderboard with ${result.length} users and ${finalTotalCheckIns} total check-ins`);

    // Write the result as a JSON file to the public folder
    safeWriteJSONFile(leaderboardFilePath, leaderboardData);
    console.log("Leaderboard updated. Total =", result.length, "at", leaderboardData.lastUpdate);
    
    // รี-เขียนไฟล์ checkin_stats.json อีกรอบเพื่อให้แน่ใจว่าค่าถูกต้อง
    const checkinStatsPath = CONFIG.COMPAT_PATH;
    const checkinStatsData = readJSONFile(checkinStatsPath, null);
    
    if (checkinStatsData && checkinStatsData.stats) {
      // อัพเดทค่าที่ถูกต้อง
      checkinStatsData.stats.totalCheckIns = finalTotalCheckIns;
      console.log(`Re-writing checkin_stats.json with corrected totalCheckIns=${finalTotalCheckIns}`);
      
      // บันทึกไฟล์อีกครั้ง
      safeWriteJSONFile(checkinStatsPath, checkinStatsData);
    }
    
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
