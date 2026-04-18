variable "google_auth_token" {
  description = "Content file .clasprc.json"
  type        = string
  sensitive   = true # Để Terraform ẩn giá trị này trong log
}