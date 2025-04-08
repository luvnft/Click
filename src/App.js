import React, { useState, useEffect, useRef } from 'react';
import { BrowserProvider, Contract } from 'ethers';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';
import abi from './ClickCounterABI.json';
import bgMusicFile from './assets/sounds/dont-talk.mp3';
import clickSoundFile from './assets/effects/click.mp3';
import { MdVolumeUp, MdVolumeOff } from 'react-icons/md';

const CONTRACT_ADDRESS = "0x0b9eD03FaA424eB56ea279462BCaAa5bA0d2eC45";
const TEA_CHAIN_ID_HEX = "0x27EA";

function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);

  const [totalClicks, setTotalClicks] = useState(0);
  const [myClicks, setMyClicks] = useState(0);

  // Leaderboard state
  const [leaderboard, setLeaderboard] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [userRank, setUserRank] = useState(null);

  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  // Audio Refs
  const bgMusicRef = useRef(null);
  const clickAudioRef = useRef(null);

  // Pending Tx
  const [pendingTransactions, setPendingTransactions] = useState(new Set());

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Today Click
  const [myTodayClicks, setMyTodayClicks] = useState(0);

  // =====================
  // useEffect: Audio init
  // =====================
  useEffect(() => {
    bgMusicRef.current = new Audio(bgMusicFile);
    bgMusicRef.current.loop = true;
    bgMusicRef.current.muted = isMuted;

    clickAudioRef.current = new Audio(clickSoundFile);

    return () => {
      if (bgMusicRef.current) {
        bgMusicRef.current.pause();
        bgMusicRef.current = null;
      }
      if (clickAudioRef.current) {
        clickAudioRef.current.pause();
        clickAudioRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!bgMusicRef.current) return;
    bgMusicRef.current.muted = isMuted;
    if (!isMuted) {
      bgMusicRef.current.play().catch(err => {
        console.log("Autoplay blocked or error playing BGM:", err);
      });
    }
  }, [isMuted]);

  // =====================================
  // loadOffChainLeaderboard (สำคัญ!)
  // =====================================
  const loadOffChainLeaderboard = async () => {
    try {
      // ดึงไฟล์ leaderboard.json จาก public/ 
      const res = await fetch('/leaderboard.json');
      if (!res.ok) {
        throw new Error('Failed to fetch leaderboard.json');
      }
      const data = await res.json();
      // data เป็น array [{ user: "0x...", clicks: "123" }, ...]

      // เรียงจากมากไปน้อย (ถ้ายังไม่เรียงในไฟล์)
      data.sort((a, b) => Number(b.clicks) - Number(a.clicks));

      setLeaderboard(data);
      setTotalUsers(data.length);

      // คำนวณ rank ของ current user ถ้า signer มี address
      if (signer) {
        const address = await signer.getAddress();
        const rank = data.findIndex(item => 
          item.user.toLowerCase() === address.toLowerCase()
        ) + 1;
        setUserRank(rank || null);
      }

      console.log("Off-chain leaderboard loaded!");
    } catch (error) {
      console.error(error);
      toast.error("Unable to load offline leaderboard.");
    }
  };

  // =====================
  // setupNetwork
  // =====================
  const setupNetwork = async () => {
    if (!window.ethereum) {
      toast.error('Please install MetaMask!');
      return false;
    }
    try {
      const currentChainId = await window.ethereum.request({
        method: 'eth_chainId'
      });

      if (currentChainId !== TEA_CHAIN_ID_HEX) {
        // ...เหมือนเดิม...
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: TEA_CHAIN_ID_HEX }],
          });
        } catch (switchError) {
          // ถ้ามี error code 4902 หรืออื่น ๆ ก็ handle เหมือนเดิม
          toast.error("Please switch to Tea Sepolia network manually");
          return false;
        }
      }
      return true;
    } catch (error) {
      toast.error("Network setup failed");
      return false;
    }
  };

  // =====================
  // loadBlockchainData
  // =====================
  const loadBlockchainData = async () => {
    try {
      const prov = new BrowserProvider(window.ethereum);
      const sign = await prov.getSigner();
      const cont = new Contract(CONTRACT_ADDRESS, abi, sign);

      setProvider(prov);
      setSigner(sign);
      setContract(cont);

      const address = await sign.getAddress();

      // ดึงเฉพาะ totalClicks, userClicks
      const [total, mine] = await Promise.all([
        cont.totalClicks(),
        cont.userClicks(address)
      ]);

      setTotalClicks(Number(total));
      setMyClicks(Number(mine));

      setIsConnected(true);
      return true;
    } catch (error) {
      toast.error("Unable to load data.");
      return false;
    }
  };

  // =====================
  // connectWallet
  // =====================
  const connectWallet = async () => {
    try {
      // เล่น BGM ทันทีที่มี gesture
      if (bgMusicRef.current) {
        bgMusicRef.current.muted = false;
        setIsMuted(false);
        try {
          await bgMusicRef.current.play();
        } catch (err) {
          console.log("Autoplay blocked or error playing music: ", err);
        }
      }

      await window.ethereum.request({ method: 'eth_requestAccounts' });
      const networkSetup = await setupNetwork();
      if (!networkSetup) return;

      const dataLoaded = await loadBlockchainData();
      if (!dataLoaded) return;

      // เมื่อเชื่อมต่อกระเป๋าเสร็จ ก็โหลด leaderboard.json จาก off-chain
      await loadOffChainLeaderboard();

      toast.success("Connected successfully! 🎉");
    } catch (error) {
      if (error.code === 4001) {
        toast.error("Connection rejected by user");
      } else {
        toast.error("Connection failed");
      }
    }
  };

  // =====================
  // handleClick
  // =====================
  const handleClick = async () => {
    if (clickAudioRef.current) {
      clickAudioRef.current.currentTime = 0;
      clickAudioRef.current.play().catch(err => {
        console.log("Cannot play click sound:", err);
      });
    }

    if (!isConnected) {
      await connectWallet();
      return;
    }

    if (!contract || !signer) {
      toast.error("Contract or Signer not ready!");
      return;
    }

    try {
      const networkOk = await setupNetwork();
      if (!networkOk) return;

      const tx = await contract.click();
      setPendingTransactions(prev => new Set(prev).add(tx.hash));

      toast.info("Transaction sent!");
      const receipt = await tx.wait();

      if (receipt.status === 1) {
        await loadBlockchainData(); 
        toast.success(
          <div>
            Click confirmed! 🎉
            <br />
            <a
              href={`https://sepolia.tea.xyz/tx/${tx.hash}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#4fd1c5' }}
            >
              View Transaction
            </a>
          </div>
        );

        // อัปเดต Today's Clicks
        setMyTodayClicks(prev => {
          const newVal = prev + 1;
          localStorage.setItem('myTodayClicks', newVal.toString());
          return newVal;
        });

        // **ถ้าอยากให้ Leaderboard ใน UI อัปเดต "ทันที"** 
        // ก็ต้องไปรัน updateLeaderboard.js ใหม่ + copy ไฟล์ JSON ใหม่
        // หรือเรียก loadOffChainLeaderboard() อีกครั้ง (แต่ data ไม่เปลี่ยนถ้าไฟล์ไม่เปลี่ยน)
        // สำหรับ demo นี้อาจเรียก loadOffChainLeaderboard() ซ้ำ:
        await loadOffChainLeaderboard();
      }

      setPendingTransactions(prev => {
        const newSet = new Set(prev);
        newSet.delete(tx.hash);
        return newSet;
      });
    } catch (error) {
      if (error.code === 'ACTION_REJECTED') {
        toast.error("Transaction rejected by user");
      } else if (error.code === 'INSUFFICIENT_FUNDS') {
        toast.error("Insufficient TEA for gas fees");
      } else {
        toast.error("Transaction failed");
      }
    }
  };

  // =====================
  // useEffect: auto connect
  // =====================
  useEffect(() => {
    loadTodayClicksFromLocal();

    if (window.ethereum) {
      window.ethereum.request({ method: 'eth_accounts' })
        .then(accounts => {
          if (accounts.length > 0) {
            connectWallet();
          } else {
            // ถ้าไม่มี account ก็อาจ loadOffChainLeaderboard() เพื่อโชว์ได้ด้วย
            loadOffChainLeaderboard();
          }
        });

      window.ethereum.on('chainChanged', async (newChainId) => {
        if (newChainId !== TEA_CHAIN_ID_HEX) {
          setIsConnected(false);
          toast.error("Please switch to Tea Sepolia Network");
        } else {
          // chain ถูกเปลี่ยนกลับ -> reload on-chain data
          await loadBlockchainData();
          // แล้วโหลด leaderboard JSON
          await loadOffChainLeaderboard();
        }
      });

      window.ethereum.on('accountsChanged', async (accounts) => {
        if (accounts.length === 0) {
          setIsConnected(false);
        } else {
          await loadBlockchainData();
          await loadOffChainLeaderboard();
        }
      });

      return () => {
        window.ethereum.removeAllListeners('chainChanged');
        window.ethereum.removeAllListeners('accountsChanged');
      };
    } else {
      // ถ้าไม่มี metamask เลย ก็ยังโหลด offchain leaderboard ได้
      loadOffChainLeaderboard();
    }
  }, []);

  // =====================
  // loadTodayClicksFromLocal
  // =====================
  const loadTodayClicksFromLocal = () => {
    const storedDate = localStorage.getItem('clickDate');
    const storedValue = localStorage.getItem('myTodayClicks');
    const currentDate = new Date().toDateString();

    if (storedDate === currentDate && storedValue) {
      setMyTodayClicks(parseInt(storedValue));
    } else {
      localStorage.setItem('clickDate', currentDate);
      localStorage.setItem('myTodayClicks', '0');
      setMyTodayClicks(0);
    }
  };

  // =====================
  // renderPendingTxs
  // =====================
  const renderPendingTxs = () => {
    const count = pendingTransactions.size;
    if (count > 0) {
      return (
        <div className="pending-tx-indicator">
          {count} pending {count === 1 ? 'transaction' : 'transactions'}...
        </div>
      );
    }
    return null;
  };

  // =====================
  // Pagination
  // =====================
  const totalPages = Math.ceil(leaderboard.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = leaderboard.slice(startIndex, endIndex);

  const nextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const prevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  // =====================
  // addTeaSepoliaNetwork
  // =====================
  const addTeaSepoliaNetwork = async () => {
    try {
      if (!window.ethereum) {
        toast.error('Please install MetaMask!');
        return;
      }

      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x27ea', // 10218 in hex
          chainName: 'Tea Sepolia',
          nativeCurrency: {
            name: 'TEA',
            symbol: 'TEA',
            decimals: 18
          },
          rpcUrls: ['https://tea-sepolia.g.alchemy.com/public'],
          blockExplorerUrls: ['https://sepolia.tea.xyz']
        }]
      });
      
      toast.success('Tea Sepolia Network added successfully!');
    } catch (error) {
      console.error('Error adding Tea Sepolia network:', error);
      toast.error('Failed to add Tea Sepolia network');
    }
  };

  // =====================
  // Render
  // =====================
  return (
    <div className="app-container">
      {/* ปุ่มเปิด/ปิดเสียง (BGM) */}
      <div className="sound-control">
        <button
          className="glass-button icon-button"
          onClick={() => setIsMuted(!isMuted)}
        >
          {isMuted ? '🔇' : '🔊'}
        </button>
      </div>

      {/* Left Panel */}
      <div className="left-panel">
        <div className="stats-panel glass-panel">
          <div className="stat-item">
            <span>Total Users</span>
            <span className="stat-value">{totalUsers.toLocaleString()}</span>
          </div>

          <div className="stat-item">
            <span>Total Clicks</span>
            <span className="stat-value">{totalClicks.toLocaleString()}</span>
          </div>

          <div className="stat-item">
            <span>Your Clicks</span>
            <span className="stat-value">{myClicks.toLocaleString()}</span>
          </div>

          <div className="stat-item">
            <span>Today's Clicks</span>
            <span className="stat-value">{myTodayClicks}</span>
          </div>
        </div>
      </div>

      {/* Center Panel */}
      <div className="center-panel">
        <div className="main-content">
          <div className="click-button-container">
            <button
              onClick={handleClick}
              className="click-button"
            >
              {isConnected ? 'CLICK' : 'Connect Wallet'}
            </button>
          </div>

          {renderPendingTxs()}
        </div>
      </div>

      {/* Right Panel - Leaderboard */}
      <div className="right-panel">
        <div className="leaderboard-panel">
          <div className="leaderboard-header">
            <h2>
              <span className="trophy-icon">🏆</span>
              Leaderboard
            </h2>
          </div>

          {isConnected && userRank > 0 && (
            <div className="user-rank">
              <div className="rank-label">Your Rank</div>
              <div className="rank-number">#{userRank}</div>
              <div className="rank-clicks">{myClicks.toLocaleString()} clicks</div>
            </div>
          )}

          <div className="leaderboard-list">
            {currentItems.map((entry, index) => {
              const globalIndex = startIndex + index;
              return (
                <div
                  key={entry.user}
                  className={`leaderboard-item ${
                    globalIndex < 3 ? `top-${globalIndex + 1}` : ''
                  } ${
                    entry.user.toLowerCase() === signer?.address?.toLowerCase()
                      ? 'current-user'
                      : ''
                  }`}
                >
                  <div className="rank">
                    #{globalIndex + 1}
                  </div>
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

          <div className="pagination-controls">
            <button
              onClick={prevPage}
              disabled={currentPage === 1}
              className="page-button"
            >
              ←
            </button>
            <span className="page-info">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={nextPage}
              disabled={currentPage === totalPages}
              className="page-button"
            >
              →
            </button>
          </div>
        </div>

        {/* Faucet Link */}
        <div className="network-info">
          <a
            href="https://faucet-sepolia.tea.xyz/"
            target="_blank"
            rel="noopener noreferrer"
            className="faucet-link"
          >
            Get TEA
          </a>
          <button
            onClick={addTeaSepoliaNetwork}
            className="add-network-button"
          >
            Add Tea Sepolia Network
          </button>
        </div>
      </div>

      <ToastContainer position="bottom-left" autoClose={5000} />
    </div>
  );
}

export default App;
