# 1. Tạo Secret trong Secrets Manager để chứa file .clasprc.json
resource "aws_secretsmanager_secret" "clasp_auth" {
  name        = "clasp/auth/google"
  description = "Token Login Google Apps Script"
}

#1.1 Add Instance
resource "aws_instance" "my_instance" {
  ami           = "ami-005c9e06a21d032e4" # Bạn tự điền AMI của bạn
  instance_type = "t2.micro"
  
  # Gắn Instance Profile vào đây
  iam_instance_profile = aws_iam_instance_profile.ec2_profile.name

  # Đây là bước "injection" secret vào file
  user_data = <<-EOF
              #!/bin/bash
              # Cài đặt công cụ cần thiết (đảm bảo instance có awscli và jq)
              sudo apt-get update && sudo apt-get install -y awscli jq
              
              # Lấy secret từ AWS và lưu vào .clasprc.json
              aws secretsmanager get-secret-value \
                --secret-id ${aws_secretsmanager_secret.clasp_auth.name} \
                --query SecretString --output text > /home/ubuntu/.clasprc.json
              
              # Cấp quyền cho user (giả sử là ubuntu)
              chown ubuntu:ubuntu /home/ubuntu/.clasprc.json
              EOF
}


resource "aws_secretsmanager_secret_version" "clasp_auth_val" {
  secret_id     = aws_secretsmanager_secret.clasp_auth.id
  secret_string = var.google_auth_token
}

# 2. Tạo IAM Role cho CodeBuild (để nó có quyền bốc cái Secret ở trên)
resource "aws_iam_role" "codebuild_role" {
  name = "gemini_automation_codebuild_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "codebuild.amazonaws.com"
        }
      }
    ]
  })
}

# 3. Cấp quyền cho Role được phép đọc Secret
resource "aws_iam_role_policy" "codebuild_policy" {
  role = aws_iam_role.codebuild_role.name
  name = "codebuild_secret_policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action   = ["secretsmanager:GetSecretValue"]
        Effect   = "Allow"
        Resource = [aws_secretsmanager_secret.clasp_auth.arn]
      },
      {
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Effect   = "Allow"
        Resource = ["*"]
      }
    ]
  })
}

# 4. Tạo Project CodeBuild
resource "aws_codebuild_project" "gemini_deploy" {
  name          = "gemini-gas-deploy"
  service_role  = aws_iam_role.codebuild_role.arn

  artifacts {
    type = "NO_ARTIFACTS"
  }

  environment {
    compute_type                = "BUILD_GENERAL1_SMALL"
    image                       = "aws/codebuild/standard:7.0" # Có sẵn Node.js
    type                        = "LINUX_CONTAINER"
    privileged_mode             = false

    # Gắn Secret vào biến môi trường luôn
    environment_variable {
      name  = "CLASP_AUTH"
      value = aws_secretsmanager_secret.clasp_auth.name
      type  = "SECRETS_MANAGER"
    }
  }

  source {
    type            = "GITHUB"
    location        = "https://github.com/jackdack0102/gemini-finance-automation.git"
    git_clone_depth = 1
  }
}

# 5. Tạo Role cho EC2
resource "aws_iam_role" "ec2_role" {
  name = "gemini_ec2_clasp_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

# 6. Cấp quyền cho Role này được đọc Secret cụ thể
resource "aws_iam_role_policy" "ec2_secret_policy" {
  role = aws_iam_role.ec2_role.id
  name = "ec2_secret_policy"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action   = ["secretsmanager:GetSecretValue"]
      Effect   = "Allow"
      Resource = [aws_secretsmanager_secret.clasp_auth.arn]
    }]
  })
}

# 7. Tạo Instance Profile (cái này dùng để gắn vào EC2)
resource "aws_iam_instance_profile" "ec2_profile" {
  name = "gemini_ec2_profile"
  role = aws_iam_role.ec2_role.name
}

