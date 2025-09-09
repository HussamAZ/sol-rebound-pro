# Policy for the Sol Rebound Pro Backend on Mainnet

# Allow read access to the Main Treasury Mainnet wallet private key
path "secret/data/solana/main_treasury_mainnet" {
  capabilities = ["read"]
}

# Allow read access to the Admin Authority Mainnet wallet private key
path "secret/data/solana/admin_authority_mainnet" {
  capabilities = ["read"]
}

# Allow read access to the server-hot-wallet private key
path "secret/data/solana/server-hot-wallet" {
  capabilities = ["read"]
}
