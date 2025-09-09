ui = true
listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = true
}
storage "file" {
  path = "/vault/data/vault_file_storage"
}
disable_mlock = true
api_addr     = "http://vault:8200"
cluster_addr = "http://vault:8201" // استخدم http هنا أيضًا