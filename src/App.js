import React, { useState, useEffect, useRef } from 'react';
import { BrowserProvider, Contract } from 'ethers';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';
import abi from './ClickCounterABI.json';
import bgMusicFile from './assets/sounds/dont-talk.mp3';
import clickSoundFile from './assets/effects/click.mp3';

const CONTRACT_ADDRESS = '0x0b9eD03FaA424eB56ea279462BCaAa5bA0d2eC45';
const TEA_CHAIN_ID_HEX = '0x27EA'; // Tea Sepolia (10218)

function App() {
  // ──────────────────────────────── state ────────────────────────────────
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);

  const [totalClicks, setTotalClicks] = useState(0);
  const [myClicks, setMyClicks] = useState(0);

  const [leaderboard, setLeaderboard] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [userRank, setUserRank] = useState(null);

  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  const bgMusicRef = useRef(null);
  const clickAudioRef = useRef(null);

  const [pendingTransactions, setPendingTransactions] = useState(new Set());

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const [myTodayClicks, setMyTodayClicks] = useState(0);

  // ──────────────────────── bootstrap background audio ───────────────────
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
      bgMusicRef.current.play().catch(err =>
        console.log('BGM autoplay blocked:', err)
      );
    }
  }, [isMuted]);

  // ─────────────────────── pull cached leaderboard (off‑chain) ───────────
  const loadOffChainLeaderboard = async () => {
    try {
      const res = await fetch('/leaderboard.json');
      if (!res.ok) throw new Error('Failed to fetch leaderboard.json');

      const data = await res.json(); // [{ user, clicks }, …]
      data.sort((a, b) => Number(b.clicks) - Number(a.clicks));

      setLeaderboard(data);
      setTotalUsers(data.length);

      // ถ้ามี signer เราจะคำนวณ rank ทันที
      if (signer) {
        const addr = await signer.getAddress();
        const rank = data.findIndex(
          x => x.user.toLowerCase() === addr.toLowerCase()
        ) + 1;
        setUserRank(rank > 0 ? rank : null);
      }
    } catch (err) {
      console.error(err);
      toast.error('Unable to load offline leaderboard.');
    }
  };

  // ─────────────────────── ensure MetaMask is on Tea Sepolia ─────────────
  const setupNetwork = async () => {
    if (!window.ethereum) {
      toast.error('Please install MetaMask!');
      return false;
    }
    try {
      const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (currentChainId !== TEA_CHAIN_ID_HEX) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: TEA_CHAIN_ID_HEX }],
          });
        } catch {
          toast.error('Please switch to Tea Sepolia manually');
          return false;
        }
      }
      return true;
    } catch {
      toast.error('Network setup failed');
      return false;
    }
  };

  // ─────────────────────── read on‑chain stats ───────────────────────────
  const loadBlockchainData = async () => {
    try {
      const prov = new BrowserProvider(window.ethereum);
      const sign = await prov.getSigner();
      const cont = new Contract(CONTRACT_ADDRESS, abi, sign);

      setProvider(prov);
      setSigner(sign);
      setContract(cont);

      const addr = await sign.getAddress();
      const [total, mine] = await Promise.all([
        cont.totalClicks(),
        cont.userClicks(addr),
      ]);

      setTotalClicks(Number(total));
      setMyClicks(Number(mine));
      setIsConnected(true);
      return true;
    } catch {
      toast.error('Unable to load data.');
      return false;
    }
  };

  // ─────────────────────── connect wallet & sync data ────────────────────
  const connectWallet = async () => {
    try {
      // Un‑mute BGM on first user gesture
      if (bgMusicRef.current) {
        bgMusicRef.current.muted = false;
        setIsMuted(false);
        try { await bgMusicRef.current.play(); } catch {}
      }

      await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (!(await setupNetwork())) return;
      if (!(await loadBlockchainData())) return;

      // ไม่ต้องเรียก loadOffChainLeaderboard ที่นี่อีก เพราะจะเรียกใน useEffect ด้านล่าง
      toast.success('Connected successfully! 🎉');
    } catch (err) {
      if (err.code === 4001) toast.error('Connection rejected by user');
      else toast.error('Connection failed');
    }
  };

  // ─────────────────────── main click handler ────────────────────────────
  const handleClick = async () => {
    // sfx
    if (clickAudioRef.current) {
      clickAudioRef.current.currentTime = 0;
      clickAudioRef.current.play().catch(() => {});
    }

    if (!isConnected) {
      await connectWallet();
      return;
    }
    if (!contract || !signer) {
      toast.error('Contract or signer not ready');
      return;
    }

    try {
      if (!(await setupNetwork())) return;

      const tx = await contract.click();
      setPendingTransactions(prev => new Set(prev).add(tx.hash));
      toast.info('Transaction sent');

      const receipt = await tx.wait();
      if (receipt.status === 1) {
        await loadBlockchainData();
        toast.success(
          <div>
            Click confirmed! 🎉<br />
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

        // Track today’s clicks locally
        setMyTodayClicks(prev => {
          const next = prev + 1;
          localStorage.setItem('myTodayClicks', next.toString());
          return next;
        });
      }

      setPendingTransactions(prev => {
        const next = new Set(prev);
        next.delete(tx.hash);
        return next;
      });
    } catch (err) {
      if (err.code === 'ACTION_REJECTED')       toast.error('Transaction rejected');
      else if (err.code === 'INSUFFICIENT_FUNDS') toast.error('Not enough TEA for gas');
      else                                       toast.error('Transaction failed');
    }
  };

  // ─────────────────────── auto‑connect if possible ──────────────────────
  useEffect(() => {
    loadTodayClicksFromLocal();

    if (!window.ethereum) { // no MetaMask
      loadOffChainLeaderboard();
      return;
    }

    window.ethereum.request({ method: 'eth_accounts' }).then(accs => {
      accs.length ? connectWallet() : loadOffChainLeaderboard();
    });

    const handleChainChange = async id => {
      if (id !== TEA_CHAIN_ID_HEX) {
        setIsConnected(false);
        toast.error('Please switch to Tea Sepolia');
      } else {
        await loadBlockchainData();
        loadOffChainLeaderboard();
      }
    };

    const handleAccountsChange = async accs => {
      if (accs.length === 0) setIsConnected(false);
      else {
        await loadBlockchainData();
        loadOffChainLeaderboard();
      }
    };

    window.ethereum.on('chainChanged', handleChainChange);
    window.ethereum.on('accountsChanged', handleAccountsChange);

    return () => {
      window.ethereum.removeListener('chainChanged', handleChainChange);
      window.ethereum.removeListener('accountsChanged', handleAccountsChange);
    };
  }, []);

  // ─────────────────────── useEffect เพื่อตรวจจับการเชื่อมต่อ wallet และ signer ──────────────
  useEffect(() => {
    if (isConnected && signer) {
      // เมื่อเชื่อมต่อ wallet แล้วและ signer พร้อม ให้โหลด leaderboard เพื่อคำนวณ "Your Rank"
      loadOffChainLeaderboard();
    }
  }, [isConnected, signer]);

  // ─────────────────────── local “today” counter ─────────────────────────
  const loadTodayClicksFromLocal = () => {
    const storedDate = localStorage.getItem('clickDate');
    const storedValue = localStorage.getItem('myTodayClicks');
    const today = new Date().toDateString();

    if (storedDate === today && storedValue) setMyTodayClicks(+storedValue);
    else {
      localStorage.setItem('clickDate', today);
      localStorage.setItem('myTodayClicks', '0');
      setMyTodayClicks(0);
    }
  };

  // ─────────────────────── helper: pending‑tx badge ──────────────────────
  const renderPendingTxs = () => {
    const count = pendingTransactions.size;
    return count ? (
      <div className="pending-tx-indicator">
        {count} pending {count === 1 ? 'transaction' : 'transactions'}…
      </div>
    ) : null;
  };

  // ─────────────────────── pagination utils ──────────────────────────────
  const totalPages = Math.ceil(leaderboard.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentItems = leaderboard.slice(startIndex, startIndex + itemsPerPage);

  const nextPage = () => currentPage < totalPages && setCurrentPage(p => p + 1);
  const prevPage = () => currentPage > 1 && setCurrentPage(p => p - 1);

  // ─────────────────────── add Tea Sepolia to MetaMask ───────────────────
  const addTeaSepoliaNetwork = async () => {
    try {
      if (!window.ethereum) {
        toast.error('Please install MetaMask!');
        return;
      }
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x27ea',
          chainName: 'Tea Sepolia',
          nativeCurrency: { name: 'TEA', symbol: 'TEA', decimals: 18 },
          rpcUrls: ['https://tea-sepolia.g.alchemy.com/public'],
          blockExplorerUrls: ['https://sepolia.tea.xyz'],
        }],
      });
      toast.success('Tea Sepolia added!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to add Tea Sepolia');
    }
  };

  // ─────────────────────── render ────────────────────────────────────────
  return (
    <div className="app-container">
      {/* mute/unmute */}
      <div className="sound-control">
        <button className="glass-button icon-button" onClick={() => setIsMuted(!isMuted)}>
          {isMuted ? '🔇' : '🔊'}
        </button>
      </div>

      {/* left stats */}
      <div className="left-panel">
        <div className="stats-panel glass-panel">
          <div className="stat-item"><span>Total Users</span><span className="stat-value">{totalUsers.toLocaleString()}</span></div>
          <div className="stat-item"><span>Total Clicks</span><span className="stat-value">{totalClicks.toLocaleString()}</span></div>
          <div className="stat-item"><span>Your Clicks</span><span className="stat-value">{myClicks.toLocaleString()}</span></div>
          <div className="stat-item"><span>Today's Clicks</span><span className="stat-value">{myTodayClicks}</span></div>
        </div>
      </div>

      {/* center click‑area */}
      <div className="center-panel">
        <div className="main-content">
          <div className="click-button-container">
            <button onClick={handleClick} className="click-button">
              {isConnected ? 'CLICK' : 'Connect Wallet'}
            </button>
          </div>
          {renderPendingTxs()}
        </div>
      </div>

      {/* right leaderboard */}
      <div className="right-panel">
        <div className="leaderboard-panel">
          <div className="leaderboard-header"><h2>🏆 Leaderboard</h2></div>

          {isConnected && userRank > 0 && (
            <div className="user-rank">
              <div className="rank-label">Your Rank</div>
              <div className="rank-number">#{userRank}</div>
              <div className="rank-clicks">{myClicks.toLocaleString()} clicks</div>
            </div>
          )}

          <div className="leaderboard-list">
            {currentItems.map((e, i) => {
              const idx = startIndex + i;
              return (
                <div
                  key={e.user}
                  className={[
                    'leaderboard-item',
                    idx < 3 ? `top-${idx + 1}` : '',
                    e.user.toLowerCase() === signer?.address?.toLowerCase() ? 'current-user' : '',
                  ].join(' ')}
                >
                  <div className="rank">#{idx + 1}</div>
                  <div className="address">{e.user.slice(0, 6)}…{e.user.slice(-4)}</div>
                  <div className="clicks">{Number(e.clicks).toLocaleString()}</div>
                </div>
              );
            })}
          </div>

          <div className="pagination-controls">
            <button onClick={prevPage} disabled={currentPage === 1} className="page-button">←</button>
            <span className="page-info">Page {currentPage} of {totalPages}</span>
            <button onClick={nextPage} disabled={currentPage === totalPages} className="page-button">→</button>
          </div>
        </div>

        {/* faucet / add network */}
        <div className="network-info">
          <a href="https://faucet-sepolia.tea.xyz/" target="_blank" rel="noopener noreferrer" className="faucet-link">
            Get TEA
          </a>
          <button onClick={addTeaSepoliaNetwork} className="add-network-button">
            Add Tea Sepolia Network
          </button>
        </div>
      </div>

      <ToastContainer position="bottom-left" autoClose={5000} />
    </div>
  );
}

export default App;
