# D:\sol rebound pro\backend-policy.hcl

# Allow read access ONLY to the specific secret needed by the backend
path "secret/data/server-hot-wallet" {
  capabilities = ["read"]
}
path "secret/data/main-treasury-wallet" { # <-- إضافة جديدة
  capabilities = ["read"]
}

path "secret/data/admin-authority-wallet" { # <-- إضافة جديدة
  capabilities = ["read"]
}