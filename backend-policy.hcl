# D:\sol rebound pro\backend-policy.hcl (النسخة المصححة)

# path "secret/data/..." هو المسار الصحيح لـ kv-v2 عند تعريف السياسات
# للوصول إلى البيانات المخزنة بواسطة `vault kv put secret/your-secret-name ...`

path "secret/data/main-treasury-wallet" {
  capabilities = ["read"]
}

path "secret/data/admin-authority-wallet" {
  capabilities = ["read"]
}

path "secret/data/server-hot-wallet" {
  capabilities = ["read"]
}