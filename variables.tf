variable "google_auth_token" {
  description = "Content file .clasprc.json"
  type        = string
  sensitive   = true
}

variable "github_token" {
  description = "GitHub personal access token for CodeBuild"
  type        = string
  sensitive   = true
}