# Sol Rebound Pro 🪙✨

**Sol Rebound Pro** is a cutting-edge decentralized application (dApp) built on the Solana network, designed to empower the Solana community. It provides users with a seamless way to discover and close their empty Associated Token Accounts (ATAs), allowing them to recover SOL locked for rent. Beyond basic rent recovery, Sol Rebound Pro features a sophisticated referral system and automated weekly rewards, creating ongoing earning opportunities and fostering a vibrant, engaged ecosystem.

*(This project is proprietary. Usage, redistribution, or modification of this code requires explicit permission from the project owner.)*

---

## Table of Contents

1.  [Vision: Empowering the Solana Community](#vision-empowering-the-solana-community)
2.  [Key Features](#key-features)
3.  [Financial Logic & Fund Flow](#financial-logic--fund-flow)
    *   [User Transactions (ATA Closing)](#user-transactions-ata-closing)
    *   [Weekly Rewards Distribution](#weekly-rewards-distribution)
    *   [Treasury Sweep](#treasury-sweep)
4.  [Project Wallets](#project-wallets)
5.  [Tech Stack Overview](#tech-stack-overview)
6.  [Prerequisites](#prerequisites)
7.  [Getting Started (Local Setup)](#getting-started-local-setup)
    *   [1. Clone the Repository (Optional)](#1-clone-the-repository-optional)
    *   [2. Create Required Keypair Files](#2-create-required-keypair-files)
    *   [3. Configure Root `.env` File](#3-configure-root-env-file)
    *   [4. Initial Vault Setup (One-Time)](#4-initial-vault-setup-one-time)
    *   [5. Build and Run All Services](#5-build-and-run-all-services)
    *   [6. Accessing the Application](#6-accessing-the-application)
    *   [7. Viewing Logs](#7-viewing-logs)
    *   [8. Stopping the Application](#8-stopping-the-application)
8.  [Running Tests](#running-tests)
    *   [Backend Tests](#backend-tests)
    *   [Frontend Tests](#frontend-tests)
    *   [Smart Contract Tests](#smart-contract-tests)
9.  [Project Structure Overview](#project-structure-overview)
10. [API Endpoints (Brief)](#api-endpoints-brief)
    *   [Key Public Endpoints](#key-public-endpoints)
    *   [Debug Controller Endpoints](#debug-controller-endpoints)
11. [Contributing](#contributing)
12. [License](#license)

---

## 1. Vision: Empowering the Solana Community

Sol Rebound Pro aims to:
*   **Return Value:** Help users reclaim "forgotten" SOL from empty ATAs.
*   **Create Opportunities:** Provide continuous earning potential through a fair referral system and automated weekly rewards for active platform contributors.
*   **Enhance Efficiency:** Reduce blockchain bloat by facilitating the closure of unused accounts.
*   **Foster Engagement:** Build a more active, informed, and collaborative Solana community.

## 2. Key Features

*   **Automatic Discovery:** Instantly finds all empty ATAs associated with the user's connected wallet.
*   **Selective Batch Closing:** Users can select specific ATAs or all detected empty ATAs for efficient closing.
*   **Direct Rent Recovery:** Recovered SOL (minus fees) is sent directly back to the user's wallet during the closing transaction.
*   **Sophisticated Referral System:**
    *   Users get a unique referral link.
    *   Referrers earn a commission (25% of the platform fee, which is 6.25% of the recovered rent) directly from the referred user's closing transaction, paid to the *original referrer* who introduced the user to the platform.
    *   Referral relationships are durably recorded upon a new user's first interaction.
*   **Automated Weekly Rewards:**
    *   **Top Referrers:** The top 10 users who refer the most new, active users (based on total lifetime referrals) share 1% of the total platform earnings accumulated during the previous week.
    *   **Top Closers:** The top 10 users who close the most ATAs (based on weekly closed accounts count) share another 1% of the total platform earnings from the previous week.
    *   Rewards are distributed automatically every Saturday directly from the Main Treasury Wallet, authorized by the Admin Authority, via the smart contract.
*   **Transparent Leaderboards:** Weekly leaderboards display top performers for referrals and ATA closing, encouraging friendly competition.
*   **Project Impact Stats:** Publicly visible statistics showcasing the platform's contribution (total ATAs closed, SOL recovered for users, etc.).
*   **User-Friendly Interface:** Intuitive design with seamless wallet integration (e.g., Phantom), including mobile support and guidance.
*   **Countdown Timer:** Displays time remaining until the next weekly reward distribution.
*   **FAQ Section:** Provides answers to common questions.

## 3. Financial Logic & Fund Flow

The platform's financial mechanics are designed for transparency and to reward user participation.

### User Transactions (ATA Closing)

When a user closes one or more empty ATAs:
1.  **Rent Recovery:** The user recovers the full rent amount (approx. 0.00203928 SOL per ATA) initially.
2.  **Platform Fee:** A platform fee of 25% of the recovered rent is charged.
3.  **Referral Commission (if applicable):**
    *   If the user was referred by an *original referrer* (recorded in the database):
        *   **25% of the platform fee** (i.e., 6.25% of the total recovered rent) is transferred *directly from the user's closing transaction to the original referrer's wallet*. This is handled by the `close_multiple_atas` instruction in the smart contract.
        *   The remaining **75% of the platform fee** (i.e., 18.75% of the total recovered rent) is transferred *directly from the user's closing transaction to the Main Treasury Wallet (`C3uy...R2r`)*.
    *   If the user has no original referrer:
        *   The **entire platform fee (25% of the recovered rent)** is transferred *directly from the user's closing transaction to the Main Treasury Wallet (`C3uy...R2r`)*.
4.  **Net to User:** The user receives the recovered rent minus the total platform fee and standard Solana network transaction fees.
5.  **Database Update:** The backend records the net amount received by the Main Treasury in the `platformearnings` collection for weekly reward calculations. User and referrer statistics (closed accounts, earnings, referral counts) are updated.

### Weekly Rewards Distribution (Saturdays, ~23:40 & ~23:45 GMT)

1.  **Calculate Total Weekly Earnings:** The backend's Cron job sums up all `platformearnings` recorded from Sunday 00:00 GMT to Saturday 23:00 GMT of the concluded week.
2.  **Top Referrers Reward Pool:** 1% of the total weekly platform earnings is allocated to this pool.
3.  **Top Closers Reward Pool:** Another 1% of the total weekly platform earnings is allocated to this pool.
4.  **Distribution:**
    *   Each reward pool is divided equally among the top 10 eligible winners in its category.
    *   The `distribute_rewards` instruction in the smart contract is called by the backend.
    *   **Funds Source:** Main Treasury Wallet (`C3uy...R2r`).
    *   **Authorization:** The transaction is signed by the Main Treasury Wallet's keypair AND the Admin Authority's keypair (`2Urh...6f`). (Keys are securely managed in Vault).
    *   Winners are notified via Telegram.

### Treasury Sweep (Mondays, ~00:10 GMT)

1.  After weekly rewards are distributed, a Cron job checks the balance of the Main Treasury Wallet (`C3uy...R2r`).
2.  99% of the *remaining* balance in the Main Treasury Wallet is calculated.
3.  This amount is automatically transferred from the Main Treasury Wallet to the Final Storage Wallet (`6Azd...NK5s`) using a SystemProgram transfer, signed by the Main Treasury Wallet's keypair.

## 4. Project Wallets

*   **User Wallet:** The individual user's connected Solana wallet. Pays transaction fees, platform fees, and receives recovered rent and referral commissions (if they are a referrer).
*   **Referrer Wallet:** The wallet of a user who referred another. Receives referral commissions directly from the referred user's closing transaction.
*   **Main Treasury Wallet (`C3uyWqqRZ8brjHTPZYacxrHfvZYNQjUnza3a9Kui7R2r` - Devnet):**
    *   Receives the platform's share of the fees from user ATA closing transactions.
    *   Acts as the source of funds for weekly reward distributions.
    *   Its keypair is stored in Vault and used by the backend to sign reward distribution and treasury sweep transactions.
*   **Admin Authority Wallet (`2UrhEmCmL7BUheGdECDePZFB24mPbipqYXk2wPqbXa6f` - Devnet):**
    *   This wallet's keypair (stored in Vault) is required to co-sign (authorize) the `distribute_rewards` transactions from the Main Treasury Wallet. It does not hold or transfer funds itself but acts as a necessary authorizer.
*   **Final Storage Wallet (`6Azd4Fyc5jqbQQRLiNRHfnECjCRcgd6yPr1uXk56NK5s` - Devnet):**
    *   The ultimate destination for the platform's net profits after all operational costs (like rewards) are covered. Receives 99% of the Main Treasury's remaining balance weekly. This wallet should ideally be a secure, possibly cold, storage solution.
*   **Program ID (`8RzqAPhqTcGd48DxErKV3PNsvZA7ogxXGwbar6oPhPnW` - Devnet):** The on-chain address of the deployed Sol Rebound Pro smart contract.

*(Note: The "Server Hot Wallet" previously used as an intermediary for rewards has been deprecated to simplify fund flow. The keypair `8NVy...Ai` might still be loaded by the backend as a default Anchor provider wallet but is not actively used in the primary financial logic).*

## 5. Tech Stack Overview

*   **Smart Contract:** Rust, Anchor Framework (v0.30.1), Solana (Targeting Devnet, then Mainnet-beta).
*   **Backend:** Node.js (v22-alpine), Express.js, MongoDB (with Mongoose), `@solana/web3.js` (v1.98.0), `@coral-xyz/anchor` (v0.30.1), Node Cron, Axios, Jest.
*   **Frontend:** React.js (CRA + Craco), `@solana/wallet-adapter-react`, Axios, CSS Modules, React Toastify, React Router DOM.
*   **Secrets Management:** HashiCorp Vault (with AppRole Auth & restricted policies).
*   **Infrastructure & Containers:** Docker, Docker Compose, Nginx (for frontend serving & backend proxy).
*   **Monitoring:** Prometheus, Grafana.

---

## 6. Prerequisites

Before you begin, ensure you have the following installed:
*   **[Docker](https://www.docker.com/products/docker-desktop/) & [Docker Compose](https://docs.docker.com/compose/install/)**: For building and running application containers.
*   **[Node.js and npm](https://nodejs.org/)**: (v18+ recommended) For local dependency management and running scripts.
*   **[Git](https://git-scm.com/)**: (Recommended) For version control.
*   **(Optional) Solana Tool Suite & Anchor CLI**: Only if you intend to build/deploy/test the smart contract directly. ([Solana Install](https://docs.solana.com/cli/install-solana-cli-tools), [Anchor Install](https://www.anchor-lang.com/docs/installation)).

## 7. Getting Started (Local Setup)

Follow these steps to run the project locally for development:

### 1. Clone the Repository (Optional)
If using Git:
```bash
# git clone <your-repository-url>
# cd sol-rebound-pro

Otherwise, ensure you have the complete sol-rebound-pro project folder.
2. Create Required Keypair Files
The backend needs access to the private keys of the Main Treasury Wallet and the Admin Authority Wallet to sign transactions. These keys are stored securely in Vault. For local setup, you'll need the .json keypair files to load them into Vault initially.
Generate or locate your keypair files:
main-treasury-wallet.json (for C3uy...R2r)
admin-authority-wallet.json (for 2Urh...6f)
(Optional: server-hot-wallet.json for 8NVy...Ai if you still wish to load it for the default Anchor provider, though it's not used for primary financial flows anymore).
Place these .json files in the project's root directory (e.g., D:\sol rebound pro\).
IMPORTANT: Add these filenames to your .gitignore file immediately to prevent committing them!


solana-keygen new --outfile main-treasury-wallet.json
solana-keygen new --outfile admin-authority-wallet.json
# solana-keygen new --outfile server-hot-wallet.json

# Get public keys:
solana-keygen pubkey main-treasury-wallet.json # Should match C3uy...R2r for Devnet setup
solana-keygen pubkey admin-authority-wallet.json # Should match 2Urh...6f for Devnet setup

# Airdrop Devnet SOL to these new wallets if you created them:
solana airdrop 2 <main_treasury_public_key> -u d
solana airdrop 2 <admin_authority_public_key> -u d


For the provided Devnet addresses, ensure you have the corresponding private key files.
3. Configure Root .env File
In the project root directory (D:\sol rebound pro), create a .env file with the following content (replace placeholders):


# General
NODE_ENV=development
RPC_URL=https://rpc.ankr.com/solana_devnet/YOUR_ANKR_DEVNET_KEY_SUFFIX # Or your Devnet RPC URL
PROGRAM_ID=8RzqAPhqTcGd48DxErKV3PNsvZA7ogxXGwbar6oPhPnW # Smart Contract Program ID (Devnet)

# Telegram Bot (Required for reward notifications)
TELEGRAM_BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN
TELEGRAM_CHANNEL_ID=@YourTargetTelegramChannelOrChatID # e.g., @SolRebound or -100123...

# Vault AppRole Credentials (Leave empty initially, will be filled after Vault setup)
VAULT_ROLE_ID=
VAULT_SECRET_ID=

# Internal Docker URIs (Usually no need to change these for local Docker setup)
MONGO_URI=mongodb://mongo:27017/referralDB
VAULT_ADDR=http://vault:8200

Note: The backend/.env file also contains some of these variables. The values in the root .env will be passed to the backend container by docker-compose.yml and will override those in backend/.env if defined in both. The ENCRYPTION_KEY is critical and should be defined in backend/.env (as it's copied during Docker build) or passed via docker-compose.yml from the root .env.
4. Initial Vault Setup (One-Time)
This initializes Vault, stores the necessary wallet keypairs, and configures AppRole authentication for the backend.
Requires: The .json keypair files (main-treasury-wallet.json, admin-authority-wallet.json, and optionally server-hot-wallet.json) in the project root.
Steps (Run from the project root directory):
Start Vault Service Only:

docker-compose up -d vault

Wait ~10-20 seconds for Vault to initialize.
Initialize Vault: (Run only the very first time or if Vault data is lost)

docker-compose exec vault vault operator init -key-shares=1 -key-threshold=1

CRITICAL: Save the output! Copy the Unseal Key 1 and Initial Root Token. Store these securely.
Unseal Vault:

docker-compose exec vault vault operator unseal <YOUR_UNSEAL_KEY_1_HERE>

Login with Root Token:

docker-compose exec vault vault login <YOUR_INITIAL_ROOT_TOKEN_HERE>


Enable KV Secrets Engine (v2):

docker-compose exec vault vault secrets enable -path=secret kv-v2

Store Wallet Keys in Vault:
Make sure the .json files are in the project root.

# Main Treasury Wallet
docker-compose exec -T vault vault kv put secret/data/main-treasury-wallet secretKey=@- < ./main-treasury-wallet.json
# Admin Authority Wallet
docker-compose exec -T vault vault kv put secret/data/admin-authority-wallet secretKey=@- < ./admin-authority-wallet.json
# Optional: Server Hot Wallet (if still used for default provider)
# docker-compose exec -T vault vault kv put secret/data/server-hot-wallet secretKey=@- < ./server-hot-wallet.json

Verify (example): docker-compose exec vault vault kv get secret/data/main-treasury-wallet
Enable AppRole Auth Method:

docker-compose exec vault vault auth enable approle

Apply Backend Policy:
The backend-policy.hcl file (already in the root) defines read access to the required secrets.

docker-compose exec -T vault vault policy write backend-policy - < ./backend-policy.hcl

Create AppRole Role:
docker-compose exec vault vault write auth/approle/role/backend-role policies="backend-policy" token_ttl=1h secret_id_ttl=10m

Get RoleID:
docker-compose exec vault vault read auth/approle/role/backend-role/role-id

Copy the role_id value.
Generate SecretID:

docker-compose exec vault vault write -f auth/approle/role/backend-role/secret-id


Copy the secret_id value.
Update Root .env File:
Paste the copied role_id and secret_id into the VAULT_ROLE_ID and VAULT_SECRET_ID variables in your root .env file and save it.
Logout from Vault (Good Practice):


docker-compose exec vault vault token revoke -self


Stop the single Vault container:

docker-compose stop vault


5. Build and Run All Services
Ensure your root .env file is correctly populated (especially VAULT_ROLE_ID and VAULT_SECRET_ID).
From the project root directory:

docker-compose up -d --build


--build: Forces Docker to rebuild images.
-d: Runs containers in detached mode.
This will start all services: frontend, backend, vault, mongo, prometheus, grafana. Vault should unseal automatically using its configuration file if it was previously initialized and its data volume (vault_data) persists.
6. Accessing the Application
Frontend (Sol Rebound Pro dApp): http://localhost:3000
Backend API Docs (Swagger): http://localhost:3000/api-docs (Access through Nginx proxy)
Direct Backend (if needed for debugging, less common): http://localhost:3001/api-docs
Vault UI: http://localhost:8200 (Login with AppRole or Root Token if needed)
Grafana: http://localhost:3003 (Default login: admin/admin)
Prometheus: http://localhost:9090
7. Viewing Logs

docker-compose logs -f <service_name>
# Examples:
# docker-compose logs -f backend
# docker-compose logs -f frontend
# docker-compose logs -f vault

8. Stopping the Application
docker-compose down
# To remove volumes (WARNING: DELETES ALL DATA in Vault, MongoDB, Grafana):
# docker-compose down -v

8. Running Tests
Automated tests are crucial for ensuring the reliability and correctness of Sol Rebound Pro.
Backend Tests
The backend has comprehensive unit and integration tests using Jest.
Navigate to the backend directory:

cd backend

Install dependencies (if not already done for Docker build):

npm install

Run the tests:

npm test

All 39 unit tests and 17 integration tests should pass. These tests use mongodb-memory-server and mock external dependencies like Solana connections and Vault for unit tests, while integration tests verify API flows.




Frontend Tests
The frontend has unit tests for key components using Jest and React Testing Library.
Navigate to the frontend directory:

cd frontend

Install dependencies:

npm install

Run the tests:

npm test


Key components like AtaManager, ReferralDashboard, CountdownTimer, and ProjectStats are covered.
Smart Contract Tests
The smart contract has extensive tests using Anchor's TypeScript/Mocha framework.
Prerequisites for Smart Contract Tests:
Anchor CLI installed.
Solana Tool Suite installed.
A local Solana validator running and configured as per Anchor.toml and test setup.
It's recommended to run the validator manually with pre-loaded accounts and the program deployed:

# From smart-contract/ata-claim directory:
# 1. Ensure keypair files (e.g., test-wallet-account.json, authority-account.json)
#    referenced in Anchor.toml's [[provider.genesis]] exist.
# 2. Build the contract if needed: anchor build
# 3. Start the validator:
solana-test-validator --reset \
  --bpf-program 8RzqAPhqTcGd48DxErKV3PNsvZA7ogxXGwbar6oPhPnW ./target/deploy/ata_claim.so \
  --account FcjMowCRg8NxWriMqiuxAWG1yGXuX2Vg1wHFPeQJkdBm ./test-wallet-account.json \
  --account 2UrhEmCmL7BUheGdECDePZFB24mPbipqYXk2wPqbXa6f ./authority-account.json \
  --slots-per-epoch 32

 (Adjust paths to keypair files and .so file as needed. test-wallet-account.json and authority-account.json are expected by Anchor.toml to be in the ata-claim root).


Running the tests:
Navigate to the smart-contract/ata-claim directory:

cd smart-contract/ata-claim

Install Node.js dependencies for tests:

npm install

Run the Anchor tests (assuming the validator is running separately):

# This command skips Anchor's internal validator management and build/deploy steps
anchor test --skip-build --skip-deploy --skip-local-validator
# OR, if your package.json script handles this:
# npm run test

All 13 test cases covering close_multiple_atas and distribute_rewards (including success and failure scenarios) should pass.




9. Project Structure Overview

sol-rebound-pro/
├── backend/                      # Node.js/Express backend
│   ├── __tests__/                # Jest unit & integration tests
│   ├── config/                   # Config files (DB, Solana, Vault, Constants)
│   ├── controllers/              # API request handlers
│   ├── jobs/                     # Cron job definitions
│   ├── middleware/               # Custom Express middleware
│   ├── models/                   # Mongoose schemas
│   ├── routes/                   # API route definitions
│   ├── services/                 # Core business logic
│   ├── .env                      # Local backend environment variables (Gitignored)
│   ├── ata_claim.json            # Smart contract IDL
│   ├── Dockerfile                # Dockerfile for backend
│   └── package.json
├── frontend/                     # React.js frontend
│   ├── public/                   # Static assets (index.html, images)
│   ├── src/                      # React source code
│   │   ├── api/                  # Axios instance
│   │   ├── assets/               # Static assets for components
│   │   ├── components/           # Reusable React components
│   │   ├── App.js                # Main application component
│   │   └── index.js              # React app entry point
│   ├── .dockerignore             # Files to ignore in Docker build
│   ├── craco.config.js           # Craco configuration (Webpack overrides)
│   ├── Dockerfile                # Dockerfile for frontend (with Nginx)
│   ├── nginx.conf                # Nginx configuration
│   └── package.json
├── smart-contract/               # Rust/Anchor smart contract
│   └── ata-claim/                # Anchor project
│       ├── programs/             # Smart contract Rust code (src/lib.rs)
│       ├── tests/                # Smart contract tests (TypeScript)
│       └── Anchor.toml           # Anchor project configuration
├── .env                          # Root environment variables for Docker Compose (Gitignored)
├── .gitignore                    # Files ignored by Git
├── backend-policy.hcl            # Vault policy for backend AppRole
├── docker-compose.yml            # Docker Compose configuration for all services
├── prometheus.yml                # Prometheus scrape configuration
├── vault-config.hcl              # HashiCorp Vault server configuration
└── README.md                     # This file
      (Keypair .json files for Vault setup should also be in the root and gitignored).




10. API Endpoints (Brief)
The backend API is documented via Swagger at /api-docs when the application is running.
Key Public Endpoints
POST /api/users/initialize: Initializes a user record upon first wallet connection, registers original referrer if present.
POST /api/transactions/prepare-close: Prepares the ATA closing transaction.
POST /api/transactions/confirm-close: Confirms a successful ATA closing transaction and updates backend stats.
GET /api/referrals/info?user=<publicKey>: Retrieves referral and activity stats for a user.
GET /api/leaderboards/top-referrers: Gets the weekly top referrers.
GET /api/leaderboards/top-closers: Gets the weekly top ATA closers.
GET /api/stats/overall: Gets overall platform statistics.
GET /metrics: Prometheus metrics scraping endpoint.
(Note: The /api/referrals/withdraw endpoint, if still present in swagger.json, is deprecated as withdrawals are not handled by user request in the current financial model. Weekly rewards are distributed automatically).
Debug Controller Endpoints
These endpoints are for development and testing purposes ONLY and should be secured or removed in a production environment. They are accessed via POST /api/debug/trigger-job/<jobName>.
<jobName> can be:
top-referrers: Triggers the Top Referrers reward distribution.
top-closers: Triggers the Top Closers reward distribution.
reset-counters: Triggers the reset of weekly counters.
treasury-sweep: Triggers the treasury sweep to the final storage wallet.
11. Contributing
This is a private project. Contributions are not open to the public and require explicit permission and agreement from the project owner.
12. License
Proprietary. All rights reserved. Unauthorized copying, distribution, or modification of this project, in whole or in part, is strictly prohibited.
