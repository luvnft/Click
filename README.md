# Click Counter dApp

Click Counter is a decentralized application (dApp) built on the Tea Sepolia Testnet. This interactive web3 game allows users to click a button to increase their counter on the blockchain, with a live leaderboard showing the top clickers.

![Click Counter dApp](https://example.com/screenshot.png)

## Features

- **Click Counter**: Users can click a button to increase their on-chain count
- **Leaderboard**: Real-time tracking of top users with pagination
- **User Stats**: Track your personal clicks and current rank
- **Wallet Integration**: Seamless connection with MetaMask
- **Sound Effects**: Interactive audio feedback and background music
- **Responsive Design**: Works on desktop and mobile devices
- **Auto-updating Leaderboard**: Data refreshes hourly via GitHub Actions

## Tech Stack

- **Frontend**: React.js
- **Smart Contract**: Solidity on Tea Sepolia Network
- **Web3 Integration**: ethers.js v6
- **Styling**: Custom CSS with glass morphism design
- **Notifications**: react-toastify
- **CI/CD**: GitHub Actions for automatic leaderboard updates

## Getting Started

### Prerequisites

- Node.js (v16 or later)
- MetaMask wallet extension
- Some TEA tokens for gas (available from the [Tea Faucet](https://faucet-sepolia.tea.xyz/))

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/dapp-click-counter.git
   cd dapp-click-counter
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm start
   ```

4. Open your browser and navigate to `http://localhost:3000`

### Connecting to Tea Sepolia

The app includes a button to add the Tea Sepolia network to your MetaMask. Alternatively, you can add it manually with these parameters:

- **Network Name**: Tea Sepolia
- **RPC URL**: https://tea-sepolia.g.alchemy.com/public
- **Chain ID**: 0x27EA (hex) / 10218 (decimal)
- **Currency Symbol**: TEA
- **Block Explorer**: https://sepolia.tea.xyz

## Smart Contract

The core contract is deployed at `0x0b9eD03FaA424eB56ea279462BCaAa5bA0d2eC45` on the Tea Sepolia network.

It tracks:
- Total clicks across all users
- Individual user click counts
- Complete leaderboard data

### Key Functions

- `click()`: Increments a user's click count
- `getLeaderboard()`: Returns all user addresses and their click counts

## Leaderboard Updates

The leaderboard data is updated hourly through:

1. A GitHub Actions workflow that runs `updateLeaderboard.js`
2. The script fetches on-chain data from the smart contract
3. Data is saved to `public/leaderboard.json` with a timestamp
4. The frontend displays this data with the last update time

You can manually update the leaderboard by running:
```bash
npm run update-leaderboard
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [Tea Protocol](https://tea.xyz/) for providing the test network
- All contributors who have helped improve this project
