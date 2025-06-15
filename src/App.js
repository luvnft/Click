import React, { useState, useEffect, useRef } from "react";
import { BrowserProvider, Contract } from "ethers";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./App.css";
import abi from "./ClickCounterABI.json";
import bgMusicFile from "./assets/sounds/dont-talk.mp3";
import clickSoundFile from "./assets/effects/click.mp3";
import { Analytics } from "@vercel/analytics/react";
import { FaXTwitter } from "react-icons/fa6";

const CONTRACT_ADDRESS = "0x0b9eD03FaA424eB56ea279462BCaAa5bA0d2eC45";
const TEA_CHAIN_ID_HEX = "0x27EA"; // Tea Sepolia (10218)

function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);

  const [totalClicks, setTotalClicks] = useState(0);
  const [myClicks, setMyClicks] = useState(0);

  const [leaderboard, setLeaderboard] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [userRank, setUserRank] = useState(null);
  const [totalSystemCheckIns, setTotalSystemCheckIns] = useState(0);
  const [showFullStats, setShowFullStats] = useState(false);

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  const bgMusicRef = useRef(null);
  const clickAudioRef = useRef(null);

  const [pendingTransactions, setPendingTransactions] = useState(new Set());

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const [myTodayClicks, setMyTodayClicks] = useState(0);

  // ใช้เพื่อป้องกันการโหลด Leaderboard ซ้ำ
  const [didLoadLB, setDidLoadLB] = useState(false);

  // เก็บเวลาล่าสุดที่ leaderboard อัพเดท
  const [lastLeaderboardUpdate, setLastLeaderboardUpdate] = useState(null);

  // เก็บสถานะ Gm ประจำวัน
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [totalCheckIns, setTotalCheckIns] = useState(0);
  const [checkInStreak, setCheckInStreak] = useState(0);

  // เพิ่ม state สำหรับควบคุมหน้าต่าง Gm
  const [showCheckInModal, setShowCheckInModal] = useState(false);

  // เพิ่ม state สำหรับตรวจสอบว่าแอปโหลดเสร็จหรือยัง
  const [appLoaded, setAppLoaded] = useState(false);

  // เพิ่มตัวแปร state เก็บสถานะเครือข่าย
  const [isOnCorrectNetwork, setIsOnCorrectNetwork] = useState(false);

  // เพิ่มฟังก์ชัน delay สำหรับรอระหว่าง transaction
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  // เพิ่ม state เก็บเวลา transaction ล่าสุด
  const [lastTxTime, setLastTxTime] = useState(0);

  // เพิ่ม state สำหรับจัดการหน้าต่างเลือก wallet
  const [showWalletModal, setShowWalletModal] = useState(false);

  // ───────────────────────────────────────────────────────────────────
  // โค้ดสำหรับการเลือก wallet
  // ───────────────────────────────────────────────────────────────────
  const detectWallets = () => {
    const wallets = [];
    
    if (window.ethereum) {
      // MetaMask
      if (window.ethereum.isMetaMask) 
        wallets.push({ name: "MetaMask", provider: window.ethereum, icon: "🦊" });
      
      // Coinbase
      if (window.ethereum.isCoinbaseWallet) 
        wallets.push({ name: "Coinbase", provider: window.ethereum, icon: "📱" });
      
      // Trust Wallet
      if (window.ethereum.isTrust) 
        wallets.push({ name: "Trust", provider: window.ethereum, icon: "🔒" });
      
      // Brave
      if (window.ethereum.isBraveWallet) 
        wallets.push({ name: "Brave", provider: window.ethereum, icon: "🦁" });
      
      // มี wallet แต่ไม่สามารถระบุชนิดได้
      if (wallets.length === 0) {
        wallets.push({ name: "Browser Wallet", provider: window.ethereum, icon: "🌐" });
      }
    }
    
    return wallets;
  };

  // ฟังก์ชันเปิดหน้าต่างเลือก wallet
  const openWalletSelector = () => {
    // ถ้ากำลังเชื่อมต่ออยู่แล้ว ให้ออกจากฟังก์ชัน
    if (isConnected || isConnecting) return;
    
    const availableWallets = detectWallets();
    
    if (availableWallets.length === 0) {
      toast.error("ไม่พบ wallet ในเบราว์เซอร์ กรุณาติดตั้ง MetaMask หรือ wallet อื่นก่อน");
      return;
    }
    
    if (availableWallets.length === 1) {
      // ถ้ามีเพียง wallet เดียว เชื่อมต่อโดยตรง
      connectWallet();
      return;
    }
    
    // แสดงหน้าต่างเลือก wallet
    setShowWalletModal(true);
  };

  // ฟังก์ชันเมื่อเลือก wallet
  const handleSelectWallet = (provider) => {
    window.ethereum = provider;
    setShowWalletModal(false);
    connectWallet();
  };

  // Component สำหรับแสดงหน้าต่างเลือก wallet
  const WalletSelectorModal = () => {
    if (!showWalletModal) return null;
    
    const wallets = detectWallets();
    
    return (
      <div className="modal-overlay">
        <div className="modal-content wallet-modal">
          <div className="modal-header">
            <h2>เลือก Wallet</h2>
            <button className="close-button" onClick={() => setShowWalletModal(false)}>×</button>
          </div>
          <div className="modal-body">
            <div className="wallet-list">
              {wallets.map((wallet, index) => (
                <button
                  key={index}
                  className="wallet-button"
                  onClick={() => handleSelectWallet(wallet.provider)}
                >
                  <span className="wallet-icon">{wallet.icon}</span>
                  <span className="wallet-name">{wallet.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ───────────────────────────────────────────────────────────────────
  // ตั้งค่าเสียง BGM + Sound Effect
  // ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    bgMusicRef.current = new Audio(bgMusicFile);
    bgMusicRef.current.loop = true;
    bgMusicRef.current.muted = isMuted;

    clickAudioRef.current = new Audio(clickSoundFile);

    return () => {
      bgMusicRef.current?.pause();
      clickAudioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    if (!bgMusicRef.current) return;
    bgMusicRef.current.muted = isMuted;
    if (!isMuted) {
      bgMusicRef.current
        .play()
        .catch((err) => console.log("BGM autoplay blocked:", err));
    }
  }, [isMuted]);

  // ───────────────────────────────────────────────────────────────────
  // โหลดไฟล์ leaderboard.json จาก Off-chain
  // ───────────────────────────────────────────────────────────────────
  const loadOffChainLeaderboard = async () => {
    try {
      const res = await fetch("/leaderboard.json");
      if (!res.ok) throw new Error("Failed to fetch leaderboard.json");

      const jsonData = await res.json();

      // ตรวจสอบและดึงข้อมูลในรูปแบบใหม่
      let leaderboardData = [];
      let lastUpdateTimestamp = null;

      if (jsonData.data && jsonData.lastUpdate) {
        // รูปแบบใหม่ที่มี timestamp
        leaderboardData = jsonData.data;
        lastUpdateTimestamp = new Date(jsonData.lastUpdate);
      } else {
        // รูปแบบเก่า (ไม่มี timestamp ในไฟล์ จะไม่แสดง timestamp)
        leaderboardData = jsonData;
        lastUpdateTimestamp = null; // ไม่แสดง timestamp เมื่อไม่มีข้อมูล
      }

      leaderboardData.sort((a, b) => Number(b.clicks) - Number(a.clicks));

      setLeaderboard(leaderboardData);
      setTotalUsers(leaderboardData.length);
      setLastLeaderboardUpdate(lastUpdateTimestamp);

      if (signer) {
        try {
          const addr = await signer.getAddress();
          console.log("Current address:", addr);
          
          const userIndex = leaderboardData.findIndex(
            (x) => x.user.toLowerCase() === addr.toLowerCase()
          );
          
          console.log("User index in leaderboard:", userIndex);
          
          if (userIndex >= 0) {
            const rank = userIndex + 1;
            console.log("Setting user rank to:", rank);
            setUserRank(rank);
          } else {
            console.log("User not found in leaderboard, setting rank to null");
            setUserRank(null);
          }
        } catch (error) {
          console.error("Error finding user rank:", error);
          setUserRank(null);
        }
      } else {
        console.log("No signer available, can't determine user rank");
      }
      
      console.log("Off-chain leaderboard loaded!");
    } catch (err) {
      console.error(err);
      toast.error("Unable to load offline leaderboard.");
    }
  };

  // ───────────────────────────────────────────────────────────────────
  // เช็คว่าอยู่บนเครือข่าย Tea Sepolia หรือไม่
  // ───────────────────────────────────────────────────────────────────
  const setupNetwork = async (forceCheck = false) => {
    if (!window.ethereum) {
      toast.error("Please install MetaMask!");
      return false;
    }
    
    // ถ้าไม่บังคับตรวจสอบและรู้แล้วว่าอยู่บนเครือข่ายที่ถูกต้อง
    if (!forceCheck && isOnCorrectNetwork) {
      return true;
    }
    
    try {
      const currentChainId = await window.ethereum.request({
        method: "eth_chainId",
      });
      if (currentChainId !== TEA_CHAIN_ID_HEX) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: TEA_CHAIN_ID_HEX }],
          });
        } catch {
          toast.error("Please switch to Tea Sepolia manually");
          setIsOnCorrectNetwork(false);
          return false;
        }
      }
      setIsOnCorrectNetwork(true);
      return true;
    } catch {
      toast.error("Network setup failed");
      setIsOnCorrectNetwork(false);
      return false;
    }
  };

  // ───────────────────────────────────────────────────────────────────
  // โหลดข้อมูล on-chain เช่น totalClicks, userClicks
  // ───────────────────────────────────────────────────────────────────
  const loadBlockchainData = async () => {
    try {
      const prov = new BrowserProvider(window.ethereum);
      
      // เพิ่มการจัดการ timeout ที่นานขึ้น
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Connection timeout")), 15000)
      );
      
      try {
        // ทำงานพร้อมกับตั้ง timeout
        const sign = await Promise.race([
          prov.getSigner(),
          timeoutPromise
        ]);
        
        const cont = new Contract(CONTRACT_ADDRESS, abi, sign);
        
        setProvider(prov);
        setSigner(sign);
        setContract(cont);

        const addr = await sign.getAddress();
        
        // ใช้ Promise.race เพื่อจัดการกับการเรียก RPC ที่อาจใช้เวลานาน
        const [total, mine] = await Promise.all([
          Promise.race([cont.totalClicks(), timeoutPromise]),
          Promise.race([cont.userClicks(addr), timeoutPromise])
        ]);

        setTotalClicks(Number(total));
        setMyClicks(Number(mine));
        setIsConnected(true);
        return true;
      } catch (timeoutErr) {
        console.error("Connection timeout or RPC error:", timeoutErr);
        
        // จัดการกับข้อผิดพลาด RPC เพิ่มเติม
        if (timeoutErr.message && timeoutErr.message.includes("HTTP request failed")) {
          toast.error("Network connection error. Please try again later.");
        } else {
          toast.error("Connection timeout. Please try again later.");
        }
        
        return false;
      }
    } catch (err) {
      console.error("Unable to load data:", err);
      toast.error("Unable to load data. Please check your connection.");
      return false;
    }
  };

  // ───────────────────────────────────────────────────────────────────
  // ฟังก์ชันโหลดข้อมูล Gm ของผู้ใช้จาก localStorage
  // ───────────────────────────────────────────────────────────────────
  const loadUserGmData = async () => {
    try {
      // ดึง wallet address ปัจจุบัน
      const userAddress = await signer?.getAddress();
      
      if (!userAddress) {
        setCheckedInToday(false);
        setCheckInStreak(0);
        setTotalCheckIns(0);
        return;
      }

      // ตรวจสอบว่าเข้าเช็คอินวันนี้แล้วหรือยัง (ใช้ address ในการเก็บ)
      const checkedInToday = localStorage.getItem(`checkedInToday_${userAddress}`);
      const lastCheckInDate = localStorage.getItem(`lastCheckInDate_${userAddress}`);
      
      // โหลดข้อมูล streak และ total
      const streak = parseInt(localStorage.getItem(`checkInStreak_${userAddress}`)) || 0;
      const total = parseInt(localStorage.getItem(`totalCheckIns_${userAddress}`)) || 0;
      
      console.log(`Checking GM data for user ${userAddress}: streak=${streak}, total=${total}`);
      
      try {
        // ดึงข้อมูลจากไฟล์ผู้ใช้โดยตรง
        const cacheKey = `_t=${Date.now()}`;
        
        // ใช้ 2 ตัวอักษรแรกของแอดเดรสเป็นโฟลเดอร์ย่อย
        const userPrefix = userAddress.substring(2, 4).toLowerCase();
        const userStatsUrl = `/stats/users/${userPrefix}/${userAddress.toLowerCase()}.json?${cacheKey}`;
        
        console.log(`Trying to load user stats from: ${userStatsUrl}`);
        
        const userResponse = await fetch(userStatsUrl, {
          cache: "no-store"
        });
        
        if (userResponse.ok) {
          // ถ้าโหลดข้อมูลผู้ใช้สำเร็จ
          const userData = await userResponse.json();
          console.log("Loaded user stats:", userData);
          
          // อัพเดทค่า totalCheckIns จากไฟล์ของผู้ใช้
          if (userData.totalCheckIns) {
            console.log(`Found user's totalCheckIns in user file: ${userData.totalCheckIns}`);
            localStorage.setItem(`totalCheckIns_${userAddress}`, userData.totalCheckIns.toString());
            setTotalCheckIns(userData.totalCheckIns);
          } else {
            console.log("No totalCheckIns found in user file, using localStorage");
            setTotalCheckIns(total);
          }
          
          // อัพเดทค่า streak จากไฟล์ของผู้ใช้
          if (userData.currentStreak) {
            console.log(`Found user's currentStreak in user file: ${userData.currentStreak}`);
            localStorage.setItem(`checkInStreak_${userAddress}`, userData.currentStreak.toString());
            setCheckInStreak(userData.currentStreak);
          } else if (userData.maxStreak) {
            console.log(`Found user's maxStreak in user file: ${userData.maxStreak}`);
            localStorage.setItem(`checkInStreak_${userAddress}`, userData.maxStreak.toString());
            setCheckInStreak(userData.maxStreak);
          } else {
            console.log("No streak info found in user file, using localStorage");
            setCheckInStreak(streak);
          }
          
          // ตรวจสอบว่าวันนี้ได้เช็คอินแล้วหรือยัง
          const serverDate = new Date(userData.lastCheckIn);
          const todayDate = new Date();
          
          // เช็คว่าเป็นวันเดียวกันหรือไม่
          const isSameDay = 
            serverDate.getFullYear() === todayDate.getFullYear() &&
            serverDate.getMonth() === todayDate.getMonth() &&
            serverDate.getDate() === todayDate.getDate();
          
          if (isSameDay) {
            console.log("User has checked in today according to user file");
            localStorage.setItem(`checkedInToday_${userAddress}`, "true");
            setCheckedInToday(true);
            return true;
          } else {
            console.log("User has not checked in today according to user file");
            setCheckedInToday(checkedInToday === "true");
          }
          
          return checkedInToday === "true";
        } else {
          console.log("Failed to load user stats file, using localStorage values only");
          // ไม่สามารถโหลดข้อมูลผู้ใช้ได้ ใช้ค่าจาก localStorage
          setCheckedInToday(checkedInToday === "true");
          setCheckInStreak(streak);
          setTotalCheckIns(total);
          
          return checkedInToday === "true";
        }
      } catch (error) {
        console.error("Error loading user stats:", error);
        // กรณีเกิดข้อผิดพลาดในการโหลดไฟล์ผู้ใช้ ใช้ค่าจาก localStorage
        setCheckedInToday(checkedInToday === "true");
        setCheckInStreak(streak);
        setTotalCheckIns(total);
        
        return checkedInToday === "true";
      }
    } catch (error) {
      console.error("Error loading GM data:", error);
      return false;
    }
  };

  // ───────────────────────────────────────────────────────────────────
  // Connect Wallet
  // ───────────────────────────────────────────────────────────────────
  const connectWallet = async () => {
    // ป้องกันการเรียกใช้ซ้ำ
    if (isConnected || isConnecting) {
      console.log("Already connected or connecting, skipping connection");
      return true;
    }

    // ลบ toast เก่าก่อนแสดงใหม่
    toast.dismiss();

    // ตั้งค่า flag เพื่อป้องกันการเรียกซ้ำ
    setIsConnecting(true);

    try {
      if (bgMusicRef.current) {
        bgMusicRef.current.muted = false;
        setIsMuted(false);
        try {
          await bgMusicRef.current.play();
        } catch {}
      }

      await window.ethereum.request({ method: "eth_requestAccounts" });
      if (!(await setupNetwork())) {
        setIsConnecting(false);
        return false;
      }
      if (!(await loadBlockchainData())) {
        setIsConnecting(false);
        return false;
      }

      // ถ้ายังไม่ได้โหลด Leaderboard -> โหลดครั้งเดียว
      if (!didLoadLB) {
        await loadOffChainLeaderboard();
        setDidLoadLB(true);
      } else {
        console.log("Leaderboard already loaded, checking rank directly");
        // ถ้าโหลดแล้ว เรียกเฉพาะส่วนหาอันดับของผู้ใช้
        if (signer && leaderboard.length > 0) {
          try {
            const addr = await signer.getAddress();
            console.log("Finding rank for address in connectWallet:", addr);
            
            const userIndex = leaderboard.findIndex(
              entry => entry.user.toLowerCase() === addr.toLowerCase()
            );
            
            console.log("User index in connectWallet:", userIndex);
            
            if (userIndex >= 0) {
              const rank = userIndex + 1;
              console.log("Setting user rank in connectWallet to:", rank);
              setUserRank(rank);
            } else {
              console.log("User not found in existing leaderboard in connectWallet");
              // Instead of setting to null, check if we have clicks and create a temporary entry
              if (myClicks > 0) {
                console.log("User has clicks, adding to temporary leaderboard");
                const tempLeaderboard = [...leaderboard, { user: addr, clicks: myClicks }];
                tempLeaderboard.sort((a, b) => Number(b.clicks) - Number(a.clicks));
                const newIndex = tempLeaderboard.findIndex(
                  entry => entry.user.toLowerCase() === addr.toLowerCase()
                );
                setLeaderboard(tempLeaderboard);
                setUserRank(newIndex + 1);
              } else {
                // Only set to null if we have no clicks
                setUserRank(null);
              }
            }
          } catch (error) {
            console.error("Error finding user rank in connectWallet:", error);
          }
        }
      }

      // โหลดข้อมูล Gm ของผู้ใช้
      await loadUserGmData();

      toast.success("Connected successfully! 🎉");
      return true;
    } catch (err) {
      if (err.code === 4001) toast.error("Connection rejected by user");
      else toast.error("Connection failed");
      return false;
    } finally {
      // ตั้งค่า flag กลับเป็น false เมื่อเสร็จสิ้น
      setIsConnecting(false);
    }
  };

  // ───────────────────────────────────────────────────────────────────
  // เมื่อผู้ใช้กดปุ่ม CLICK
  // ───────────────────────────────────────────────────────────────────
  const handleClick = async () => {
    try {
      // ถ้ายังไม่ได้เชื่อมต่อกระเป๋า ให้เชื่อมต่อก่อน
      if (!isConnected) {
        await connectWallet();
        return;
      }

      // ตรวจสอบว่ามี contract และ signer
      if (!contract || !signer) {
        toast.error("Please connect your wallet first");
        return;
      }

      // ตรวจสอบว่าอยู่บนเครือข่ายที่ถูกต้อง
      if (!(await setupNetwork())) return;

      // เล่นเสียงเมื่อกดปุ่ม
      if (!isMuted) {
        clickAudioRef.current.currentTime = 0;
        clickAudioRef.current.play().catch(() => {});
      }
      
      // เพิ่ม delay ระหว่าง transaction เพื่อป้องกัน rate limit
      const now = Date.now();
      const timeSinceLastTx = now - lastTxTime;
      if (timeSinceLastTx < 300) { // ต้องห่างกัน 2 วินาทีขึ้นไป
        const waitTime = 300 - timeSinceLastTx;
        toast.info(`Please wait ${Math.ceil(waitTime/1000)} seconds before next click`);
        await delay(waitTime);
      }
      
      // บันทึกเวลาส่ง transaction ล่าสุด
      setLastTxTime(Date.now());

      // ส่ง transaction แบบไม่ระบุ gas price
      const tx = await contract.click();
      
      // เพิ่ม transaction ไปที่ pending และอัพเดต UI ทันที (optimistic)
      setPendingTransactions((prev) => new Set(prev).add(tx.hash));
      setMyClicks(prev => prev + 1);
      setTotalClicks(prev => prev + 1);
      
      // เพิ่มจำนวนคลิกวันนี้ทันที
      const userAddress = await signer.getAddress();
      setMyTodayClicks((prev) => {
        const next = prev + 1;
        localStorage.setItem(`myTodayClicks_${userAddress}`, next.toString());
        return next;
      });

      // แสดงข้อความส่ง transaction พร้อมลิงก์
      toast.info(
        <div>
          Transaction sent! 
          <br />
          <a
            href={`https://sepolia.tea.xyz/tx/${tx.hash}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#4fd1c5" }}
          >
            View on Explorer
          </a>
        </div>
      );

      // ลบออกจาก pending หลังจาก 30 วินาที (แทนการรอ confirmation)
      setTimeout(() => {
        setPendingTransactions(prev => {
          const next = new Set(prev);
          next.delete(tx.hash);
          return next;
        });
      }, 30000);
      
    } catch (err) {
      console.error("Click error:", err);
      
      if (err.error && err.error.status === 429) {
        toast.warning("Too many requests. Please wait a moment before clicking again.");
        await delay(3000);
      } else if (err.code === "INSUFFICIENT_FUNDS") {
        toast.error("Not enough TEA for gas");
      } else if (err.code === "ACTION_REJECTED") {
        toast.error("Transaction rejected by user");
      } else {
        toast.error("An unexpected error occurred");
      }
    }
  };

  // ───────────────────────────────────────────────────────────────────
  // useEffect เริ่มต้น: Auto-Connect / หรือ Load Offchain LB ถ้าไม่มี wallet
  // ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadTodayClicksFromLocal();
    loadGmSummaryData(); // โหลดข้อมูล Gm จาก summary.json

    // กำหนดให้แอปโหลดเสร็จแล้ว
    setAppLoaded(true);

    if (!window.ethereum) {
      // ไม่มี MetaMask -> โหลด leaderboard แบบ off-chain ครั้งแรก
      loadOffChainLeaderboard();
      setDidLoadLB(true);
      return;
    }

    window.ethereum.request({ method: "eth_accounts" }).then((accs) => {
      if (accs.length > 0 && !isConnecting) {
        // มี accounts -> เรียกใช้ connectWallet แบบเงียบ (ไม่แสดง toast)
        setIsConnecting(true);

        // ป้องกันการแสดงหน้าต่าง Gm ก่อนการตรวจสอบ
        setShowCheckInModal(false);

        (async () => {
          try {
            if (bgMusicRef.current) {
              bgMusicRef.current.muted = false;
              setIsMuted(false);
              try {
                await bgMusicRef.current.play();
              } catch {}
            }

            await window.ethereum.request({ method: "eth_requestAccounts" });
            if (!(await setupNetwork())) return;
            if (!(await loadBlockchainData())) return;

            // ถ้ายังไม่ได้โหลด Leaderboard -> โหลดครั้งเดียว
            if (!didLoadLB) {
              await loadOffChainLeaderboard();
              setDidLoadLB(true);
            }

            // โหลดข้อมูล Gm ของผู้ใช้ แต่ไม่แสดงหน้าต่าง Gm ทันที
            await loadUserGmData();

            // สำคัญ: ไม่ตั้งค่า showCheckInModal = true ที่นี่ แต่ให้ useEffect ที่มี dependency เป็น isConnected, signer, isConnecting จัดการ

            // ไม่ต้องแสดง toast เมื่อเชื่อมต่ออัตโนมัติ
            console.log("Connected automatically");
          } finally {
            setIsConnecting(false);
          }
        })();
      } else {
        // ไม่มี account -> โหลด leaderboard off-chain
        loadOffChainLeaderboard();
        setDidLoadLB(true);
      }
    });

    const handleChainChange = (chainId) => {
      if (chainId !== TEA_CHAIN_ID_HEX) {
        setIsConnected(false);
        setIsOnCorrectNetwork(false);
        toast.error("Please switch to Tea Sepolia");
      } else {
        setIsOnCorrectNetwork(true);
        loadBlockchainData();
      }
    };

    const handleAccountsChange = async (accounts) => {
      if (accounts.length === 0) {
        setIsConnected(false);
      } else {
        await loadBlockchainData();
        // ไม่โหลด leaderboard off-chain ซ้ำ
      }
    };

    window.ethereum.on("chainChanged", handleChainChange);
    window.ethereum.on("accountsChanged", handleAccountsChange);

    return () => {
      window.ethereum.removeListener("chainChanged", handleChainChange);
      window.ethereum.removeListener("accountsChanged", handleAccountsChange);
    };
  }, []);

  // ───────────────────────────────────────────────────────────────────
  // useEffect เพื่อรีเซ็ต Gm state เมื่อเปลี่ยน wallet
  // ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (signer) {
      // เมื่อ signer เปลี่ยน (เปลี่ยน wallet) ให้โหลดข้อมูล Gm ใหม่
      loadUserGmData();
      loadTodayClicksFromLocal();
    } else {
      // ถ้าไม่มี signer ให้รีเซ็ตค่า
      setCheckedInToday(false);
      setCheckInStreak(0);
      setTotalCheckIns(0);
      setMyTodayClicks(0);
    }
  }, [signer]); // dependency เป็น signer เพื่อติดตามการเปลี่ยนแปลง wallet

  // ───────────────────────────────────────────────────────────────────
  // ฟังก์ชันโหลดหรือเซ็ตค่าคลิกวันนี้
  // ───────────────────────────────────────────────────────────────────
  const loadTodayClicksFromLocal = async () => {
    try {
      const today = new Date().toDateString();
      
      if (signer) {
        const userAddress = await signer.getAddress();
        const storedDate = localStorage.getItem(`clickDate_${userAddress}`);
        const storedValue = localStorage.getItem(`myTodayClicks_${userAddress}`);

        if (storedDate === today && storedValue) {
          setMyTodayClicks(Number(storedValue));
        } else {
          localStorage.setItem(`clickDate_${userAddress}`, today);
          localStorage.setItem(`myTodayClicks_${userAddress}`, "0");
          setMyTodayClicks(0);
        }
      } else {
        // กรณีไม่มี signer ให้ใช้ค่าเริ่มต้น
        setMyTodayClicks(0);
      }
    } catch (err) {
      console.error("Error loading today's clicks:", err);
      setMyTodayClicks(0);
    }
  };

  // ฟังก์ชันโหลดข้อมูล Gm จาก summary.json
  // ───────────────────────────────────────────────────────────────────
  const loadGmSummaryData = async () => {
    try {
      // ใช้ cache breaker เพื่อไม่ให้ browser cache ข้อมูลเก่า
      const cacheKey = `_t=${Date.now()}`;
      const response = await fetch(`/stats/summary.json?${cacheKey}`, {
        cache: "no-store",
      });

      if (response.ok) {
        const summaryData = await response.json();
        console.log("Loaded Gm summary data:", summaryData);

        // อัพเดทข้อมูลทั้งหมดจากเซิร์ฟเวอร์
        if (summaryData.totalCheckIns) {
          setTotalSystemCheckIns(summaryData.totalCheckIns);
        }
        
        // อัพเดทค่า checkInsToday จากเซิร์ฟเวอร์
        if (summaryData.checkInsToday >= 0) {
          console.log(`Setting checkInsToday from server: ${summaryData.checkInsToday}`);
        }
        
        // นำข้อมูลจากเซิร์ฟเวอร์มาอัพเดทค่า totalCheckIns ของผู้ใช้ด้วย
        // หาก streak มีค่าที่ไม่สอดคล้องกับข้อมูลอื่น
        const userAddress = await signer?.getAddress();
        if (userAddress) {
          // ดึงค่าจาก localStorage ก่อน
          const localTotal = parseInt(localStorage.getItem(`totalCheckIns_${userAddress}`)) || 0;
          
          // ตรวจสอบว่าค่า totalCheckIns ในระบบมากกว่าหรือเท่ากับ checkInsToday หรือไม่
          if (summaryData.totalCheckIns < summaryData.checkInsToday) {
            console.log(`Warning: Server totalCheckIns (${summaryData.totalCheckIns}) is less than checkInsToday (${summaryData.checkInsToday})`);
          }
          
          // หากค่าใน localStorage น้อยกว่าจากเซิร์ฟเวอร์ ให้อัพเดท
          if (localTotal < summaryData.totalCheckIns) {
            console.log(`Updating user totalCheckIns from ${localTotal} to ${summaryData.totalCheckIns}`);
            localStorage.setItem(`totalCheckIns_${userAddress}`, summaryData.totalCheckIns.toString());
            setTotalCheckIns(summaryData.totalCheckIns);
          }
        }
        
        // อัพเดทค่า streaks จากเซิร์ฟเวอร์ถ้ามี
        if (summaryData.maxStreak && userAddress) {
          const localStreak = parseInt(localStorage.getItem(`checkInStreak_${userAddress}`)) || 0;
          // ถ้าค่า streak จากเซิร์ฟเวอร์มีความน่าเชื่อถือ ให้ใช้ค่านั้น
          console.log(`Streak info: local=${localStreak}, server max=${summaryData.maxStreak}`);
        }
      } else {
        console.log("Failed to load Gm summary data:", response.status);
      }
      
      // หากยังไม่สามารถโหลดข้อมูลจาก summary.json ได้ ลองโหลดจาก checkin_stats.json แทน
      try {
        const compatResponse = await fetch(`/checkin_stats.json?${cacheKey}`, {
          cache: "no-store",
        });
        
        if (compatResponse.ok) {
          const compatData = await compatResponse.json();
          console.log("Loaded compat checkin_stats.json data:", compatData);
          
          // อัพเดทข้อมูลจาก checkin_stats.json
          if (compatData.stats) {
            const { totalCheckIns, checkInsToday } = compatData.stats;
            
            // อัพเดทค่า totalSystemCheckIns
            if (totalCheckIns) {
              setTotalSystemCheckIns(totalCheckIns);
              console.log(`Updated totalSystemCheckIns from compat file: ${totalCheckIns}`);
            }
            
            // หากมีค่า checkInsToday ก็อัพเดทค่านี้ด้วย
            if (checkInsToday >= 0) {
              console.log(`Setting checkInsToday from compat file: ${checkInsToday}`);
            }
            
            // อัพเดทค่า totalCheckIns ของผู้ใช้ถ้าจำเป็น
            const userAddress = await signer?.getAddress();
            if (userAddress && totalCheckIns) {
              const localTotal = parseInt(localStorage.getItem(`totalCheckIns_${userAddress}`)) || 0;
              if (localTotal < totalCheckIns) {
                console.log(`Updating user totalCheckIns from ${localTotal} to ${totalCheckIns} (compat)`);
                localStorage.setItem(`totalCheckIns_${userAddress}`, totalCheckIns.toString());
                setTotalCheckIns(totalCheckIns);
              }
            }
          }
        }
      } catch (compatError) {
        console.error("Error loading compat checkin_stats.json:", compatError);
      }
    } catch (error) {
      console.error("Error loading Gm summary data:", error);
    }
  };

  /** บันทึกการ GM วันนี้ */
  const gmToday = async () => {
    try {
      if (!signer) {
        console.error("ไม่พบ wallet ที่เชื่อมต่อ");
        return;
      }

      const userAddress = await signer.getAddress();
      const today = new Date().toDateString();
      const todayISO = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

      // อัปเดต localStorage สำหรับ wallet นี้
      localStorage.setItem(`checkedInToday_${userAddress}`, "true");
      localStorage.setItem(`lastCheckInDate_${userAddress}`, today);
      
      // คำนวณ streak
      let newStreak = checkInStreak;
      const lastDate = localStorage.getItem(`lastCheckInDate_${userAddress}`);
      
      // ถ้ายังไม่ได้ GM วันนี้ ให้เพิ่ม streak
      if (lastDate !== today) {
        newStreak += 1;
      }
      
      // อัปเดต streak
      localStorage.setItem(`checkInStreak_${userAddress}`, newStreak.toString());
      setCheckInStreak(newStreak);
      
      // อัปเดตจำนวน GM ทั้งหมด
      // ต้องตรวจสอบว่า totalCheckIns ที่มีอยู่ถูกต้องหรือไม่
      let newTotal = totalCheckIns;
      
      // ถ้า totalCheckIns เป็น 0 หรือ undefined แต่เพิ่งกด GM
      // แสดงว่าน่าจะเป็นการ GM ครั้งแรก ให้ตั้งค่าเป็น 1
      if (!newTotal || newTotal <= 0) {
        newTotal = 1;
        console.log(`Setting initial totalCheckIns to 1`);
      } else {
        // มีการกด GM ซ้ำ หรือกด GM ในวันที่ต่างกัน
        if (lastDate !== today) {
          // ถ้าเป็นวันที่ต่างกัน เพิ่ม 1
          newTotal += 1;
          console.log(`Incrementing totalCheckIns to ${newTotal}`);
        } else {
          // ถ้าเป็นวันเดียวกัน ไม่เพิ่ม (ป้องกันกรณีกด GM ซ้ำในวันเดียวกัน)
          console.log(`Not incrementing totalCheckIns, already clicked today`);
        }
      }
      
      localStorage.setItem(`totalCheckIns_${userAddress}`, newTotal.toString());
      setTotalCheckIns(newTotal);
      
      // อัปเดตสถานะว่าได้ GM วันนี้แล้ว
      setCheckedInToday(true);
      
      // เพิ่มจำนวนคลิกวันนี้
      setMyTodayClicks((prev) => prev + 1);
      
      console.log(`บันทึกการ GM สำเร็จ: streak=${newStreak}, total=${newTotal}`);
    } catch (error) {
      console.error("เกิดข้อผิดพลาดในการบันทึก GM:", error);
    }
  };

  // ───────────────────────────────────────────────────────────────────
  // แสดงจำนวน transaction ที่ pending
  // ───────────────────────────────────────────────────────────────────
  const renderPendingTxs = () => {
    const count = pendingTransactions.size;
    return count ? (
      <div className="pending-tx-indicator" key={count}>
        {count} pending {count === 1 ? "transaction" : "transactions"}...
      </div>
    ) : null;
  };

  // ───────────────────────────────────────────────────────────────────
  // Pagination
  // ───────────────────────────────────────────────────────────────────
  const totalPages = Math.ceil(leaderboard.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentItems = leaderboard.slice(startIndex, startIndex + itemsPerPage);

  const nextPage = () =>
    currentPage < totalPages && setCurrentPage((p) => p + 1);
  const prevPage = () => currentPage > 1 && setCurrentPage((p) => p - 1);

  // ───────────────────────────────────────────────────────────────────
  // ฟังก์ชันเพิ่ม Tea Sepolia Network
  // ───────────────────────────────────────────────────────────────────
  const addTeaSepoliaNetwork = async () => {
    try {
      if (!window.ethereum) {
        toast.error("Please install MetaMask!");
        return;
      }
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: "0x27ea",
            chainName: "Tea Sepolia",
            nativeCurrency: { name: "TEA", symbol: "TEA", decimals: 18 },
            rpcUrls: ["https://tea-sepolia.g.alchemy.com/public"],
            blockExplorerUrls: ["https://sepolia.tea.xyz"],
          },
        ],
      });
      toast.success("Tea Sepolia added!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to add Tea Sepolia");
    }
  };

  // ───────────────────────────────────────────────────────────────────
  // ฟังก์ชันสำหรับตรวจสอบและแสดงหน้าต่าง Gm เมื่อเข้าใช้งาน
  // ───────────────────────────────────────────────────────────────────
  const checkAndShowCheckInPrompt = async () => {
    // ตั้งค่าให้ปิดหน้าต่างก่อน
    setShowCheckInModal(false);

    // ตรวจสอบเงื่อนไขพื้นฐาน
    if (!isConnected || !signer) return;

    try {
      // โหลดข้อมูล Gm ของผู้ใช้
      const hasCheckedIn = await loadUserGmData();

      // แสดงหน้าต่างเฉพาะเมื่อยังไม่ได้ Gm
      if (!hasCheckedIn && !checkedInToday) {
        setShowCheckInModal(true);
      }
    } catch (err) {
      console.error("Error in checkAndShowCheckInPrompt:", err);
    }
  };

  // เรียกตรวจสอบ Gm เมื่อเชื่อมต่อกระเป๋าสำเร็จ
  useEffect(() => {
    // ตั้งค่าเริ่มต้นให้ปิดหน้าต่าง Gm ไว้ก่อนเสมอ
    setShowCheckInModal(false);

    // ถ้ายังไม่ได้เชื่อมต่อ หรือกำลังเชื่อมต่อ ให้ออกจากฟังก์ชัน
    if (!isConnected || !signer || isConnecting) return;

    console.log("กำลังเตรียมตรวจสอบสถานะ Gm...");

    // สร้างตัวแปรเพื่อป้องกันการตั้งค่า state หลังจาก component unmount
    let isMounted = true;

    // รอสักครู่ให้นานพอที่จะโหลดข้อมูลเสร็จ (5 วินาทีเพื่อความแน่ใจ)
    const timer = setTimeout(async () => {
      console.log("เริ่มตรวจสอบสถานะ Gm...");

      try {
        // โหลดข้อมูล Gm โดยตรง
        const hasCheckedIn = await loadUserGmData();
        console.log(
          "ผลการตรวจสอบ hasCheckedIn:",
          hasCheckedIn,
          "checkedInToday:",
          checkedInToday,
        );

        // ตรวจสอบว่า component ยังคงอยู่ก่อนอัพเดต state
        if (!isMounted) return;

        // แสดงหน้าต่างเฉพาะเมื่อยังไม่ได้ Gm และไม่มี error
        if (!hasCheckedIn && !checkedInToday) {
          console.log("ยังไม่ได้ Gm วันนี้ จะแสดงหน้าต่าง Gm");
          setShowCheckInModal(true);
        } else {
          console.log("ได้ Gm วันนี้แล้ว หรือข้อมูลไม่ถูกต้อง ไม่แสดงหน้าต่าง");
          setShowCheckInModal(false);
        }
      } catch (err) {
        // ตรวจสอบว่า component ยังคงอยู่ก่อนอัพเดต state
        if (!isMounted) return;

        console.error("เกิดข้อผิดพลาดในการตรวจสอบ Gm:", err);
        // กรณีเกิด error ไม่แสดงหน้าต่าง
        setShowCheckInModal(false);
      }
    }, 2000); // รอ 2 วินาที

    // ทำความสะอาดเมื่อ component unmount หรือ dependencies เปลี่ยน
    return () => {
      console.log("ยกเลิกการตรวจสอบ Gm");
      clearTimeout(timer);
      isMounted = false;
    };
  }, [isConnected, signer, isConnecting]);

  // ตรวจสอบเมื่อ checkedInToday เปลี่ยนค่า
  useEffect(() => {
    // ถ้าได้ Gm แล้ว ให้ปิดหน้าต่าง
    if (checkedInToday) {
      setShowCheckInModal(false);
    }
  }, [checkedInToday]);

  // Add this debug effect to log whenever userRank changes
  useEffect(() => {
    console.log("Current userRank state:", userRank);
  }, [userRank]);

  // Function to navigate to the page containing the user's rank
  const goToUserRankPage = () => {
    if (userRank) {
      const page = Math.ceil(userRank / itemsPerPage);
      setCurrentPage(page);
    }
  };

  // Function to find user's rank in the leaderboard
  const findUserRankInLeaderboard = () => {
    try {
      if (!signer || !leaderboard.length) return null;
      
      const userAddress = signer.address;
      if (!userAddress) return null;
      
      const index = leaderboard.findIndex(
        entry => entry.user.toLowerCase() === userAddress.toLowerCase()
      );
      
      if (index >= 0) {
        return index + 1; // Return the actual rank
      }
      
      return null;
    } catch (error) {
      console.error("Error finding rank in leaderboard:", error);
      return null;
    }
  };

  // Create a separate component for user rank to handle display logic correctly
  const renderUserRank = () => {
    // Find the user's actual rank in the current leaderboard
    let displayRank = userRank;
    
    if (isConnected && signer) {
      try {
        // If we have a wallet connected but no rank, try to find it directly in the leaderboard
        if (!displayRank && leaderboard.length > 0) {
          const userAddress = signer.address;
          if (userAddress) {
            const index = leaderboard.findIndex(
              entry => entry.user.toLowerCase() === userAddress.toLowerCase()
            );
            if (index >= 0) {
              displayRank = index + 1;
              // If we found the rank here, update the state for future renders
              if (displayRank !== userRank) {
                console.log(`Setting rank from renderUserRank: ${displayRank}`);
                setUserRank(displayRank);
              }
            }
          }
        }
        
        // Apply highlighting to leaderboard if the user's rank is visible
        if (displayRank) {
          // Find which page the user is on
          const userPage = Math.ceil(displayRank / itemsPerPage);
          
          // If user is not on the current page, show a message
          if (userPage !== currentPage && displayRank) {
            console.log(`User is on page ${userPage}, current page is ${currentPage}`);
          }
        }
      } catch (error) {
        console.error("Error in renderUserRank:", error);
      }
    }
    
    return (
      <div className="user-rank-footer">
        <div className="user-rank-card">
          <div className="user-rank-title">Your Rank</div>
          <div className="user-rank-position">
            {displayRank ? `#${displayRank}` : "#--"}
          </div>
          <div className="user-rank-clicks">{myClicks.toLocaleString()} clicks</div>
          {displayRank && Math.ceil(displayRank / itemsPerPage) !== currentPage && (
            <button 
              className="go-to-rank-btn"
              onClick={goToUserRankPage}
            >
              Go to my rank
            </button>
          )}
        </div>
      </div>
    );
  };

  // ───────────────────────────────────────────────────────────────────
  // เพิ่ม component สำหรับหน้าต่าง Gm
  // ───────────────────────────────────────────────────────────────────
  const renderCheckInModal = () => {
    if (!showCheckInModal) return null;

    return (
      <div className="modal-overlay">
        <div className="modal-content checkin-modal">
          <div className="modal-header">
            <h2>Daily Gm</h2>
            <button
              className="close-button"
              onClick={() => setShowCheckInModal(false)}
            >
              ×
            </button>
          </div>
          <div className="modal-body">
            <div className="checkin-icon">✓</div>
            <p>Welcome back! Say Gm today to continue your streak!</p>
            <p className="streak-count">Current streak: {checkInStreak} days</p>
          </div>
          <div className="modal-footer">
            <button className="checkin-button" onClick={handleCheckInClick}>
              Click to Gm
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ฟังก์ชันเมื่อกดปุ่ม Gm ในหน้าต่าง
  const handleCheckInClick = async () => {
    try {
      // ปิดหน้าต่าง Gm ทันที
      setShowCheckInModal(false);

      // ถ้ายังไม่ได้เชื่อมต่อกระเป๋า หรือไม่มี contract หรือ signer
      if (!isConnected || !contract || !signer) {
        toast.error("Please connect your wallet first");
        return;
      }

      // ตรวจสอบว่าอยู่บนเครือข่ายที่ถูกต้อง
      if (!(await setupNetwork())) return;

      // เล่นเสียงเมื่อกดปุ่ม
      if (!isMuted) {
        clickAudioRef.current.currentTime = 0;
        clickAudioRef.current.play().catch(() => {});
      }

      // ส่ง transaction ไปยัง smart contract (ใช้ฟังก์ชัน click เหมือนกัน)
      const tx = await contract.click();
      setPendingTransactions((prev) => new Set(prev).add(tx.hash));
      toast.info("Gm transaction sent. Waiting for confirmation...");

      // รอให้ transaction สำเร็จ
      const receipt = await waitForTransaction(tx);

      if (receipt.status === 1) {
        // อัพเดทข้อมูล on-chain
        await loadBlockchainData();
        
        // บันทึกข้อมูล Gm ลงใน local storage
        await gmToday();

        // แสดงข้อความสำเร็จพร้อมลิงก์ไปยัง block explorer
        toast.success(
          <div>
            Gm recorded! 🌞 Streak: {checkInStreak + 1} days
            <br />
            <a
              href={`https://sepolia.tea.xyz/tx/${tx.hash}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#4fd1c5" }}
            >
              View Transaction
            </a>
          </div>
        );

        // เพิ่มจำนวนคลิกวันนี้ด้วย เนื่องจากใช้ฟังก์ชัน click เหมือนกัน
        const userAddress = await signer.getAddress();
        setMyTodayClicks((prev) => {
          const next = prev + 1;
          localStorage.setItem(`myTodayClicks_${userAddress}`, next.toString());
          return next;
        });
      }

      // ลบ transaction ออกจากรายการ pending
      setPendingTransactions((prev) => {
        const next = new Set(prev);
        next.delete(tx.hash);
        return next;
      });
    } catch (txError) {
      console.error("Gm error:", txError);
      
      // ลบ pending status
      setPendingTransactions((prev) => {
        const next = new Set(prev);
        if (txError.hash) next.delete(txError.hash);
        return next;
      });
      
      // จัดการข้อผิดพลาด RPC
      if (txError.message && txError.message.includes("HTTP request failed")) {
        toast.error("Network connection error. Please try again later.");
      } else if (txError.code === "ACTION_REJECTED") {
        toast.error("Gm transaction rejected");
      } else if (txError.code === "INSUFFICIENT_FUNDS") {
        toast.error("Not enough TEA for gas");
      } else {
        toast.error("Gm transaction failed. Please try again.");
      }
    }
  };

  // ───────────────────────────────────────────────────────────────────
  // ฟังก์ชันรอการทำธุรกรรมพร้อมการจัดการข้อผิดพลาด
  // ───────────────────────────────────────────────────────────────────
  const waitForTransaction = async (tx) => {
    let retries = 0;
    const maxRetries = 2;
    const retryDelay = 15000; // 15 วินาที
    
    while (retries < maxRetries) {
      try {
        // รอให้ transaction สำเร็จ
        const receipt = await tx.wait();
        return receipt;
      } catch (error) {
        retries++;
        console.error(`Transaction wait error (attempt ${retries}/${maxRetries}):`, error);
        
        // ถ้าเป็นข้อผิดพลาด RPC ให้รอและลองใหม่
        if (error.message && error.message.includes("HTTP request failed")) {
          console.log(`RPC request failed. Retrying in ${retryDelay/1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
        
        // ถ้าเป็นข้อผิดพลาดอื่นๆ ให้โยนข้อผิดพลาดนั้นออกไป
        throw error;
      }
    }
    
    // ถ้าลองซ้ำครบแล้วยังไม่สำเร็จ ให้โยนข้อผิดพลาด
    throw new Error(`Failed to get transaction receipt after ${maxRetries} attempts`);
  };

  // ───────────────────────────────────────────────────────────────────
  // Render UI
  // ───────────────────────────────────────────────────────────────────
  return (
    <div className="app-container">
      {/* ปุ่ม mute/unmute เสียง */}
      <div className="sound-control">
        <button
          className="glass-button icon-button"
          onClick={() => setIsMuted(!isMuted)}
        >
          {isMuted ? "🔇" : "🔊"}
        </button>
      </div>

      {/* Left Stats Panel */}
      <div className="left-panel">
        <div className="stats-panel glass-panel">
          <div className="stats-header">
            <h2>
              <div className="stats-icon">
                <div className="bar"></div>
                <div className="bar"></div>
                <div className="bar"></div>
              </div>
            </h2>
          </div>
          
          <div className="stats-content">
            <div className="stat-item">
              <span>Total Users</span>
              <span className="stat-value">{totalUsers.toLocaleString()}</span>
            </div>
            <div className="stat-item">
              <span>Total Clicks</span>
              <span className="stat-value">{totalClicks.toLocaleString()}</span>
            </div>
            <div className="stat-item">
              <span>Total Gm's</span>
              <span className="stat-value">
                {totalSystemCheckIns.toLocaleString()}
              </span>
            </div>

            {showFullStats && (
              <>
                <div className="stat-item">
                  <span>Your Clicks</span>
                  <span className="stat-value">{myClicks.toLocaleString()}</span>
                </div>
                <div className="stat-item">
                  <span>Today's Clicks</span>
                  <span className="stat-value">{myTodayClicks}</span>
                </div>
                <div className="stat-item">
                  <span>Gm Streak</span>
                  <span className="stat-value">
                    {checkInStreak} days {checkedInToday && "✓"}
                  </span>
                </div>
                <div className="stat-item">
                  <span>Your Gm's</span>
                  <span 
                    className="stat-value" 
                    title={`Last updated: ${new Date().toLocaleString()}`}
                  >
                    {totalCheckIns > 0 ? totalCheckIns : (checkedInToday ? "1" : "0")}
                  </span>
                </div>
              </>
            )}
          </div>

          <button
            className="show-more-button"
            onClick={() => setShowFullStats(!showFullStats)}
          >
            {showFullStats ? "Show Less" : "Show More"}
          </button>
        </div>
      </div>

      {/* Center Panel: Click Button */}
      <div className="center-panel">
        <div className="main-content">
          <div className="click-button-container">
            <button onClick={isConnected ? handleClick : openWalletSelector} className="click-button">
              {isConnected ? "CLICK" : "Connect Wallet"}
            </button>
            {renderPendingTxs()}
          </div>
        </div>
        <div className="bottom-buttons">
          <button 
            className="network-button bottom-btn"
            onClick={addTeaSepoliaNetwork}
          >
            Add Tea Sepolia Network
          </button>
          <button 
            className="tea-button bottom-btn"
            onClick={() => window.open("https://faucet-sepolia.tea.xyz/", "_blank")}
          >
            Get TEA
          </button>
        </div>
      </div>

      {/* Right Panel: Leaderboard */}
      <div className="right-panel">
        <div className="leaderboard-panel">
          <div className="leaderboard-header">
            <h2>🏆 Leaderboard</h2>
            {lastLeaderboardUpdate && (
              <div className="last-update">
                Snapshot is scheduled for 30-04-25 23:11:58 UTC.
              </div>            
            )}
            {isConnected && (
              <div className="user-rank-display">
                <div className="user-rank-position">
                  #{userRank || findUserRankInLeaderboard() || "N/A"}
                </div>
                <div className="user-rank-clicks">{myClicks.toLocaleString()} clicks</div>
                {userRank && Math.ceil(userRank / itemsPerPage) !== currentPage && (
                  <button 
                    className="go-to-rank-btn small"
                    onClick={goToUserRankPage}
                  >
                    Go to my rank
                  </button>
                )}
              </div>
            )}
          </div>
            <div className="leaderboard-footer-text">
          <p>
             👀 Tap dat ass-et up the leaderboard. #1 gets their song featured all month!
          </p>
          <p>
             💡 Keep clicking to climb higher and earn more $ATL tokens!
          </p>
          </div>
          </div>

          <div className="leaderboard-content">
            <div className="leaderboard-header-columns">
              <div className="rank-header">Rank</div>
              <div className="address-header">Address</div>
              <div className="clicks-header">Clicks</div>
            </div>
            <div className="leaderboard-list">
              {currentItems.map((entry, i) => {
                const idx = startIndex + i;
                const isCurrentUser =
                  entry.user.toLowerCase() === signer?.address?.toLowerCase();
                return (
                  <div
                    key={entry.user} 
                    className={[
                      "leaderboard-item",
                      idx < 3 ? `top-${idx + 1}` : "",
                      isCurrentUser ? "current-user" : "",
                    ].join(" ")}
                  >
                    <div className="rank">#{idx + 1}</div>
                    <div className="address">
                      {entry.user.slice(0, 6)}...{entry.user.slice(-4)}
                    </div>
                    <div className="clicks">
                      {Number(entry.clicks).toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
              <div className="pagination">
      <button 
        className="pagination-btn" 
        onClick={prevPage}
        disabled={currentPage <= 1}
      >
        ◀
      </button>
      <span>Page {currentPage} of {totalPages}</span>
      <button 
        className="pagination-btn" 
        onClick={nextPage}
        disabled={currentPage >= totalPages}
      >
        ▶
      </button>
    </div>

    {renderCheckInModal()}
    <WalletSelectorModal />
    <ToastContainer position="bottom-left" theme="dark" />
    <Analytics />

const App = () => {
  return (
    <div className="app-container">
      {/* Social Links */}
      <div className="social-links">
        <a
          href="https://x.com/atl5d"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="X (Twitter)"
        >
          <FaXTwitter />
        </a>
      </div>
    </div>
  );
};

export default App;
