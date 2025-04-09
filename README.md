# Click Onchain

**Click Onchain** is a decentralized click game built on the Tea Sepolia Testnet. In this DApp, users click a button to increase their on-chain click count, and their clicks are recorded on a smart contract. The leaderboard data is retrieved from the smart contract via the `getLeaderboard()` function and then updated off-chain by saving the data as a JSON file. This approach ensures that the app remains responsive even when handling a large number of users.

## Features

- **Clicking Mechanism:** Users can click a button to increase their count on the smart contract.
- **Leaderboard Display:** Leaderboard data is fetched from the smart contract using `getLeaderboard()` and stored in `public/leaderboard.json` for fast, off-chain access.
- **Audio Effects:** Background music (BGM) and click sound effects are integrated using HTML Audio APIs and React.
- **Wallet Connectivity:** The DApp supports MetaMask for wallet connection and transaction signing.
- **Deployment on Vercel with Custom Domain:** The app is deployed on Vercel and linked with a custom domain (e.g., clickonchain.xyz).
- **PWA Support:** Includes a `manifest.json` file to enable the web app to be installed on mobile devices.

## Technologies

- **React** – Used for building the user interface.
- **Ethers.js** – For connecting with the smart contract and making blockchain RPC calls.
- **MetaMask** – For wallet connectivity and signing transactions.
- **Alchemy RPC (or Public RPC)** – For connecting to the Tea Sepolia Testnet.
- **Node.js** – Used to run the leaderboard update script (`updateLeaderboard.js`).

## File Structure
